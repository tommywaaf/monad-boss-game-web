# Fireblocks Integration Setup

This guide explains how to set up the Fireblocks integration to automatically fund newly created Dynamic wallets with 1 MON.

## Cloudflare Pages Environment Variables

Add these environment variables in your Cloudflare Pages dashboard:

1. **FIREBLOCKS_API_KEY**: Your Fireblocks API key
   - Get this from: Fireblocks Dashboard → Settings → API Users → Your API User → API Key

2. **FIREBLOCKS_SECRET_KEY**: Your Fireblocks secret key (the entire content of your `.key` file)
   - This is the RSA private key file content
   - Copy the entire content including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
   - Paste it as a single-line string (newlines will be preserved)

3. **FIREBLOCKS_SOURCE_VAULT_ID** (optional): Source vault ID
   - Default: `0`
   - The vault account ID to send funds from

4. **FIREBLOCKS_ASSET_ID** (optional): Asset ID for Monad
   - Default: `ETH`
   - Change to `MON` if Fireblocks supports Monad native token
   - Or use `ETH` if Monad uses ETH-compatible addresses

## How It Works

1. User clicks "Create New Wallet" button
2. Dynamic shows authentication flow (email, social login, etc.)
3. User completes authentication and backup phrase flow
4. Dynamic wallet is created automatically
5. After 3 seconds (to allow backup phrase flow to complete), the system:
   - Detects the new wallet address
   - Calls `/api/fund-wallet` Cloudflare Function
   - Function creates a Fireblocks transaction to send 1 MON to the new address
   - Transaction is created and submitted to Fireblocks

## Backup Phrase Flow

The backup phrase flow is part of Dynamic's normal wallet creation process. The funding happens **after** the backup phrase flow completes (3-second delay), so it doesn't interrupt the user experience.

## Testing

### Local Testing Script

You can test the Fireblocks integration locally before deploying:

1. Add your Fireblocks credentials to `.env` file:
   ```
   FIREBLOCKS_API_KEY=your_api_key
   FIREBLOCKS_SECRET_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
   FIREBLOCKS_SOURCE_VAULT_ID=0
   FIREBLOCKS_ASSET_ID=ETH
   ```

2. Run the test script:
   ```bash
   npm run test:fireblocks <wallet_address>
   ```
   
   Example:
   ```bash
   npm run test:fireblocks 0x1234567890123456789012345678901234567890
   ```

3. The script will:
   - Verify your credentials are set
   - Generate a JWT token
   - Create a test transaction
   - Show the transaction details or error messages

### Production Testing

1. Create a new Dynamic wallet
2. Complete the authentication and backup phrase flow
3. Check the browser console for funding status (look for `[Fireblocks]` logs)
4. Check Cloudflare Functions logs in the dashboard
5. Check Fireblocks dashboard for the transaction
6. Verify the wallet received 1 MON

## Troubleshooting

- **Transaction fails**: Check Fireblocks API credentials and vault permissions
- **JWT signing error**: Ensure the secret key is properly formatted (include PEM headers)
- **Asset not found**: Verify the asset ID (MON or ETH) is available in your Fireblocks account
- **Network issues**: Ensure Monad network is configured in Fireblocks if using MON asset

## Security Notes

- Never commit Fireblocks credentials to git
- Use Cloudflare Pages environment variables (encrypted at rest)
- The secret key is only used server-side in Cloudflare Functions
- JWT tokens expire after 30 seconds for security

