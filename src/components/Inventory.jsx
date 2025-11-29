import { useState, useEffect } from 'react'
import { useGameContract } from '../hooks/useGameContract'
import { ITEM_TIERS } from '../config/gameContract'
import ItemModal from './ItemModal'
import './Inventory.css'

function Inventory() {
  const { inventory, refetchInventory, lastEvent } = useGameContract()
  const [selectedItem, setSelectedItem] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Automatically refresh inventory when boss is defeated
  useEffect(() => {
    if (lastEvent && lastEvent.type === 'success') {
      console.log('[Inventory] Boss defeated, refreshing inventory...', lastEvent)
      setIsRefreshing(true)
      
      // Try multiple times with increasing delays to ensure we catch the update
      // Sometimes the contract state takes a moment to propagate on-chain
      const timers = []
      
      // First attempt: immediate (contract might already be updated)
      timers.push(setTimeout(() => {
        console.log('[Inventory] First refresh attempt (500ms)...')
        refetchInventory()
      }, 500))
      
      // Second attempt: after 1.5 seconds
      timers.push(setTimeout(() => {
        console.log('[Inventory] Second refresh attempt (1.5s)...')
        refetchInventory()
      }, 1500))
      
      // Third attempt: after 3 seconds (should definitely be updated by now)
      timers.push(setTimeout(() => {
        console.log('[Inventory] Third refresh attempt (3s)...')
        refetchInventory()
        setIsRefreshing(false)
      }, 3000))
      
      return () => {
        timers.forEach(timer => clearTimeout(timer))
        setIsRefreshing(false)
      }
    }
  }, [lastEvent?.itemId, lastEvent?.transactionHash, refetchInventory]) // Use specific event properties to avoid unnecessary re-runs

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetchInventory()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  // Sort inventory by tier (highest first)
  const sortedInventory = [...inventory].sort((a, b) => b.tier - a.tier)

  // Count items by tier
  const tierCounts = inventory.reduce((acc, item) => {
    acc[item.tier] = (acc[item.tier] || 0) + 1
    return acc
  }, {})

  return (
    <div className="inventory">
      <div className="inventory-header">
        <h2>🎒 Inventory</h2>
        <div className="inventory-header-right">
          <span className="inventory-count">{inventory.length} / 20</span>
          <button 
            className="refresh-inventory-button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh inventory"
          >
            {isRefreshing ? (
              <span className="refresh-spinner">⟳</span>
            ) : (
              <span>⟳</span>
            )}
          </button>
        </div>
      </div>

      {inventory.length === 0 ? (
        <div className="empty-inventory">
          <p>Your inventory is empty!</p>
          <p className="hint">Attack the boss to get items</p>
        </div>
      ) : (
        <>
          <div className="tier-summary">
            {Object.entries(tierCounts)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([tier, count]) => {
                const tierInfo = ITEM_TIERS[tier]
                return (
                  <div key={tier} className="tier-badge" style={{ borderColor: tierInfo.color }}>
                    <span className="tier-name" style={{ color: tierInfo.color }}>
                      {tierInfo.name}
                    </span>
                    <span className="tier-count">×{count}</span>
                  </div>
                )
              })}
          </div>

          <div className="inventory-grid">
            {sortedInventory.map((item, index) => {
              const tierInfo = ITEM_TIERS[item.tier]
              return (
                <div 
                  key={item.id}
                  className="inventory-item"
                  style={{ 
                    borderColor: tierInfo.color,
                    background: `linear-gradient(135deg, ${tierInfo.color}22, ${tierInfo.color}11)`
                  }}
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="item-tier" style={{ color: tierInfo.color }}>
                    {tierInfo.name}
                  </div>
                  <div className="item-icon">💎</div>
                  <div className="item-rarity">{tierInfo.rarity}</div>
                  <div className="item-id">#{item.id}</div>
                </div>
              )
            })}
          </div>
          
          {selectedItem && (
            <ItemModal 
              item={selectedItem} 
              onClose={() => setSelectedItem(null)}
              onTransferSuccess={() => {
                setSelectedItem(null)
                refetchInventory()
              }}
            />
          )}

          {inventory.length >= 20 && (
            <div className="inventory-full-notice">
              ⚠️ Inventory full! New items will replace your weakest ones.
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Inventory

