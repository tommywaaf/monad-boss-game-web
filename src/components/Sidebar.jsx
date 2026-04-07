import { Link, useLocation } from 'react-router-dom'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/broadcaster',     icon: '🚀', label: 'Broadcaster' },
  { to: '/simulator',       icon: '⚡', label: 'Simulator' },
  { to: '/tx-fetcher',      icon: '📥', label: 'TX Fetcher' },
  { to: '/ton-details',     icon: '🔍', label: 'TON Details' },
  { to: '/ton-batch-lookup', icon: '📋', label: 'TON Safe-to-Fail' },
  { to: '/ton-seqno-check', icon: '🔢', label: 'TON Seqno Check' },
  { to: '/btc-safe-to-fail', icon: '₿',  label: 'BTC Safe-to-Fail' },
  { to: '/btc-fetcher',     icon: '🔗', label: 'BTC Fetcher' },
  { to: '/csv-builder',     icon: '📊', label: 'CSV Builder' },
  { to: '/faucet',          icon: '🚰', label: 'Faucet' },
  { to: '/webhook-tester',  icon: '🔗', label: 'Webhook Tester' },
  { to: '/callback-handler', icon: '🛡️', label: 'Callback Handler' },
  { to: '/easy-cosigner',   icon: '🔐', label: 'Easy Cosigner' },
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <nav className="page-sidebar">
      <div className="sidebar-header">
        <h3>Navigation</h3>
      </div>
      <div className="sidebar-links">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`sidebar-link ${location.pathname === to ? 'active' : ''}`}
          >
            <span className="sidebar-icon">{icon}</span>
            <span className="sidebar-text">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
