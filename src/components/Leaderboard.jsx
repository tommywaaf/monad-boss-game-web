import { useState } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { ITEM_TIERS } from '../config/gameContract'
import './Leaderboard.css'

function Leaderboard() {
  const { leaderboardData, loading, refetchLeaderboard } = useLeaderboard()
  const [sortBy, setSortBy] = useState('highestTier') // rarityBoost, bossKills, highestTier
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { primaryWallet } = useDynamicContext()
  const currentAddress = primaryWallet?.address

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetchLeaderboard()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const sortedData = [...leaderboardData].sort((a, b) => {
    if (sortBy === 'highestTier') {
      // Sort by highest tier, with -1 (no items) at the end
      const aTier = a.highestTier >= 0 ? a.highestTier : -1
      const bTier = b.highestTier >= 0 ? b.highestTier : -1
      return bTier - aTier
    }
    return b[sortBy] - a[sortBy]
  })

  const truncateAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <h2>🏆 Leaderboard</h2>
        <div className="leaderboard-header-right">
          <div className="sort-buttons">
          <button 
            className={sortBy === 'highestTier' ? 'active' : ''}
            onClick={() => setSortBy('highestTier')}
          >
            Highest Tier
          </button>
          <button 
            className={sortBy === 'rarityBoost' ? 'active' : ''}
            onClick={() => setSortBy('rarityBoost')}
          >
            Rarity Boost
          </button>
          <button 
            className={sortBy === 'bossKills' ? 'active' : ''}
            onClick={() => setSortBy('bossKills')}
          >
            Boss Kills
          </button>
          </div>
          <button 
            className="refresh-leaderboard-button"
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            title="Refresh leaderboard"
          >
            {isRefreshing ? (
              <span className="refresh-spinner">⟳</span>
            ) : (
              <span>⟳</span>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading leaderboard...</div>
      ) : sortedData.length === 0 ? (
        <div className="empty-leaderboard">
          <p>Click the refresh button ⟳ to load the leaderboard</p>
        </div>
      ) : (
        <div className="leaderboard-table">
          <div className="table-header">
            <span className="rank">Rank</span>
            <span className="address">Player</span>
            <span className="stat">Highest Tier</span>
            <span className="stat">Rarity Boost</span>
            <span className="stat">Boss Kills</span>
          </div>
          {sortedData.slice(0, 20).map((player, index) => {
            const isCurrentUser = player.address?.toLowerCase() === currentAddress?.toLowerCase()
            const highestTierName = player.highestTier >= 0 ? ITEM_TIERS[player.highestTier]?.name || 'None' : 'None'
            const highestTierColor = player.highestTier >= 0 ? ITEM_TIERS[player.highestTier]?.color : '#888'
            return (
              <div key={player.address} className={`table-row ${isCurrentUser ? 'current-user' : ''}`}>
                <span className="rank">
                  {index === 0 && '🥇'}
                  {index === 1 && '🥈'}
                  {index === 2 && '🥉'}
                  {index > 2 && `#${index + 1}`}
                </span>
                <span className="address">
                  {truncateAddress(player.address)}
                  {isCurrentUser && <span className="you-badge">YOU</span>}
                </span>
                <span className="stat" style={{ color: highestTierColor, fontWeight: 700 }}>
                  {player.highestTier >= 0 ? highestTierName : '—'}
                </span>
                <span className="stat highlight">+{player.rarityBoost.toFixed(1)}%</span>
                <span className="stat">{player.bossKills.toLocaleString()}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Leaderboard

