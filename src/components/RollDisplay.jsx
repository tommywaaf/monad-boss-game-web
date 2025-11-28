import { ITEM_TIERS } from '../config/gameContract'
import './RollDisplay.css'

function RollDisplay({ rollData, onClose, onAttackAgain, isKilling }) {
  if (!rollData) return null

  const { type, tier, baseRoll, baseTier, upgraded, successRoll, successChance } = rollData

  // Define tier ranges (based on contract logic)
  const tierRanges = [
    { tier: 9, name: 'Rainbow', min: 0, max: 0, color: ITEM_TIERS[9].color },
    { tier: 8, name: 'Black', min: 1, max: 9, color: ITEM_TIERS[8].color },
    { tier: 7, name: 'Brown', min: 10, max: 99, color: ITEM_TIERS[7].color },
    { tier: 6, name: 'Red', min: 100, max: 999, color: ITEM_TIERS[6].color },
    { tier: 5, name: 'Orange', min: 1000, max: 9999, color: ITEM_TIERS[5].color },
    { tier: 4, name: 'Purple', min: 10000, max: 99999, color: ITEM_TIERS[4].color },
    { tier: 3, name: 'Blue', min: 100000, max: 999999, color: ITEM_TIERS[3].color },
    { tier: 2, name: 'White', min: 1000000, max: 9999999, color: ITEM_TIERS[2].color },
    { tier: 1, name: 'Grey', min: 10000000, max: 99999999, color: ITEM_TIERS[1].color },
    { tier: 0, name: 'Common', min: 100000000, max: 999999999, color: ITEM_TIERS[0].color },
  ]

  if (type === 'failed') {
    const successPercent = (successChance / 100).toFixed(1)
    const rollPercent = (successRoll / 100).toFixed(1)
    
    return (
      <div className="roll-display-overlay" onClick={onClose}>
        <div className="roll-display-content failed" onClick={(e) => e.stopPropagation()}>
          <button className="roll-close" onClick={onClose}>×</button>
          
          <h2>💀 Boss Escaped!</h2>
          
          <div className="roll-section">
            <h3>Success Roll</h3>
            <div className="roll-bar-container">
              <div className="roll-bar">
                <div 
                  className="success-threshold" 
                  style={{ width: `${successPercent}%` }}
                >
                  <span className="threshold-label">Needed: {successPercent}%</span>
                </div>
                <div 
                  className="roll-marker failed-marker" 
                  style={{ left: `${rollPercent}%` }}
                >
                  <div className="marker-dot"></div>
                  <span className="marker-label">Your Roll: {rollPercent}%</span>
                </div>
              </div>
            </div>
            <div className="roll-explanation">
              <p>You rolled <strong>{successRoll}</strong> out of 10,000</p>
              <p>You needed <strong>&lt; {successChance}</strong> to succeed</p>
              <p className="result-text failed-text">❌ Not enough!</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success case
  const rollNum = Number(baseRoll)
  const maxRoll = 1_000_000_000
  const rollPercent = (rollNum / maxRoll) * 100

  return (
    <div className="roll-display-overlay" onClick={onClose}>
      <div className="roll-display-content success" onClick={(e) => e.stopPropagation()}>
        <button className="roll-close" onClick={onClose}>×</button>
        
        <h2>⚔️ Boss Defeated!</h2>
        
        <div className="roll-section">
          <h3>Drop Roll (0 - 1,000,000,000)</h3>
          <div className="tier-ranges">
            {tierRanges.map((range) => {
              const width = ((range.max - range.min + 1) / maxRoll) * 100
              const isThisTier = baseTier === range.tier
              
              return (
                <div 
                  key={range.tier}
                  className={`tier-range ${isThisTier ? 'active' : ''}`}
                  style={{ 
                    width: `${width}%`,
                    background: range.color,
                    opacity: isThisTier ? 1 : 0.3
                  }}
                  title={`${range.name}: ${range.min.toLocaleString()} - ${range.max.toLocaleString()}`}
                >
                  {width > 5 && <span className="tier-label">{range.name}</span>}
                </div>
              )
            })}
          </div>
          
          <div className="roll-marker-line">
            <div 
              className="roll-marker success-marker" 
              style={{ left: `${rollPercent}%` }}
            >
              <div className="marker-arrow">▼</div>
              <span className="marker-label">Your Roll</span>
            </div>
          </div>
          
          <div className="roll-explanation">
            <p>You rolled: <strong>{rollNum.toLocaleString()}</strong></p>
            <p>Base drop: <strong style={{ color: ITEM_TIERS[baseTier].color }}>
              {ITEM_TIERS[baseTier].name} (Tier {baseTier})
            </strong></p>
            
            {upgraded ? (
              <div className="upgrade-notice">
                <p className="result-text success-text">
                  ✨ Rarity Boost Activated! Upgraded to <strong style={{ color: ITEM_TIERS[tier].color }}>
                    {ITEM_TIERS[tier].name}
                  </strong>!
                </p>
              </div>
            ) : (
              <p className="result-text">Final drop: <strong style={{ color: ITEM_TIERS[tier].color }}>
                {ITEM_TIERS[tier].name}
              </strong></p>
            )}
          </div>
        </div>

        <div className="provably-fair">
          <h4>🔒 Provably Fair</h4>
          <p>Roll generated from: blockhash + your address + nonce</p>
          <p className="warning-text">⚠️ Uses pseudo-random (not VRF) - fine for testing</p>
        </div>

        {onAttackAgain && (
          <div className="roll-actions">
            <button 
              className="attack-again-button" 
              onClick={() => {
                // Close modal immediately
                onClose()
                // Start the attack - use requestAnimationFrame to ensure modal closes first
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    onAttackAgain()
                  })
                })
              }}
              disabled={isKilling}
            >
              {isKilling ? '⚔️ Attacking...' : '⚔️ Attack Boss Again'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default RollDisplay

