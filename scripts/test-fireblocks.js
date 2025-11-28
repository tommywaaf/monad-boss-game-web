/**
 * Test script to verify Fireblocks API integration
 * Run with: node scripts/test-fireblocks.js <wallet_address>
 * 
 * Make sure to set environment variables:
 * - FIREBLOCKS_API_KEY
 * - FIREBLOCKS_SECRET_KEY
 * - FIREBLOCKS_SOURCE_VAULT_ID (optional, defaults to 0)
 * - FIREBLOCKS_ASSET_ID (optional, defaults to ETH)
 */

import { SignJWT, importPKCS8 } from 'jose'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') })

const args = process.argv.slice(2)
const testAddress = args[0] || '0x1234567890123456789012345678901234567890'

console.log('🧪 Testing Fireblocks Transaction Creation')
console.log('='.repeat(60))
console.log(`Test Address: ${testAddress}`)
console.log('')

// Get environment variables
const apiKey = process.env.FIREBLOCKS_API_KEY
const apiSecret = process.env.FIREBLOCKS_SECRET_KEY
const sourceVaultId = process.env.FIREBLOCKS_SOURCE_VAULT_ID || '0'
const assetId = process.env.FIREBLOCKS_ASSET_ID || 'ETH'

console.log('📋 Configuration:')
console.log(`  API Key: ${apiKey ? '✅ Set' : '❌ Missing'}`)
console.log(`  Secret Key: ${apiSecret ? '✅ Set' : '❌ Missing'}`)
console.log(`  Source Vault ID: ${sourceVaultId}`)
console.log(`  Asset ID: ${assetId}`)
console.log('')

if (!apiKey || !apiSecret) {
  console.error('❌ Error: FIREBLOCKS_API_KEY and FIREBLOCKS_SECRET_KEY must be set in .env file')
  process.exit(1)
}

// Validate address
if (!testAddress.startsWith('0x') || testAddress.length !== 42) {
  console.error('❌ Error: Invalid Ethereum address')
  process.exit(1)
}

/**
 * Generate Fireblocks JWT token for authentication
 */
async function generateFireblocksJWT(apiKey, apiSecret, uri, requestBody) {
  try {
    console.log('🔐 Generating JWT token...')
    
    // Import the private key
    const privateKey = await importPKCS8(apiSecret, 'RS256')

    // Calculate body hash (SHA-256 of request body)
    const bodyString = JSON.stringify(requestBody)
    const bodyHash = createHash('sha256').update(bodyString).digest()
    const bodyHashBase64 = bodyHash.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    const now = Math.floor(Date.now() / 1000)
    // Generate a random nonce (UUID-like)
    const nonce = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`

    // Create JWT payload
    const payload = {
      uri: uri,
      nonce: nonce,
      iat: now,
      exp: now + 30, // Token expires in 30 seconds
      sub: apiKey,
      bodyHash: bodyHashBase64,
    }

    console.log('  ✓ Body hash calculated')
    console.log('  ✓ Payload created')

    // Sign and create JWT
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(privateKey)

    console.log('  ✓ JWT token generated')
    return jwt
  } catch (error) {
    console.error('❌ Error generating JWT:', error.message)
    throw error
  }
}

/**
 * Create Fireblocks transaction
 */
async function createFireblocksTransaction() {
  try {
    const fireblocksUrl = 'https://api.fireblocks.io/v1/transactions'

    // Create transaction payload
    const transactionPayload = {
      assetId: assetId,
      amount: '1', // 1 MON (or 1 ETH if using ETH asset)
      source: {
        type: 'VAULT_ACCOUNT',
        id: sourceVaultId.toString(),
      },
      destination: {
        type: 'EXTERNAL_WALLET',
        oneTimeAddress: {
          address: testAddress,
        },
      },
      note: `Test transaction: 1 ${assetId} to ${testAddress}`,
    }

    console.log('📦 Transaction Payload:')
    console.log(JSON.stringify(transactionPayload, null, 2))
    console.log('')

    // Generate JWT token
    const token = await generateFireblocksJWT(apiKey, apiSecret, '/v1/transactions', transactionPayload)
    console.log('')

    // Create Fireblocks transaction
    console.log('📤 Sending request to Fireblocks API...')
    console.log(`  URL: ${fireblocksUrl}`)
    
    const response = await fetch(fireblocksUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(transactionPayload),
    })

    console.log(`  Status: ${response.status} ${response.statusText}`)
    console.log('')

    const responseText = await response.text()
    console.log('📥 Response:')
    
    if (!response.ok) {
      console.error('❌ Transaction creation failed!')
      let errorDetails
      try {
        errorDetails = JSON.parse(responseText)
        console.error(JSON.stringify(errorDetails, null, 2))
      } catch {
        console.error(responseText)
      }
      return
    }

    const transaction = JSON.parse(responseText)
    console.log('✅ Transaction created successfully!')
    console.log('')
    console.log('📊 Transaction Details:')
    console.log(`  Transaction ID: ${transaction.id}`)
    console.log(`  Status: ${transaction.status}`)
    console.log(`  Asset: ${transaction.assetId}`)
    console.log(`  Amount: ${transaction.amount}`)
    if (transaction.txHash) {
      console.log(`  TX Hash: ${transaction.txHash}`)
    }
    console.log('')
    console.log('Full response:')
    console.log(JSON.stringify(transaction, null, 2))

  } catch (error) {
    console.error('❌ Error creating transaction:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

// Run the test
createFireblocksTransaction()
  .then(() => {
    console.log('')
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Test failed:', error)
    process.exit(1)
  })

