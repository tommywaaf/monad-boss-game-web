import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { ITEM_TIERS } from '../config/gameContract'
import './RollDisplay.css'

function RollDisplay({ rollData, onClose, onAttackAgain, isKilling, rarityBoost = 0 }) {
  if (!rollData) return null
  const { primaryWallet } = useDynamicContext()
  const address = primaryWallet?.address

  const { type, tier, baseRoll, baseTier, upgraded, successRoll, successChance, blockNumber, transactionHash, player } = rollData

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

        <div className="provably-fair">
          <h4>🔒 Provably Fair</h4>
          <div className="fair-values">
            <div className="fair-value-row">
              <span className="fair-label">Block Number:</span>
              <code className="fair-value">{blockNumber ? `#${Number(blockNumber).toLocaleString()}` : 'N/A'}</code>
            </div>
            <div className="fair-value-row">
              <span className="fair-label">Block Hash:</span>
              <code className="fair-value">blockhash({blockNumber ? `block.number - 1` : 'N/A'})</code>
            </div>
            <div className="fair-value-row">
              <span className="fair-label">Your Address:</span>
              <code className="fair-value">{player ? `${player.slice(0, 6)}...${player.slice(-4)}` : address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'N/A'}</code>
            </div>
            <div className="fair-value-row">
              <span className="fair-label">Transaction Hash:</span>
              <code className="fair-value">{transactionHash ? `${transactionHash.slice(0, 10)}...${transactionHash.slice(-8)}` : 'N/A'}</code>
            </div>
            <div className="fair-value-row">
              <span className="fair-label">Block Gas Limit:</span>
              <code className="fair-value">block.gaslimit</code>
            </div>
            <div className="fair-value-row">
              <span className="fair-label">Nonce:</span>
              <code className="fair-value">Your kill count (increments per kill)</code>
            </div>
            <div className="fair-formula">
              <p className="formula-text">
                <strong>Enhanced Formula:</strong>
              </p>
              <p className="formula-text" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                keccak256(<br/>
                &nbsp;&nbsp;blockhash(block.number - 1) +<br/>
                &nbsp;&nbsp;blockhash(block.number - 2) +<br/>
                &nbsp;&nbsp;block.number +<br/>
                &nbsp;&nbsp;block.timestamp +<br/>
                &nbsp;&nbsp;block.gaslimit +<br/>
                &nbsp;&nbsp;address +<br/>
                &nbsp;&nbsp;nonce<br/>
                )
              </p>
            </div>
          </div>
          <p className="warning-text">⚠️ Uses pseudo-random (not VRF) - fine for testing</p>
        </div>

        <div className="drop-rates-info">
          <h4>📊 Drop Rate Information</h4>
          <div className="drop-rates-grid">
            {ITEM_TIERS.map((tierInfo, idx) => {
              const prob = idx === 0 ? '~90%' : idx === 1 ? '~9%' : idx === 2 ? '~0.9%' : idx === 3 ? '~0.09%' : idx === 4 ? '~0.009%' : idx === 5 ? '~0.0009%' : idx === 6 ? '~0.00009%' : idx === 7 ? '~0.000009%' : idx === 8 ? '~0.0000009%' : '~0.00000009%'
              const oneIn = idx === 0 ? 'N/A' : idx === 1 ? '1 in 10' : idx === 2 ? '1 in 100' : idx === 3 ? '1 in 1,000' : idx === 4 ? '1 in 10,000' : idx === 5 ? '1 in 100,000' : idx === 6 ? '1 in 1M' : idx === 7 ? '1 in 10M' : idx === 8 ? '1 in 100M' : '1 in 1B'
              const isCurrentTier = tier === idx
              return (
                <div 
                  key={idx} 
                  className={`drop-rate-item ${isCurrentTier ? 'current-tier' : ''}`}
                  style={{ borderColor: tierInfo.color }}
                >
                  <div className="drop-rate-tier" style={{ color: tierInfo.color }}>
                    {tierInfo.name}
                  </div>
                  <div className="drop-rate-prob">{prob}</div>
                  <div className="drop-rate-odds">{oneIn}</div>
                </div>
              )
            })}
          </div>
          {rarityBoost > 0 && (
            <p className="rarity-boost-hint">
              ✨ Your rarity boost: <strong>+{rarityBoost.toFixed(1)}%</strong> chance to upgrade items by 1 tier!
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default RollDisplay

