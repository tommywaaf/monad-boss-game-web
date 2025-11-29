/**
 * Cloudflare Function to send 0.1 MON to a newly created Dynamic wallet via Fireblocks
 * 
 * NOTE: This is a manual JWT implementation. The Python SDK handles this automatically.
 * We're manually implementing JWT signing because Cloudflare Workers can't easily use
 * the Fireblocks Node.js SDK. This requires precise matching of the SDK's behavior.
 * 
 * Environment variables required in Cloudflare Pages:
 * - FIREBLOCKS_API_KEY: Your Fireblocks API key
 * - FIREBLOCKS_SECRET_KEY: Your Fireblocks secret key (the content of the .key file)
 * - FIREBLOCKS_SOURCE_VAULT_ID: Source vault ID (default: 0)
 * - FIREBLOCKS_ASSET_ID: Asset ID (default: ETH)
 * 
 * Note: For Monad network, you may need to configure the asset ID.
 * Check Fireblocks dashboard to see if MON is available or use ETH if compatible.
 */

// Import jose for JWT signing (compatible with Cloudflare Workers)
// Note: jose is installed in package.json
// The Python SDK uses fireblocks_sdk which handles JWT automatically
import { SignJWT, importPKCS8 } from 'jose'

export async function onRequestPost(context) {
  const { request, env } = context

  try {
    // Parse request body
    const body = await request.json()
    const { address } = body

    // Validate address
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      return new Response(
        JSON.stringify({ error: 'Invalid Ethereum address provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const apiKey = env.FIREBLOCKS_API_KEY
    const apiSecret = env.FIREBLOCKS_SECRET_KEY
    const sourceVaultId = env.FIREBLOCKS_SOURCE_VAULT_ID || '0'
    const assetId = env.FIREBLOCKS_ASSET_ID || 'ETH' // Change to 'MON' if available in Fireblocks

    console.log('[Fireblocks] Environment check:', {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      sourceVaultId,
      assetId
    })

    if (!apiKey || !apiSecret) {
      console.error('[Fireblocks] Missing credentials:', {
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret
      })
      return new Response(
        JSON.stringify({ 
          error: 'Fireblocks credentials not configured',
          details: {
            hasApiKey: !!apiKey,
            hasApiSecret: !!apiSecret
          }
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Fireblocks API endpoint
    const fireblocksUrl = 'https://api.fireblocks.io/v1/transactions'

    // Create transaction payload
    // Match the format from the working Python script
    // IMPORTANT: Order of keys matters for consistent JSON stringification
    // The Python SDK might sort keys, so we'll create in a specific order
    const transactionPayload = {
      assetId: assetId,
      amount: '0.1', // 0.1 ETH/MON
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

    // Stringify without spaces to match SDK behavior (compact JSON)
    const payloadString = JSON.stringify(transactionPayload)
    console.log('[Fireblocks] Creating transaction with payload:', payloadString)

    // Generate JWT token for Fireblocks authentication
    console.log('[Fireblocks] Generating JWT token...')
    const token = await generateFireblocksJWT(apiKey, apiSecret, '/v1/transactions', transactionPayload)
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
      body: JSON.stringify(transactionPayload),
    })
    
    console.log('[Fireblocks] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Fireblocks] API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
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
          statusText: response.statusText
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
        txHash: transaction.txHash
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in fund-wallet function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Generate Fireblocks JWT token for authentication
 * Uses the Fireblocks API secret key (RSA private key) to sign a JWT token
 */
async function generateFireblocksJWT(apiKey, apiSecret, uri, requestBody) {
  try {
    // Import the private key using jose library
    const privateKey = await importPKCS8(apiSecret, 'RS256')

    // Calculate body hash (SHA-256 of request body)
    // CRITICAL: Must match exactly what the Python SDK does
    // The SDK uses compact JSON (no spaces) - JSON.stringify does this by default
    const bodyString = JSON.stringify(requestBody)
    console.log('[Fireblocks] Body string for hash:', bodyString)
    console.log('[Fireblocks] Body string length:', bodyString.length)
    
    // Calculate SHA-256 hash
    const bodyBytes = new TextEncoder().encode(bodyString)
    const bodyHashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes)
    const bodyHashArray = new Uint8Array(bodyHashBuffer)
    
    console.log('[Fireblocks] Hash bytes length:', bodyHashArray.length)
    
    // Convert to base64 using the same method as Node.js Buffer.toString('base64')
    // This must match exactly what the test script does
    let binary = ''
    for (let i = 0; i < bodyHashArray.length; i++) {
      binary += String.fromCharCode(bodyHashArray[i])
    }
    
    // Use btoa for base64 encoding (matches Node.js Buffer.toString('base64'))
    let base64 = btoa(binary)
    
    console.log('[Fireblocks] Base64 hash (before base64url):', base64.substring(0, 30) + '...')
    
    // Convert to base64url format (Fireblocks requirement)
    // Replace + with -, / with _, remove padding (=)
    // This MUST match: .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const bodyHashBase64 = base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    
    console.log('[Fireblocks] Body hash (base64url, length:', bodyHashBase64.length, '):', bodyHashBase64)

    const now = Math.floor(Date.now() / 1000)
    const nonce = crypto.randomUUID()

    // Create JWT payload (order matters for Fireblocks)
    const payload = {
      uri: uri,
      nonce: nonce,
      iat: now,
      exp: now + 30, // Token expires in 30 seconds
      sub: apiKey,
      bodyHash: bodyHashBase64,
    }

    console.log('[Fireblocks] JWT payload:', {
      uri,
      nonce,
      iat: now,
      exp: now + 30,
      sub: apiKey,
      bodyHash: bodyHashBase64.substring(0, 20) + '...' // Log first 20 chars
    })

    // Sign and create JWT using jose library
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(privateKey)

    console.log('[Fireblocks] JWT token generated (length:', jwt.length, ')')
    return jwt
  } catch (error) {
    console.error('Error generating Fireblocks JWT:', error)
    throw new Error(`Failed to generate JWT token: ${error.message}`)
  }
}
