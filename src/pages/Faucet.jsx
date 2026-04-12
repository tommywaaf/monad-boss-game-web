import { useState, useEffect, useRef } from 'react'
import ToolInfoPanel from '../components/ToolInfoPanel'
import './Faucet.css'

const FAUCET_API = 'https://delicate-haze-2a16.tm8six.workers.dev'

const NETWORKS = [
  {
    id: 'sepolia',
    name: 'Sepolia',
    icon: '🔷',
    assets: [
      { assetId: 'ETH_TEST5', symbol: 'ETH', amount: '0.2', icon: '⟠' },
      { assetId: 'USDC_ETH_TEST5_0GER', symbol: 'USDC', amount: '5', icon: '💵' },
      { assetId: 'LINK_ETH_TEST5_BOTX', symbol: 'LINK', amount: '1', icon: '🔗' },
    ],
    validateAddress: (addr) => /^0x[0-9a-fA-F]{40}$/.test(addr),
    placeholder: '0x...',
    addressType: 'EVM',
  },
  {
    id: 'hoodi',
    name: 'Hoodi',
    icon: '🟣',
    assets: [
      { assetId: 'ETH_TEST_HOODI', symbol: 'ETH', amount: '0.2', icon: '⟠' },
    ],
    validateAddress: (addr) => /^0x[0-9a-fA-F]{40}$/.test(addr),
    placeholder: '0x...',
    addressType: 'EVM',
  },
  {
    id: 'bitcoin-testnet',
    name: 'Bitcoin Testnet',
    icon: '₿',
    assets: [
      { assetId: 'BTC_TEST', symbol: 'BTC', amount: '0.25', icon: '₿' },
    ],
    validateAddress: (addr) => {
      if (/^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) return true
      if (/^(tb1|bcrt1)[a-zA-HJ-NP-Z0-9]{25,}$/.test(addr)) return true
      return false
    },
    placeholder: 'tb1... or m/n/2...',
    addressType: 'BTC',
  },
  {
    id: 'solana-devnet',
    name: 'Solana Devnet',
    icon: '◎',
    assets: [
      { assetId: 'SOL_TEST', symbol: 'SOL', amount: '0.25', icon: '◎' },
    ],
    validateAddress: (addr) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr),
    placeholder: 'Base58 address...',
    addressType: 'Solana',
  },
]

const RATE_LIMIT_KEY = 'faucet_rate_limits'

function loadRateLimits() {
  try {
    const stored = localStorage.getItem(RATE_LIMIT_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    const now = Date.now()
    const cleaned = {}
    for (const [key, val] of Object.entries(parsed)) {
      if (new Date(val).getTime() > now) cleaned[key] = val
    }
    return cleaned
  } catch {
    return {}
  }
}

function saveRateLimits(limits) {
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(limits))
}

