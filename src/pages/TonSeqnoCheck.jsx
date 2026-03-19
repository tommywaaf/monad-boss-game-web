import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './TonSeqnoCheck.css'

const TONCENTER = "https://toncenter.com"

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getSession() {
  const apiKey = import.meta.env.VITE_TONCENTER_API_KEY
  const headers = { 'User-Agent': 'ton-seqno-check/1.0' }
  if (apiKey) headers['X-API-Key'] = apiKey
  return { headers }
}

async function fetchWithRetry(session, url, params, maxRetries = 4) {
  const queryString = new URLSearchParams(params).toString()
  const fullUrl = `${url}?${queryString}`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await sleep(300 + Math.random() * 200)

    try {
      const response = await fetch(fullUrl, {
        headers: session.headers,
        signal: AbortSignal.timeout(20000),
      })

      if (response.status === 200) return await response.json()

      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const waitMs = 2000 * Math.pow(2, attempt - 1) + Math.random() * 500
        await sleep(waitMs)
        continue
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    } catch (e) {
      if (e.name === 'TimeoutError' && attempt < maxRetries) {
        await sleep(3000)
        continue
      }
      throw e
    }
  }

  throw new Error('Max retries exceeded')
}

async function getWalletSeqno(address) {
  const session = getSession()

  const data = await fetchWithRetry(
    session,
    `${TONCENTER}/api/v2/getWalletInformation`,
    { address }
  )

  if (!data.ok) {
    throw new Error(data.error || 'API returned an error')
  }

  const result = data.result
  if (!result) throw new Error('No result in API response')

  if (!result.account_state || result.account_state === 'uninitialized') {
    return {
      address: result.address?.bounceable || address,
      rawAddress: result.address?.raw || null,
      status: result.account_state || 'uninitialized',
      nextSeqno: null,
      highestConfirmedSeqno: null,
      balance: result.balance || '0',
      walletType: result.wallet_type || null,
    }
  }

  const nextSeqno = result.seqno ?? null
  return {
    address: result.address?.bounceable || address,
    rawAddress: result.address?.raw || null,
    status: result.account_state || 'unknown',
    nextSeqno,
    highestConfirmedSeqno: nextSeqno !== null && nextSeqno > 0 ? nextSeqno - 1 : null,
    balance: result.balance || '0',
    walletType: result.wallet_type || null,
  }
}

function formatNano(nanoStr) {
  const n = BigInt(nanoStr)
  const whole = n / 1000000000n
  const frac = n % 1000000000n
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '')
  return fracStr ? `${whole}.${fracStr}` : `${whole}`
}

function CopyValue({ value, mono }) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = String(value)
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }
  }, [value])

  return (
    <span
      className={`copy-value ${mono ? 'mono' : ''} ${copied ? 'copied' : ''}`}
      onClick={handleClick}
      title="Click to copy"
    >
      {value}
      {copied && <span className="copy-toast">Copied!</span>}
    </span>
  )
}

