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
    // Only proceed if:
    // 1. User is connected
    // 2. We have a Dynamic wallet (primaryWallet exists)
    // 3. It's an embedded wallet (not an external wallet like MetaMask)
    // 4. We have an address
    // 5. We haven't already funded this wallet
    // 6. The address has changed (new wallet created)
    const isEmbeddedWallet = primaryWallet?.connector?.isEmbedded || false
    
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
        console.log('[Fireblocks] New embedded wallet detected:', address)
        walletAddressRef.current = address
        hasFundedRef.current = false // Reset for new wallet
        
        // Wait a bit to ensure wallet is fully initialized
        // This also allows the backup phrase flow to complete
        const timer = setTimeout(async () => {
          try {
            console.log('[Fireblocks] Triggering funding for wallet:', address)
            await fundWallet(address)
            hasFundedRef.current = true
            console.log('[Fireblocks] Funding completed successfully')
          } catch (error) {
            console.error('[Fireblocks] Failed to fund wallet:', error)
            // Don't set hasFundedRef to true on error, so we can retry
          }
        }, 3000) // 3 second delay to allow backup phrase flow

        return () => clearTimeout(timer)
      }
    } else if (isConnected && primaryWallet && !isEmbeddedWallet) {
      console.log('[Fireblocks] External wallet connected, skipping funding:', address)
    }
  }, [isConnected, primaryWallet, address, user])

  return { isFunding: !hasFundedRef.current && walletAddressRef.current !== null }
}

/**
 * Call the Cloudflare Function to fund the wallet via Fireblocks
 */
async function fundWallet(address) {
  try {
    console.log('[Fireblocks] Attempting to fund wallet:', address)
    
    const response = await fetch('/api/fund-wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address }),
    })

    const responseText = await response.text()
    console.log('[Fireblocks] Response status:', response.status)
    console.log('[Fireblocks] Response body:', responseText)

    if (!response.ok) {
      let error
      try {
        error = JSON.parse(responseText)
      } catch {
        error = { error: responseText || 'Failed to fund wallet' }
      }
      console.error('[Fireblocks] Error response:', error)
      throw new Error(error.error || error.message || 'Failed to fund wallet')
    }

    const result = JSON.parse(responseText)
    console.log('[Fireblocks] Wallet funded successfully:', result)
    return result
  } catch (error) {
    console.error('[Fireblocks] Error funding wallet:', error)
    throw error
  }
}

