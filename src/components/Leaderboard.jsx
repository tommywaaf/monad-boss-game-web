import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useLeaderboard } from '../hooks/useLeaderboard'
import './Leaderboard.css'

function Leaderboard() {
  const { leaderboardData, loading } = useLeaderboard()
  const [sortBy, setSortBy] = useState('rarityBoost') // rarityBoost, successBoost, bossKills
  const { address: currentAddress } = useAccount()

  const sortedData = [...leaderboardData].sort((a, b) => {
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
        <div className="sort-buttons">
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
      </div>

      {loading ? (
        <div className="loading">Loading leaderboard...</div>
      ) : sortedData.length === 0 ? (
        <div className="empty-leaderboard">
          <p>No players yet! Be the first to kill a boss.</p>
        </div>
      ) : (
        <div className="leaderboard-table">
          <div className="table-header">
            <span className="rank">Rank</span>
            <span className="address">Player</span>
            <span className="stat">Rarity Boost</span>
            <span className="stat">Boss Kills</span>
          </div>
          {sortedData.slice(0, 20).map((player, index) => {
            const isCurrentUser = player.address?.toLowerCase() === currentAddress?.toLowerCase()
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

