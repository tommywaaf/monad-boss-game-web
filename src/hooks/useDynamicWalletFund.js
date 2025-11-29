import { useEffect, useRef } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'

/**
 * Hook to detect when a Dynamic wallet is created and trigger Fireblocks funding
 * This only runs once per wallet creation
 */
export function useDynamicWalletFund() {
  const { primaryWallet, user } = useDynamicContext()
  const address = primaryWallet?.address
  const isConnected = !!primaryWallet
  const hasFundedRef = useRef(false)
  const walletAddressRef = useRef(null)

  useEffect(() => {
    // Debug logging
    const isEmbeddedWallet = primaryWallet?.connector?.isEmbeddedWallet || primaryWallet?.connector?.isEmbedded || false
    
    // More detailed connector inspection
    const connectorInfo = primaryWallet?.connector ? {
      name: primaryWallet.connector.constructor?.name,
      keys: Object.keys(primaryWallet.connector),
      isEmbeddedWallet: primaryWallet.connector.isEmbeddedWallet,
      isEmbedded: primaryWallet.connector.isEmbedded,
      // Try to get any embedded-related properties
      embedded: primaryWallet.connector.embedded,
      walletName: primaryWallet.connector.walletName,
      type: primaryWallet.connector.type,
    } : null
    
    console.log('[Fireblocks] Hook check:', {
      isConnected,
      hasPrimaryWallet: !!primaryWallet,
      isEmbeddedWallet,
      address,
      previousAddress: walletAddressRef.current,
      hasFunded: hasFundedRef.current,
      connectorInfo,
      user: user ? { id: user.userId, email: user.email } : null
    })
    
    // Only proceed if:
    // 1. User is connected
    // 2. We have a Dynamic wallet (primaryWallet exists)
    // 3. It's an embedded wallet (not an external wallet like MetaMask)
    // 4. We have an address
    // 5. We haven't already funded this wallet
    // 6. The address has changed (new wallet created)
    if (
      isConnected &&
      primaryWallet &&
      isEmbeddedWallet &&
      address &&
      address !== walletAddressRef.current &&
      !hasFundedRef.current
    ) {
      // Check if this is a new wallet (address changed)
      const isNewWallet = walletAddressRef.current === null || 
                           walletAddressRef.current !== address

      if (isNewWallet) {
        console.log('[Fireblocks] ✅ New embedded wallet detected:', address)
        console.log('[Fireblocks] Wallet details:', {
          address,
          connector: primaryWallet.connector?.constructor?.name,
          isEmbedded: isEmbeddedWallet
        })
        
        walletAddressRef.current = address
        hasFundedRef.current = false // Reset for new wallet
        
        // Wait a bit to ensure wallet is fully initialized
        // This also allows the backup phrase flow to complete
        const timer = setTimeout(async () => {
          try {
            console.log('[Fireblocks] 🚀 Triggering funding for wallet:', address)
            await fundWallet(address)
            hasFundedRef.current = true
            console.log('[Fireblocks] ✅ Funding completed successfully')
          } catch (error) {
            console.error('[Fireblocks] ❌ Failed to fund wallet:', error)
            // Don't set hasFundedRef to true on error, so we can retry
          }
        }, 3000) // 3 second delay to allow backup phrase flow

        return () => clearTimeout(timer)
      }
    } else {
      // Log why we're not funding
      if (!isConnected) {
        console.log('[Fireblocks] ⏸️ Not connected, skipping funding')
      } else if (!primaryWallet) {
        console.log('[Fireblocks] ⏸️ No primary wallet, skipping funding')
      } else if (!isEmbeddedWallet) {
        console.log('[Fireblocks] ⏸️ External wallet connected, skipping funding:', address)
        console.log('[Fireblocks] Connector details:', {
          name: primaryWallet.connector?.constructor?.name,
          isEmbedded: primaryWallet.connector?.isEmbeddedWallet,
          isEmbeddedAlt: primaryWallet.connector?.isEmbedded
        })
      } else if (!address) {
        console.log('[Fireblocks] ⏸️ No address yet, skipping funding')
      } else if (address === walletAddressRef.current) {
        console.log('[Fireblocks] ⏸️ Same address as before, skipping funding')
      } else if (hasFundedRef.current) {
        console.log('[Fireblocks] ⏸️ Already funded this wallet, skipping')
      }
    }
  }, [isConnected, primaryWallet, address, user])

  return { isFunding: !hasFundedRef.current && walletAddressRef.current !== null }
}

/**
 * Call the Cloudflare Function to fund the wallet via Fireblocks api
 */
async function fundWallet(address) {
  try {
    console.log('[Fireblocks] Attempting to fund wallet:', address)
    console.log('[Fireblocks] API endpoint: /api/fund-wallet')
    
    const response = await fetch('/api/fund-wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address }),
    })

    const responseText = await response.text()
    console.log('[Fireblocks] Response status:', response.status, response.statusText)
    console.log('[Fireblocks] Response headers:', Object.fromEntries(response.headers.entries()))
    console.log('[Fireblocks] Response body:', responseText)

    if (!response.ok) {
      let error
      try {
        error = JSON.parse(responseText)
      } catch {
        error = { error: responseText || 'Failed to fund wallet' }
      }
      console.error('[Fireblocks] ❌ Error response:', error)
      
      // Provide more specific error messages
      if (response.status === 404) {
        throw new Error('Fireblocks API endpoint not found. Make sure the Cloudflare Function is deployed.')
      } else if (response.status === 500) {
        throw new Error(`Fireblocks API error: ${error.error || error.message || 'Internal server error'}`)
      } else if (response.status === 400) {
        throw new Error(`Invalid request: ${error.error || error.message || 'Bad request'}`)
      } else {
        throw new Error(error.error || error.message || `Failed to fund wallet (${response.status})`)
      }
    }

    const result = JSON.parse(responseText)
    console.log('[Fireblocks] ✅ Wallet funded successfully:', result)
    return result
  } catch (error) {
    // Handle network errors separately
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('[Fireblocks] ❌ Network error - could not reach API endpoint')
      throw new Error('Network error: Could not reach Fireblocks API. Check your internet connection and ensure the Cloudflare Function is deployed.')
    }
    console.error('[Fireblocks] ❌ Error funding wallet:', error)
    throw error
  }
}

