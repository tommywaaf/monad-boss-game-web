/**
 * Cloudflare Function to send 0.1 MON/ETH to a newly created Dynamic wallet via Fireblocks
 */

import { SignJWT, importPKCS8 } from 'jose'

export async function onRequestPost(context) {
  const { request, env } = context

  try {
    // Parse request body
    const body = await request.json()
    const { address } = body

    // Basic address validation (adjust if needed for non-EVM chains)
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      return new Response(
        JSON.stringify({ error: 'Invalid Ethereum address provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const apiKey = env.FIREBLOCKS_API_KEY
    // Normalize \n in secret if pasted as a single line with literal "\n"
    const rawSecret = env.FIREBLOCKS_SECRET_KEY
    const apiSecret = rawSecret ? rawSecret.replace(/\\n/g, '\n') : null

    const sourceVaultId = env.FIREBLOCKS_SOURCE_VAULT_ID || '0'
    const assetId = env.FIREBLOCKS_ASSET_ID || 'ETH' // Change to 'MON' if available in Fireblocks

    console.log('[Fireblocks] Environment check:', {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      sourceVaultId,
      assetId,
    })

    if (!apiKey || !apiSecret) {
      console.error('[Fireblocks] Missing credentials:', {
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
      })
      return new Response(
        JSON.stringify({
          error: 'Fireblocks credentials not configured',
          details: {
            hasApiKey: !!apiKey,
            hasApiSecret: !!apiSecret,
          },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Fireblocks API endpoint
    const fireblocksUrl = 'https://api.fireblocks.io/v1/transactions'

    // Create transaction payload
    const transactionPayload = {
      assetId: assetId,
      amount: '0.1',
      source: {
        type: 'VAULT_ACCOUNT',
        id: sourceVaultId.toString(),
      },
      destination: {
        type: 'ONE_TIME_ADDRESS',
        oneTimeAddress: {
          address: address,
        },
      },
      note: `Welcome bonus: 0.1 ${assetId} to new Dynamic wallet ${address}`,
    }

    // 🔑 Stringify ONCE and reuse everywhere
    const bodyString = JSON.stringify(transactionPayload)
    console.log('[Fireblocks] Creating transaction with payload:', bodyString)

    // Generate JWT token for Fireblocks authentication
    console.log('[Fireblocks] Generating JWT token...')
    const token = await generateFireblocksJWT(
      apiKey,
      apiSecret,
      '/v1/transactions',
      bodyString
    )
    console.log('[Fireblocks] JWT token generated successfully')

    // Create Fireblocks transaction
    console.log('[Fireblocks] Sending request to Fireblocks API...')
    const response = await fetch(fireblocksUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${token}`,
      },
      body: bodyString,
    })

    console.log('[Fireblocks] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Fireblocks] API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      })

      let errorDetails
      try {
        errorDetails = JSON.parse(errorText)
      } catch {
        errorDetails = { message: errorText }
      }

      return new Response(
        JSON.stringify({
          error: 'Failed to create Fireblocks transaction',
          details: errorDetails,
          status: response.status,
          statusText: response.statusText,
        }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const transaction = await response.json()

    return new Response(
      JSON.stringify({
        success: true,
        transactionId: transaction.id,
        status: transaction.status,
        message: 'Transaction created successfully',
        txHash: transaction.txHash,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in fund-wallet function:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: error.stack,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Generate Fireblocks JWT token for authentication.
 * `bodyString` MUST be the exact HTTP body string sent to Fireblocks.
 */
async function generateFireblocksJWT(apiKey, apiSecret, uri, bodyString) {
  try {
    // Quick key format logging
    const isPKCS8 =
      apiSecret.includes('BEGIN PRIVATE KEY') &&
      !apiSecret.includes('BEGIN RSA PRIVATE KEY')

    console.log('[Fireblocks] Key format check:', {
      isPKCS8,
      keyLength: apiSecret.length,
      firstLine: apiSecret.split('\n')[0],
    })

    let privateKey
    try {
      // We only support PKCS#8 in this environment
      privateKey = await importPKCS8(apiSecret, 'RS256')
      console.log('[Fireblocks] Key imported successfully with importPKCS8')
    } catch (keyError) {
      console.error('[Fireblocks] Error importing key:', keyError.message)
      throw new Error(
        `Failed to import private key: ${keyError.message}. ` +
          `Ensure the key is in PKCS#8 format (BEGIN PRIVATE KEY). ` +
          `If you have BEGIN RSA PRIVATE KEY, convert it with openssl pkcs8 -topk8 -nocrypt.`
      )
    }

    // 🔐 Calculate body hash over the EXACT string sent in the HTTP body
    console.log('[Fireblocks] Body string for hash:', bodyString)
    console.log('[Fireblocks] Body string length:', bodyString.length)

    const bodyBytes = new TextEncoder().encode(bodyString)
    const bodyHashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes)
    const bodyHashArray = new Uint8Array(bodyHashBuffer)

    console.log('[Fireblocks] Hash bytes length:', bodyHashArray.length)

    let binary = ''
    for (let i = 0; i < bodyHashArray.length; i++) {
      binary += String.fromCharCode(bodyHashArray[i])
    }

    let base64 = btoa(binary)
    console.log(
      '[Fireblocks] Base64 hash (before base64url):',
      base64.substring(0, 30) + '...'
    )

    const bodyHashBase64 = base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    console.log(
      '[Fireblocks] Body hash (base64url, length:',
      bodyHashBase64.length,
      '):',
      bodyHashBase64
    )

    const now = Math.floor(Date.now() / 1000)
    const exp = now + 120 // 2-minute window to avoid clock skew problems
    const nonce = crypto.randomUUID()

    const payload = {
      uri: uri,
      nonce: nonce,
      iat: now,
      exp: exp,
      sub: apiKey,
      bodyHash: bodyHashBase64,
    }

    console.log('[Fireblocks] JWT payload:', {
      uri,
      nonce,
      iat: now,
      exp: exp,
      sub: apiKey,
      bodyHash: bodyHashBase64.substring(0, 20) + '...',
    })

    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(privateKey)

    console.log('[Fireblocks] JWT token generated (length:', jwt.length, ')')
    return jwt
  } catch (error) {
    console.error('Error generating Fireblocks JWT:', error)
    throw new Error(`Failed to generate JWT token: ${error.message}`)
  }
}
