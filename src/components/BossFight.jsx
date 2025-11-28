import { useState, useEffect } from 'react'
import { useGameContract } from '../hooks/useGameContract'
import { ITEM_TIERS } from '../config/gameContract'
import BossKillStats from './BossKillStats'
import RollDisplay from './RollDisplay'
import './BossFight.css'

function BossFight() {
  const { killBoss, isKilling, lastEvent, clearLastEvent, rarityBoost, globalBossesKilled, rakeFeeMon } = useGameContract()
  const feeReady = rakeFeeMon && rakeFeeMon !== '0'
  const [notification, setNotification] = useState(null)
  const [showRollDisplay, setShowRollDisplay] = useState(false)
  const [rollData, setRollData] = useState(null)

  useEffect(() => {
    if (lastEvent) {
      // Show roll display immediately
      setRollData(lastEvent)
      setShowRollDisplay(true)
      
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
      
      // Clear notification after 5 seconds
      setTimeout(() => {
        setNotification(null)
        clearLastEvent()
      }, 5000)
    }
  }, [lastEvent, clearLastEvent])
  
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
          <div className="boss-health-bar">
            <div className="health-fill"></div>
          </div>
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
        onClick={killBoss}
        disabled={isKilling || !feeReady}
      >
        {isKilling ? '⚔️ Attacking...' : '⚔️ Attack Boss'}
        <span className="attack-subtext">
          Cost: {feeReady ? `${rakeFeeMon} MON` : '...'}
        </span>
      </button>

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
        <RollDisplay rollData={rollData} onClose={closeRollDisplay} />
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

