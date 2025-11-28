import { useEffect, useRef } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useAccount } from 'wagmi'

/**
 * Hook to detect when a Dynamic wallet is created and trigger Fireblocks funding
 * This only runs once per wallet creation
 */
export function useDynamicWalletFund() {
  const { primaryWallet, user } = useDynamicContext()
  const { address, isConnected } = useAccount()
  const hasFundedRef = useRef(false)
  const walletAddressRef = useRef(null)

  useEffect(() => {
    // Only proceed if:
    // 1. User is connected
    // 2. We have a Dynamic wallet (primaryWallet exists)
    // 3. We have an address
    // 4. We haven't already funded this wallet
    // 5. The address has changed (new wallet created)
    if (
      isConnected &&
      primaryWallet &&
      address &&
      address !== walletAddressRef.current &&
      !hasFundedRef.current
    ) {
      // Check if this is a new wallet (address changed)
      const isNewWallet = walletAddressRef.current === null || 
                           walletAddressRef.current !== address

      if (isNewWallet) {
        walletAddressRef.current = address
        hasFundedRef.current = false // Reset for new wallet
        
        // Wait a bit to ensure wallet is fully initialized
        // This also allows the backup phrase flow to complete
        const timer = setTimeout(async () => {
          try {
            await fundWallet(address)
            hasFundedRef.current = true
          } catch (error) {
            console.error('Failed to fund wallet:', error)
            // Don't set hasFundedRef to true on error, so we can retry
          }
        }, 3000) // 3 second delay to allow backup phrase flow

        return () => clearTimeout(timer)
      }
    }
  }, [isConnected, primaryWallet, address, user])

  return { isFunding: !hasFundedRef.current && walletAddressRef.current !== null }
}

/**
 * Call the Cloudflare Function to fund the wallet via Fireblocks
 */
async function fundWallet(address) {
  try {
    const response = await fetch('/api/fund-wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fund wallet')
    }

    const result = await response.json()
    console.log('Wallet funded successfully:', result)
    return result
  } catch (error) {
    console.error('Error funding wallet:', error)
    throw error
  }
}

