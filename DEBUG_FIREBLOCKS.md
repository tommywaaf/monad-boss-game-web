# Fireblocks Transaction Debugging Guide

## Common Issues and Solutions

### 1. **Hook Not Detecting Embedded Wallet**

**Check:**
- Open browser console and look for `[Fireblocks] Hook check:` logs
- Verify `isEmbeddedWallet` is `true`
- Check the connector type in the logs

**Possible causes:**
- Using external wallet (MetaMask, etc.) instead of Dynamic embedded wallet
- `isEmbeddedWallet` property not available on connector
- Wallet not fully initialized when hook runs

**Solution:**
- Make sure you're creating a NEW wallet via "Create New Wallet" button
- Don't connect an existing external wallet
- Wait for wallet to fully initialize (3 second delay is built in)

### 2. **API Endpoint Not Found (404)**

**Check:**
- Look for `[Fireblocks] Response status: 404` in console
- Verify Cloudflare Function is deployed
- Check function path: `/api/fund-wallet`

**Solution:**
- Ensure `functions/api/fund-wallet.js` exists
- Deploy to Cloudflare Pages
- Check Cloudflare Pages Functions dashboard

### 3. **Missing Environment Variables (500)**

**Check:**
- Look for `[Fireblocks] Missing credentials` in Cloudflare logs
- Check Cloudflare Pages Environment Variables

**Required variables:**
- `FIREBLOCKS_API_KEY`
- `FIREBLOCKS_SECRET_KEY`
- `FIREBLOCKS_SOURCE_VAULT_ID` (optional, defaults to '0')
- `FIREBLOCKS_ASSET_ID` (optional, defaults to 'ETH')

**Solution:**
- Add variables in Cloudflare Pages dashboard
- Ensure secret key includes full PEM format (with headers)
- Redeploy after adding variables

### 4. **Fireblocks API Error**

**Check:**
- Look for Fireblocks API error in response
- Check Cloudflare Functions logs
- Verify Fireblocks API credentials

**Common errors:**
- Invalid API key
- Invalid secret key format
- Vault permissions
- Asset not available

**Solution:**
- Test with `npm run test:fireblocks <address>` locally
- Verify credentials in Fireblocks dashboard
- Check vault has outbound transaction permissions

### 5. **Network/CORS Error**

**Check:**
- Look for `Network error` in console
- Check browser Network tab for failed requests

**Solution:**
- Verify Cloudflare Function is accessible
- Check CORS headers (should be handled by Cloudflare)
- Ensure no ad blockers blocking the request

## Debugging Steps

1. **Check Console Logs:**
   ```
   Look for logs starting with [Fireblocks]:
   - Hook check: Shows all conditions
   - New embedded wallet detected: Wallet was detected
   - Triggering funding: API call started
   - Response status: API response
   ```

2. **Check Cloudflare Functions Logs:**
   - Go to Cloudflare Pages dashboard
   - Navigate to Functions tab
   - Check for errors in `/api/fund-wallet` function

3. **Test Locally:**
   ```bash
   npm run test:fireblocks 0xYourTestAddress
   ```
   This will test the Fireblocks API directly

4. **Verify Wallet Type:**
   - Create a NEW Dynamic embedded wallet
   - Don't connect an existing external wallet
   - Check console for `isEmbeddedWallet: true`

5. **Check Environment Variables:**
   - Cloudflare Pages → Settings → Environment Variables
   - Ensure all required variables are set
   - Check for typos in variable names

## Expected Console Output

When working correctly, you should see:
```
[Fireblocks] Hook check: { isConnected: true, isEmbeddedWallet: true, ... }
[Fireblocks] ✅ New embedded wallet detected: 0x...
[Fireblocks] 🚀 Triggering funding for wallet: 0x...
[Fireblocks] Attempting to fund wallet: 0x...
[Fireblocks] Response status: 200 OK
[Fireblocks] ✅ Wallet funded successfully: { transactionId: "...", ... }
```

## Manual Testing

If automatic funding isn't working, you can manually test:

1. **Test the API endpoint:**
   ```javascript
   fetch('/api/fund-wallet', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ address: '0xYourAddress' })
   }).then(r => r.json()).then(console.log)
   ```

2. **Test Fireblocks directly:**
   ```bash
   npm run test:fireblocks 0xYourAddress
   ```

## Still Not Working?

1. Check Cloudflare Functions logs for detailed error messages
2. Verify Fireblocks API credentials are correct
3. Ensure vault has sufficient balance and permissions
4. Check if asset ID (MON/ETH) is available in Fireblocks
5. Verify network configuration in Fireblocks dashboard

