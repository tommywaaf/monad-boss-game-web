import { useState, useEffect, useRef } from 'react'
import { useGameContract } from '../hooks/useGameContract'
import { ITEM_TIERS } from '../config/gameContract'
import ItemModal from './ItemModal'
import './Inventory.css'

function Inventory() {
  const { inventory, refetchInventory, lastEvent } = useGameContract()
  const [selectedItem, setSelectedItem] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Automatically refresh inventory when boss is defeated
  // Use a ref to track the last processed event to avoid duplicate refreshes
  const lastProcessedEventRef = useRef(null)
  
  // Watch for lastEvent changes - this is the same event that triggers the modal
  useEffect(() => {
    // Only process success events with all required fields
    if (lastEvent && lastEvent.type === 'success' && lastEvent.transactionHash && lastEvent.itemId) {
      const eventKey = `${lastEvent.transactionHash}-${lastEvent.itemId}`
      
      // Skip if we've already processed this exact event
      if (lastProcessedEventRef.current === eventKey) {
        return
      }
      
      console.log('[Inventory] 🎯 NEW Boss defeated event! Auto-refreshing inventory...', {
        itemId: lastEvent.itemId,
        transactionHash: lastEvent.transactionHash,
        tier: lastEvent.tier
      })
      
      lastProcessedEventRef.current = eventKey
      setIsRefreshing(true)
      
      // Call refetchInventory - EXACTLY the same as the manual button does
      const refresh = async () => {
        try {
          console.log('[Inventory] 🔄 Auto-refresh: calling refetchInventory()...')
          await refetchInventory()
          console.log('[Inventory] ✅ Auto-refresh completed!')
        } catch (error) {
          console.error('[Inventory] ❌ Auto-refresh error:', error)
        } finally {
          setIsRefreshing(false)
        }
      }
      
      // Refresh immediately - same timing as manual button
      refresh()
    }
  }, [lastEvent, refetchInventory]) // Depend on entire lastEvent object

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

