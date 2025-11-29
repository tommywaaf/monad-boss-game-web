# Fireblocks Transaction Troubleshooting

## Current Status
- Hook is set up to detect new embedded wallets
- Cloudflare Function is configured
- Transaction format updated to match working Python script

## Changes Made

1. **Transaction Amount**: Changed from `'1'` to `'0.00001'` to match your working script
2. **Destination Type**: Using `ONE_TIME_ADDRESS` (correct per Fireblocks API docs)
3. **Enhanced Logging**: Added detailed connector inspection

## Debugging Steps

### 1. Check Browser Console
When you create a new embedded wallet, look for these logs:

```
[Fireblocks] Hook check: { ... }
[Fireblocks] ✅ New embedded wallet detected: 0x...
[Fireblocks] 🚀 Triggering funding for wallet: 0x...
```

**If you DON'T see "New embedded wallet detected":**
- Check `isEmbeddedWallet` value in the hook check log
- The wallet might not be detected as embedded
- Check `connectorInfo` in the logs to see available properties

### 2. Check if API is Called
Look for:
```
[Fireblocks] Attempting to fund wallet: 0x...
[Fireblocks] Response status: 200
```

**If you see an error:**
- Check the error message
- Verify Cloudflare environment variables are set
- Check Cloudflare Functions logs

### 3. Test the API Directly
You can test the endpoint manually in browser console:

```javascript
fetch('/api/fund-wallet', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: '0xYourAddressHere' })
})
.then(r => r.json())
.then(console.log)
.catch(console.error)
```

### 4. Test with Local Script
```bash
npm run test:fireblocks 0xYourAddressHere
```

## Common Issues

### Issue: Hook Not Detecting Embedded Wallet

**Symptoms:**
- No `[Fireblocks] ✅ New embedded wallet detected` log
- `isEmbeddedWallet: false` in hook check

**Solutions:**
1. Make sure you're creating a NEW wallet via "Create New Wallet" button
2. Don't connect an existing external wallet (MetaMask, etc.)
3. Check the `connectorInfo` in logs to see what properties are available
4. The connector might use a different property name

### Issue: API Call Fails

**Symptoms:**
- See `[Fireblocks] 🚀 Triggering funding` but then error
- Response status is not 200

**Solutions:**
1. Check Cloudflare Functions logs for detailed error
2. Verify environment variables are set correctly
3. Test with local script to isolate the issue
4. Check Fireblocks API credentials

### Issue: Transaction Created But Not Sent

**Symptoms:**
- API returns success but no transaction in Fireblocks dashboard

**Solutions:**
1. Check Fireblocks dashboard for pending transactions
2. Verify vault has sufficient balance
3. Check Transaction Authorization Policy (TAP) settings
4. Verify asset ID is correct (ETH vs MON)

## Next Steps

1. **Create a new embedded wallet** and watch the console
2. **Share the console logs** starting with `[Fireblocks]`
3. **Check Cloudflare Functions logs** if API is called
4. **Test manually** with the browser console command above

The enhanced logging should show exactly where the process is failing.

