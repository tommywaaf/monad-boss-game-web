import './BossKillStats.css'

function BossKillStats() {
  return (
    <div className="boss-kill-stats">
      <h3>📊 Drop Rate Information</h3>
      <div className="stats-explanation">
        <p className="intro-text">Harsh drop rates are in effect:</p>
        <ul>
          <li>
            <span className="tier-name"><strong>Common</strong></span>
            <span className="tier-info">(Tier 0) — ~90% chance</span>
          </li>
          <li>
            <span className="tier-name"><strong>Grey</strong></span>
            <span className="tier-info">(Tier 1) — ~10% chance (1 in 10)</span>
          </li>
          <li>
            <span className="tier-name"><strong>White</strong></span>
            <span className="tier-info">(Tier 2) — ~1% chance (1 in 100)</span>
          </li>
          <li>
            <span className="tier-name"><strong>Blue</strong></span>
            <span className="tier-info">(Tier 3) — ~0.1% chance (1 in 1,000)</span>
          </li>
          <li>
            <span className="tier-name"><strong>Purple</strong></span>
            <span className="tier-info">(Tier 4) — ~0.01% chance (1 in 10,000)</span>
          </li>
          <li>
            <span className="tier-name"><strong>Orange</strong></span>
            <span className="tier-info">(Tier 5) — ~0.001% chance (1 in 100,000)</span>
          </li>
          <li>
            <span className="tier-name"><strong>Red</strong></span>
            <span className="tier-info">(Tier 6) — ~0.0001% chance (1 in 1M)</span>
          </li>
          <li>
            <span className="tier-name"><strong>Brown</strong></span>
            <span className="tier-info">(Tier 7) — ~0.00001% chance (1 in 10M)</span>
          </li>
          <li>
            <span className="tier-name"><strong>Black</strong></span>
            <span className="tier-info">(Tier 8) — ~0.000001% chance (1 in 100M)</span>
          </li>
          <li>
            <span className="tier-name"><strong>Rainbow</strong></span>
            <span className="tier-info">(Tier 9) — ~0.0000001% chance (1 in 1B)</span>
          </li>
        </ul>
        <p className="hint-important">
          ⚠️ Your rarity boost can upgrade items by 1 tier after the base roll!
        </p>
      </div>
    </div>
  )
}

export default BossKillStats