function useCountdown(targetDate) {
  const [remaining, setRemaining] = useState(() => {
    if (!targetDate) return 0
    return Math.max(0, Math.floor((new Date(targetDate).getTime() - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!targetDate) { setRemaining(0); return }
    const target = new Date(targetDate).getTime()
    const update = () => setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  return remaining
}

function formatCountdown(seconds) {
  if (seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

function AssetCard({ asset, network, rateLimitUntil, onRateLimited }) {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const countdown = useCountdown(rateLimitUntil)
  const isRateLimited = countdown > 0

  const isValidAddress = address.trim() !== '' && network.validateAddress(address.trim())

  const handleSend = async () => {
    if (!isValidAddress || loading || isRateLimited) return

    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch(`${FAUCET_API}/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.assetId, address: address.trim() }),
      })

      const data = await res.json()

      if (res.status === 429) {
        const retryAfter = data.retryAfter || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        onRateLimited(retryAfter)
        setError(`Rate limited. Try again in ${formatCountdown(Math.floor((new Date(retryAfter).getTime() - Date.now()) / 1000))}`)
        return
      }

      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`)
        return
      }

      setResult(data)
      const cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      onRateLimited(cooldownUntil)
    } catch (err) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`asset-card ${isRateLimited ? 'rate-limited' : ''}`}>
      <div className="asset-card-header">
        <span className="asset-icon">{asset.icon}</span>
        <div className="asset-info">
          <span className="asset-symbol">{asset.symbol}</span>
          <span className="asset-amount">{asset.amount} {asset.symbol}</span>
        </div>
      </div>

      <div className="asset-card-body">
        <div className="address-input-group">
          <input
            type="text"
            value={address}
            onChange={(e) => { setAddress(e.target.value); setError(null); setResult(null) }}
            placeholder={network.placeholder}
            className={`address-input ${address && !isValidAddress ? 'invalid' : ''}`}
            disabled={loading}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          {address && !isValidAddress && (
            <span className="validation-hint">Invalid {network.addressType} address</span>
          )}
        </div>

        <button
          className={`send-btn ${loading ? 'loading' : ''}`}
          onClick={handleSend}
          disabled={!isValidAddress || loading || isRateLimited}
        >
          {loading ? (
            <><span className="spinner" /> Sending...</>
          ) : isRateLimited ? (
            <>⏳ {formatCountdown(countdown)}</>
          ) : (
            <>Send {asset.symbol}</>
          )}
        </button>
      </div>

      {result && (
        <div className="asset-result success">
          <span className="result-icon">✅</span>
          <div className="result-details">
            <span className="result-text">Sent {result.amount} {asset.symbol}</span>
            <code className="result-txid">{result.transactionId}</code>
          </div>
        </div>
      )}

      {error && !result && (
        <div className="asset-result error">
          <span className="result-icon">❌</span>
          <span className="result-text">{error}</span>
        </div>
      )}
    </div>
  )
}

function Faucet() {
  const [rateLimits, setRateLimits] = useState(loadRateLimits)
  const [healthOk, setHealthOk] = useState(null)
  const [txidSetup, setTxidSetup] = useState(null) // null=loading, { configured, publicKey? }
  const [txidSetting, setTxidSetting] = useState(false)
  const [txidCopied, setTxidCopied] = useState(false)

  useEffect(() => {
    document.title = 'Testnet Faucet'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  useEffect(() => {
    fetch(`${FAUCET_API}/health`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => setHealthOk(d.status === 'ok'))
      .catch(() => {
        // The /health endpoint may not include CORS headers, so the browser
        // blocks reading the response even from the allowed origin.
        // Fall back to a no-cors probe — if it resolves the server is reachable.
        fetch(`${FAUCET_API}/health`, { mode: 'no-cors' })
          .then(() => setHealthOk(true))
          .catch(() => setHealthOk(false))
      })
  }, [])

  useEffect(() => {
    fetch(`${FAUCET_API}/faucet/txid-setup`)
      .then(r => r.json())
      .then(data => setTxidSetup(data))
      .catch(() => setTxidSetup({ configured: false }))
  }, [])

  const handleTxidSetup = async () => {
    setTxidSetting(true)
    try {
      const res = await fetch(`${FAUCET_API}/faucet/txid-setup`, { method: 'POST' })
      const data = await res.json()
      setTxidSetup(data)
    } catch { /* noop */ } finally {
      setTxidSetting(false)
    }
  }

  const handleCopyPublicKey = async () => {
    if (!txidSetup?.publicKey) return
    try {
      await navigator.clipboard.writeText(txidSetup.publicKey)
      setTxidCopied(true)
      setTimeout(() => setTxidCopied(false), 1500)
    } catch { /* noop */ }
  }

  const handleRateLimited = (assetId, retryAfter) => {
    setRateLimits(prev => {
      const next = { ...prev, [assetId]: retryAfter }
      saveRateLimits(next)
      return next
    })
  }

  return (
    <div className="faucet-page">
      <div className="faucet-container">
        <header className="faucet-header">
          <h1>🚰 Testnet Faucet</h1>
          <p>Request testnet tokens for development and testing.</p>
          <div className="faucet-status">
            {healthOk === null && <span className="status-dot checking" />}
            {healthOk === true && <><span className="status-dot online" /> API Online</>}
            {healthOk === false && <><span className="status-dot offline" /> API Offline</>}
          </div>
        </header>

        <div className="faucet-notice">
          <span className="notice-icon">ℹ️</span>
          <span>Enter your wallet address for each asset to receive testnet tokens.</span>
        </div>

        {/* ExternalTxId Signing Setup */}
        <div className={`faucet-txid-panel ${txidSetup?.configured ? 'configured' : ''}`}>
          <div className="faucet-txid-panel-header">
            <span className="faucet-txid-panel-title">ExternalTxId Signing</span>
            {txidSetup?.configured && <span className="faucet-txid-active-badge">Active</span>}
          </div>
          {txidSetup === null && (
            <p className="faucet-txid-status">Checking configuration…</p>
          )}
          {txidSetup?.configured === false && (
            <>
              <p className="faucet-txid-status">
                Not configured. Click below to generate an Ed25519 key pair — every faucet transaction will be signed with it so you can verify <code>externalTxId</code> in your Callback Handler policy.
              </p>
              <button
                className="faucet-txid-setup-btn"
                onClick={handleTxidSetup}
                disabled={txidSetting}
              >
                {txidSetting ? 'Generating…' : 'Generate Signing Keys'}
              </button>
            </>
          )}
          {txidSetup?.configured && txidSetup.publicKey && (
            <>
              <p className="faucet-txid-status">
                All faucet transactions include a signed <code>externalTxId</code>. Copy this public key and paste it into your Callback Handler policy rule to verify.
              </p>
              <div className="faucet-txid-key-row">
                <code className="faucet-txid-pubkey">{txidSetup.publicKey}</code>
                <button
                  className={`faucet-txid-copy-btn ${txidCopied ? 'copied' : ''}`}
                  onClick={handleCopyPublicKey}
                >
                  {txidCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </>
          )}
        </div>

        {NETWORKS.map(network => (
          <section key={network.id} className="network-group">
            <div className="network-group-header">
              <span className="network-icon">{network.icon}</span>
              <h2>{network.name}</h2>
              <span className="address-type-badge">{network.addressType}</span>
            </div>

            <div className="assets-grid">
              {network.assets.map(asset => (
                <AssetCard
                  key={asset.assetId}
                  asset={asset}
                  network={network}
                  rateLimitUntil={rateLimits[asset.assetId]}
                  onRateLimited={(retryAfter) => handleRateLimited(asset.assetId, retryAfter)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <ToolInfoPanel toolId="faucet" />
    </div>
  )
}

export default Faucet
