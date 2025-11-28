import { useState } from 'react'
import { ITEM_TIERS } from '../config/gameContract'
import TransferModal from './TransferModal'
import './ItemModal.css'

function ItemModal({ item, onClose, onTransferSuccess }) {
  const [showTransferModal, setShowTransferModal] = useState(false)
  
  if (!item) return null

  const tierInfo = ITEM_TIERS[item.tier]
  
  // Calculate the boosts for this item
  const rarityBoosts = [0, 100, 200, 300, 400, 500, 1000, 1500, 2000, 2500]
  const successBoosts = [500, 500, 500, 700, 1000, 1000, 1000, 1000, 1000, 1000]
  
  const rarityBoost = rarityBoosts[item.tier] / 100 // Convert bps to percentage
  const successBoost = successBoosts[item.tier] / 100

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <div className="modal-header" style={{ 
          borderColor: tierInfo.color,
          background: `linear-gradient(135deg, ${tierInfo.color}22, ${tierInfo.color}11)`
        }}>
          <div className="modal-icon">💎</div>
          <h2 style={{ color: tierInfo.color }}>{tierInfo.name} Item</h2>
        </div>

        <div className="modal-body">
          <div className="stat-section">
            <h3>📊 Item Stats</h3>
            <div className="stat-grid">
              <div className="stat-item">
                <span className="stat-label">Tier:</span>
                <span className="stat-value" style={{ color: tierInfo.color }}>
                  {item.tier} - {tierInfo.name}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Item ID:</span>
                <span className="stat-value">#{item.id}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Drop Rate:</span>
                <span className="stat-value">{tierInfo.rarity}</span>
              </div>
            </div>
          </div>

          <div className="stat-section">
            <h3>⚡ Boosts</h3>
            <div className="boost-grid">
              <div className="boost-item success">
                <div className="boost-icon">🗡️</div>
                <div className="boost-info">
                  <span className="boost-label">Success Boost</span>
                  <span className="boost-value">+{successBoost}%</span>
                </div>
              </div>
              <div className="boost-item rarity">
                <div className="boost-icon">✨</div>
                <div className="boost-info">
                  <span className="boost-label">Rarity Boost</span>
                  <span className="boost-value">+{rarityBoost}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="stat-section">
            <h3>📈 Drop Probability</h3>
            <div className="probability-info">
              {item.tier === 0 && <p>Common items are the catch-all tier (90% of drops)</p>}
              {item.tier === 1 && <p>Grey items drop ~10% of the time (1 in 10)</p>}
              {item.tier === 2 && <p>White items drop ~1% of the time (1 in 100)</p>}
              {item.tier === 3 && <p>Blue items drop ~0.1% of the time (1 in 1,000)</p>}
              {item.tier === 4 && <p>Purple items drop ~0.01% of the time (1 in 10,000)</p>}
              {item.tier === 5 && <p>Orange items drop ~0.001% of the time (1 in 100,000)</p>}
              {item.tier === 6 && <p>Red items drop ~0.0001% of the time (1 in 1,000,000)</p>}
              {item.tier === 7 && <p>Brown items drop ~0.00001% of the time (1 in 10,000,000)</p>}
              {item.tier === 8 && <p>Black items drop ~0.000001% of the time (1 in 100,000,000)</p>}
              {item.tier === 9 && <p>Rainbow items are ULTRA RARE! (1 in 1,000,000,000)</p>}
            </div>
          </div>

          <div className="stat-section">
            <h3>💡 Tips</h3>
            <ul className="tips-list">
              <li>Each item adds to your total rarity boost</li>
              <li>Rarity boost can upgrade drops by one tier</li>
              <li>Inventory holds 20 items — weakest gets replaced</li>
              <li>Transfer items to allies to boost their odds</li>
            </ul>
          </div>
          
          <div className="item-actions">
            <button 
              className="transfer-item-button"
              onClick={() => setShowTransferModal(true)}
            >
              🎁 Transfer Item
            </button>
          </div>
        </div>
      </div>
      
      {showTransferModal && (
        <TransferModal 
          item={item}
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => {
            if (onTransferSuccess) onTransferSuccess()
            onClose()
          }}
        />
      )}
    </div>
  )
}

export default ItemModal

