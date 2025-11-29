import { useState, useEffect, useRef } from 'react'
import React from 'react'
import { useGameContract } from '../hooks/useGameContract'
import { ITEM_TIERS } from '../config/gameContract'
import ItemModal from './ItemModal'
import './Inventory.css'

function Inventory() {
  const { inventory, refetchInventory, lastEvent, inventoryVersion } = useGameContract()
  const [selectedItem, setSelectedItem] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // REMOVED: Auto-refresh is now handled in BossFight.jsx to avoid duplicate calls

  // Track previous version to detect changes
  const prevVersionRef = useRef(0)
  
  // Force re-render when inventoryVersion changes - same pattern as manual button
  useEffect(() => {
    if (inventoryVersion !== prevVersionRef.current) {
      console.log('[Inventory] 🔄 inventoryVersion changed:', prevVersionRef.current, '->', inventoryVersion, '- forcing re-render')
      prevVersionRef.current = inventoryVersion
      // Force a state update to trigger re-render (like setIsRefreshing does in manual button)
      setIsRefreshing(true)
      // Immediately set it back so UI doesn't show loading
      setTimeout(() => setIsRefreshing(false), 0)
    }
  }, [inventoryVersion])
  
  // Watch for inventory changes
  useEffect(() => {
    console.log('[Inventory] ✅ Inventory state changed:', inventory.length, 'items', 'version:', inventoryVersion)
  }, [inventory, inventoryVersion])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetchInventory()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  // Sort inventory by tier (highest first)
  // Use inventoryVersion in the sort to ensure it re-computes when version changes
  const sortedInventory = React.useMemo(() => {
    return [...inventory].sort((a, b) => b.tier - a.tier)
  }, [inventory, inventoryVersion])

  // Count items by tier
  const tierCounts = inventory.reduce((acc, item) => {
    acc[item.tier] = (acc[item.tier] || 0) + 1
    return acc
  }, {})

  // Use inventoryVersion in render to ensure component re-renders when it changes
  return (
    <div className="inventory" key={`inventory-wrapper-${inventoryVersion}`}>
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

          <div className="inventory-grid" key={`inventory-${inventoryVersion}`}>
            {sortedInventory.map((item, index) => {
              const tierInfo = ITEM_TIERS[item.tier]
              return (
                <div 
                  key={`${item.id}-${inventoryVersion}`}
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