function TonSeqnoCheck() {
  const location = useLocation()

  useEffect(() => {
    document.title = 'TON Seqno Check'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const address = input.trim()
    if (!address) return

    trackUsage('ton-seqno', 1)
    setProcessing(true)
    setResult(null)
    setError(null)

    try {
      const data = await getWalletSeqno(address)
      setResult(data)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="ton-seqno-page">
      <nav className="page-sidebar">
        <div className="sidebar-header">
          <h3>Navigation</h3>
        </div>
        <div className="sidebar-links">
          <Link to="/broadcaster" className={`sidebar-link ${location.pathname === '/broadcaster' ? 'active' : ''}`}>
            <span className="sidebar-icon">🚀</span>
            <span className="sidebar-text">Broadcaster</span>
          </Link>
          <Link to="/simulator" className={`sidebar-link ${location.pathname === '/simulator' ? 'active' : ''}`}>
            <span className="sidebar-icon">⚡</span>
            <span className="sidebar-text">Simulator</span>
          </Link>
          <Link to="/tx-fetcher" className={`sidebar-link ${location.pathname === '/tx-fetcher' ? 'active' : ''}`}>
            <span className="sidebar-icon">📥</span>
            <span className="sidebar-text">TX Fetcher</span>
          </Link>
          <Link to="/ton-details" className={`sidebar-link ${location.pathname === '/ton-details' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔍</span>
            <span className="sidebar-text">TON Details</span>
          </Link>
          <Link to="/ton-batch-lookup" className={`sidebar-link ${location.pathname === '/ton-batch-lookup' ? 'active' : ''}`}>
            <span className="sidebar-icon">📋</span>
            <span className="sidebar-text">TON Safe-to-Fail</span>
          </Link>
          <Link to="/ton-seqno-check" className={`sidebar-link ${location.pathname === '/ton-seqno-check' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔢</span>
            <span className="sidebar-text">TON Seqno Check</span>
          </Link>
          <Link to="/btc-safe-to-fail" className={`sidebar-link ${location.pathname === '/btc-safe-to-fail' ? 'active' : ''}`}>
            <span className="sidebar-icon">₿</span>
            <span className="sidebar-text">BTC Safe-to-Fail</span>
          </Link>
          <Link to="/csv-builder" className={`sidebar-link ${location.pathname === '/csv-builder' ? 'active' : ''}`}>
            <span className="sidebar-icon">📊</span>
            <span className="sidebar-text">CSV Builder</span>
          </Link>
          <Link to="/faucet" className={`sidebar-link ${location.pathname === '/faucet' ? 'active' : ''}`}>
            <span className="sidebar-icon">🚰</span>
            <span className="sidebar-text">Faucet</span>
          </Link>
          <Link to="/webhook-tester" className={`sidebar-link ${location.pathname === '/webhook-tester' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔗</span>
            <span className="sidebar-text">Webhook Tester</span>
          </Link>
          <Link to="/callback-handler" className={`sidebar-link ${location.pathname === '/callback-handler' ? 'active' : ''}`}>
            <span className="sidebar-icon">🛡️</span>
            <span className="sidebar-text">Callback Handler</span>
          </Link>
        </div>
      </nav>

      <div className="ton-seqno-container">
        <div className="ton-seqno-header">
          <h1>🔢 TON Seqno Check</h1>
          <p className="subtitle">Look up the highest confirmed sequence number (seqno) for a TON wallet address</p>
        </div>

        <form onSubmit={handleSubmit} className="ton-seqno-form">
          <div className="form-group">
            <label htmlFor="address-input">TON Wallet Address:</label>
            <input
              id="address-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="EQC... or UQC... or 0:abc123..."
              disabled={processing}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="form-hint">
              Accepts bounceable, non-bounceable, or raw (workchain:hex) address formats
            </div>
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={processing || !input.trim()}
          >
            {processing ? 'Checking...' : 'Check Seqno'}
          </button>
        </form>

        {processing && (
          <div className="loading-container">
            <div className="spinner" />
            <span>Querying TON blockchain...</span>
          </div>
        )}

        {error && (
          <div className="result-card error">
            <div className="result-header">
              <h3>✗ Error</h3>
            </div>
            <div className="result-content">
              <div className="error-message">{error}</div>
            </div>
          </div>
        )}

        {result && (
          <div className="result-card success">
            <div className="result-header">
              <h3>✓ Wallet Info</h3>
            </div>
            <div className="result-content">
              <div className="result-field">
                <span className="field-label">Address (bounceable)</span>
                <span className="field-value"><CopyValue value={result.address} mono /></span>
              </div>
              {result.rawAddress && (
                <div className="result-field">
                  <span className="field-label">Raw Address</span>
                  <span className="field-value"><CopyValue value={result.rawAddress} mono /></span>
                </div>
              )}
              <div className="result-field">
                <span className="field-label">Account Status</span>
                <span className={`field-value status-badge status-${result.status}`}>
                  {result.status}
                </span>
              </div>
              {result.walletType && (
                <div className="result-field">
                  <span className="field-label">Wallet Type</span>
                  <span className="field-value">{result.walletType}</span>
                </div>
              )}
              <div className="seqno-highlight">
                <span className="seqno-label">Highest Confirmed Seqno</span>
                <span className="seqno-value">
                  {result.highestConfirmedSeqno !== null ? (
                    <CopyValue value={result.highestConfirmedSeqno} />
                  ) : (
                    <span className="seqno-na">N/A {result.nextSeqno === 0 ? '(no outgoing txs yet)' : '(wallet not initialized)'}</span>
                  )}
                </span>
              </div>
              <div className="result-field">
                <span className="field-label">Next Seqno (to use)</span>
                <span className="field-value">
                  {result.nextSeqno !== null ? result.nextSeqno : 'N/A'}
                </span>
              </div>
              <div className="result-field">
                <span className="field-label">Balance</span>
                <span className="field-value">{formatNano(result.balance)} TON</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TonSeqnoCheck
