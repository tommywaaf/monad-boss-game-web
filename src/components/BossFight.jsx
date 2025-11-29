import { useState, useEffect, useRef } from 'react'
import { useGameContract } from '../hooks/useGameContract'
import { ITEM_TIERS } from '../config/gameContract'
import BossKillStats from './BossKillStats'
import RollDisplay from './RollDisplay'
import './BossFight.css'

function BossFight() {
  const { killBoss, isKilling, txStatus, txHash, isConfirming, isConfirmed, txError, resetTransaction, lastEvent, clearLastEvent, rarityBoost, globalBossesKilled, rakeFeeMon, refetchInventory } = useGameContract()
  const feeReady = rakeFeeMon && rakeFeeMon !== '0' && rakeFeeMon !== 'Loading...'
  const isLoadingFee = !rakeFeeMon || rakeFeeMon === '0' || rakeFeeMon === 'Loading...'
  const [notification, setNotification] = useState(null)
  const [showRollDisplay, setShowRollDisplay] = useState(false)
  const [rollData, setRollData] = useState(null)

  // Track which events we've already processed to prevent infinite loops and duplicate refreshes
  const processedEventRef = useRef(null)
  const refreshedItemsRef = useRef(new Set())
  
  useEffect(() => {
    if (lastEvent) {
      // Create unique key for this event
      const eventKey = lastEvent.transactionHash && lastEvent.itemId 
        ? `${lastEvent.transactionHash}-${lastEvent.itemId}` 
        : lastEvent.transactionHash || lastEvent.itemId || 'unknown'
      
      // Skip if we've already processed this exact event
      if (processedEventRef.current === eventKey) {
        return
      }
      
      processedEventRef.current = eventKey
      
      // Show roll display immediately - this opens the modal automatically
      setRollData(lastEvent)
      setShowRollDisplay(true)
      
      // Show notification
      if (lastEvent.type === 'success') {
        const tier = ITEM_TIERS[lastEvent.tier]
        setNotification({
          type: 'success',
          message: `Boss Defeated! You got a ${tier.name} item!`,
          tier: lastEvent.tier,
          details: `Click to see roll details`
        })
      } else if (lastEvent.type === 'failed') {
        setNotification({
          type: 'failed',
          message: 'Boss escaped! Click to see why.'
        })
      }
      
      // AUTO-REFRESH INVENTORY: When roll display shows (when "You rolled:" appears)
      // Only refresh once per item to avoid rate limiting
      if (lastEvent.type === 'success' && lastEvent.itemId && refetchInventory) {
        const itemId = lastEvent.itemId
        
        // Only refresh if we haven't already refreshed for this item
        if (!refreshedItemsRef.current.has(itemId)) {
          refreshedItemsRef.current.add(itemId)
          
          // 100ms delay, then call it - same as manual button
          setTimeout(async () => {
            try {
              await refetchInventory()
            } catch (error) {
              console.error('[BossFight] Error refreshing inventory:', error)
              // Remove from set on error so we can retry
              refreshedItemsRef.current.delete(itemId)
            }
          }, 100)
        }
      }
      
      // Clear notification after 5 seconds
      const notificationTimer = setTimeout(() => {
        setNotification(null)
      }, 5000)
      
      // Clear lastEvent after a longer delay
      const clearEventTimer = setTimeout(() => {
        clearLastEvent()
        // Reset processed ref when event is cleared so we can process new events
        processedEventRef.current = null
      }, 10000)
      
      return () => {
        clearTimeout(notificationTimer)
        clearTimeout(clearEventTimer)
      }
    }
  }, [lastEvent, clearLastEvent, refetchInventory])


  // Close roll display when starting a new attack (but only if it's actually showing)
  useEffect(() => {
    if (isKilling && showRollDisplay) {
      setShowRollDisplay(false)
      // Reset processed event ref so new events can be processed
      processedEventRef.current = null
    }
  }, [isKilling, showRollDisplay])
  
  const handleNotificationClick = () => {
    if (rollData) {
      setShowRollDisplay(true)
    }
  }
  
  const closeRollDisplay = () => {
    setShowRollDisplay(false)
  }

  return (
    <div className="boss-fight">
      <div className="boss-container">
        <div className="boss-sprite">
          <div className="boss-emoji">👹</div>
        </div>
        
        <div className="boss-stats">
          <h2>Boss Battle</h2>
          <div className="stat-row">
            <span className="stat-label">Rarity Boost:</span>
            <span className="stat-value rarity-rate">+{rarityBoost}%</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Rake Fee:</span>
            <span className="stat-value fee-rate">{rakeFeeMon} MON</span>
          </div>
        </div>
      </div>

      <button 
        className="attack-button"
        onClick={() => {
          console.log('[BossFight] Attack button clicked')
          console.log('[BossFight] isKilling:', isKilling)
          console.log('[BossFight] feeReady:', feeReady)
          console.log('[BossFight] rakeFeeMon:', rakeFeeMon)
          if (!isKilling && feeReady) {
            killBoss()
          } else {
            console.warn('[BossFight] Button click ignored - isKilling:', isKilling, 'feeReady:', feeReady)
          }
        }}
        disabled={isKilling || !feeReady}
      >
        {isKilling ? '⚔️ Attacking...' : '⚔️ Attack Boss'}
        <span className="attack-subtext">
          {isLoadingFee ? (
            <span style={{ opacity: 0.7 }}>⏳ Loading fee...</span>
          ) : (
            `Cost: ${rakeFeeMon} MON`
          )}
        </span>
      </button>

      {(isKilling || txStatus === 'failed') && (
        <div className="transaction-status">
          {txStatus !== 'failed' && (
            <div className="status-spinner">
              <div className="spinner"></div>
            </div>
          )}
          <div className="status-content">
            <h3 className="status-title">⚔️ Processing Boss Attack</h3>
            <div className="status-messages">
              {txStatus === 'preparing' && (
                <>
                  <p className="status-message active">📝 Preparing transaction...</p>
                  <p className="status-detail">Building transaction data and calculating gas</p>
                </>
              )}
              {txStatus === 'pending' && (
                <>
                  <p className="status-message active">👛 Waiting for wallet confirmation...</p>
                  <p className="status-detail">Please confirm the transaction in your wallet</p>
                </>
              )}
              {txStatus === 'submitted' && txHash && (
                <>
                  <p className="status-message active">✅ Transaction submitted!</p>
                  <p className="status-detail">Hash: <code className="tx-hash">{txHash.slice(0, 10)}...{txHash.slice(-8)}</code></p>
                  <p className="status-message">⏳ Waiting for block confirmation...</p>
                </>
              )}
              {txStatus === 'confirming' && (
                <>
                  <p className="status-message active">⏳ Waiting for block confirmation...</p>
                  <p className="status-detail">Transaction is being mined on the blockchain</p>
                  {txHash && (
                    <p className="status-detail">Hash: <code className="tx-hash">{txHash.slice(0, 10)}...{txHash.slice(-8)}</code></p>
                  )}
                </>
              )}
              {txStatus === 'confirmed' && (
                <>
                  <p className="status-message active">✅ Transaction confirmed!</p>
                  <p className="status-detail">Block confirmed, processing boss kill...</p>
                </>
              )}
              {txStatus === 'waiting-event' && (
                <>
                  <p className="status-message active">🎲 Waiting for boss kill event...</p>
                  <p className="status-detail">Listening for BossKilled event from contract</p>
                </>
              )}
              {txStatus === 'failed' && (
                <>
                  <p className="status-message active failed-text">❌ Transaction Failed</p>
                  <p className="status-detail">
                    {txError?.message || 'The transaction was rejected or failed. Please try again.'}
                  </p>
                  <button 
                    className="retry-button"
                    onClick={() => {
                      resetTransaction()
                      killBoss()
                    }}
                  >
                    🔄 Try Again
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div 
          className={`notification ${notification.type}`}
          onClick={handleNotificationClick}
          style={{ cursor: 'pointer' }}
        >
          {notification.type === 'success' && (
            <div 
              className="notification-icon"
              style={{ 
                background: ITEM_TIERS[notification.tier]?.color,
                boxShadow: `0 0 20px ${ITEM_TIERS[notification.tier]?.color}`
              }}
            >
              ✨
            </div>
          )}
          {notification.type === 'failed' && (
            <div className="notification-icon failed-icon">💀</div>
          )}
          <div className="notification-text">
            <p>{notification.message}</p>
            {notification.details && (
              <p className="notification-details">{notification.details}</p>
            )}
          </div>
        </div>
      )}
      
      {showRollDisplay && (
        <RollDisplay 
          rollData={rollData} 
          onClose={closeRollDisplay}
          onAttackAgain={killBoss}
          isKilling={isKilling}
          rarityBoost={rarityBoost}
        />
      )}

      <div className="global-stats">
        <h4>🌍 Global Stats</h4>
        <div className="global-stat-display">
          <span className="global-label">Total Bosses Killed (All Players):</span>
          <span className="global-value">{globalBossesKilled.toLocaleString()}</span>
        </div>
      </div>

      <div className="battle-tips">
        <h4>💡 Tips:</h4>
        <ul>
          <li>Every boss attack always succeeds!</li>
          <li>Each item gives you rarity boosts</li>
          <li>Max inventory: 20 items (weakest gets replaced)</li>
          <li>Click items in inventory to see full stats!</li>
        </ul>
      </div>

      <BossKillStats />
    </div>
  )
}

export default BossFight

