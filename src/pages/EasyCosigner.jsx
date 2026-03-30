import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './EasyCosigner.css'

const API_BASE = 'https://delicate-haze-2a16.tm8six.workers.dev'

const COSIGNER_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4L0wYm0dEkN6KtHkG1yJ
2yL2CfcOntYtucfCY7EL6HzEDyyxreLexhNN84ipLfImheHV7woTydZ/AuDbu4r9
TvgQzk1NwzrhDn92HGcoEYgb4odv1DaWSHavmFedkHJbGcOKGjozDfXitjsaLVJd
rfTNbBy5f9JHpHp1NfETkjRYJmojvW4KnlH4TzT8E2UPbtAhOOP9vPbhJoDIVuj3
xS0Um1VrnWop+GPJgELdiFkS7J6vwZB/toW7qXgKYemHFreYHz9W9jHtDouwdgG/
M9U8KTTqBTUTrdaShUXHSlIye+/ytA7QygDuOZbSXZ1xSml7WJIemJqjL3jF5ITJ
CQIDAQAB
-----END PUBLIC KEY-----`

function timeAgo(ts) {
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime()
  if (isNaN(ms)) return ''
  const diff = (Date.now() - ms) / 1000
  if (diff < 5) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* noop */ }
  }
  return (
    <button className={`ecs-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function EasyCosigner() {
  const location = useLocation()
  const [pairingToken, setPairingToken] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [callbackPublicKey, setCallbackPublicKey] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [pubKeyVisible, setPubKeyVisible] = useState(false)
  const pollRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    document.title = 'Easy Cosigner'
    mountedRef.current = true
    return () => {
      document.title = 'Monad Boss Game'
      mountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const pollStatus = useCallback((id) => {
    const interval = setInterval(async () => {
      if (!mountedRef.current) { clearInterval(interval); return }
      try {
        const res = await fetch(`${API_BASE}/cosigner/status/${id}`)
        if (!res.ok) return
        const data = await res.json()
        setSubmissions(prev => prev.map(s =>
          s.id === id ? { ...s, status: data.status, error: data.error } : s
        ))
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval)
        }
      } catch { /* ignore polling errors */ }
    }, 5000)
    return interval
  }, [])

  const pollIntervals = useRef(new Map())

  useEffect(() => {
    return () => {
      for (const interval of pollIntervals.current.values()) {
        clearInterval(interval)
      }
      pollIntervals.current.clear()
    }
  }, [])

  async function handleSubmit() {
    const token = pairingToken.trim()
    if (!token || submitting) return
    setSubmitting(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const body = { pairingToken: token }
      if (callbackUrl.trim()) body.callbackUrl = callbackUrl.trim()
      if (callbackPublicKey.trim()) body.callbackPublicKey = callbackPublicKey.trim()

      const res = await fetch(`${API_BASE}/cosigner/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Submit failed (${res.status})`)
      }

      const data = await res.json()
      const newSubmission = {
        id: data.id,
        tokenPreview: token.length > 40 ? token.slice(0, 20) + '...' + token.slice(-16) : token,
        status: data.status || 'pending',
        submittedAt: Date.now(),
        error: null,
      }

      setSubmissions(prev => [newSubmission, ...prev])
      setPairingToken('')
      setCallbackUrl('')
      setCallbackPublicKey('')
      setAdvancedOpen(false)
      setSuccessMsg(
        'Pairing token submitted! In about 30\u2013120 seconds, the workspace owner should receive MPC key approval notifications in the Fireblocks console.'
      )

      const interval = pollStatus(data.id)
      pollIntervals.current.set(data.id, interval)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const hasSubmissions = submissions.length > 0

  return (
    <div className="ecs-page">
      {/* Nav sidebar */}
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
          <Link to="/btc-fetcher" className={`sidebar-link ${location.pathname === '/btc-fetcher' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔗</span>
            <span className="sidebar-text">BTC Fetcher</span>
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
          <Link to="/easy-cosigner" className={`sidebar-link ${location.pathname === '/easy-cosigner' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔐</span>
            <span className="sidebar-text">Easy Cosigner</span>
          </Link>
        </div>
      </nav>

      {/* Main content */}
      {!hasSubmissions ? (
        <div className="ecs-center-msg">
          <div className="ecs-empty-icon">🔐</div>
          <h2 className="ecs-empty-title">Easy Cosigner</h2>
          <p className="ecs-empty-text">
            Paste a pairing token from the Fireblocks console to pair a new API user with the co-signer.
            The token will be picked up automatically by the cosigner agent.
          </p>
          <div className="ecs-setup-form">
            <label className="ecs-setup-label">Pairing Token</label>
            <textarea
              className="ecs-setup-textarea"
              placeholder="Paste your pairing token here..."
              value={pairingToken}
              onChange={e => setPairingToken(e.target.value)}
            />
            <span className="ecs-setup-hint">
              Copy the pairing token from the Fireblocks console workspace settings.
            </span>

            <button
              className="ecs-advanced-toggle"
              onClick={() => setAdvancedOpen(o => !o)}
              type="button"
            >
              <span className={`ecs-chevron ${advancedOpen ? 'open' : ''}`}>&#9654;</span>
              Advanced Options
            </button>

            {advancedOpen && (
              <div className="ecs-advanced-section">
                <label className="ecs-setup-label">Callback Handler URL</label>
                <input
                  className="ecs-setup-input"
                  type="text"
                  placeholder="https://your-callback-handler.example.com"
                  value={callbackUrl}
                  onChange={e => setCallbackUrl(e.target.value)}
                />
                <span className="ecs-setup-hint">
                  If using a callback handler, provide the URL here.
                </span>

                <label className="ecs-setup-label">Callback Handler Public Key (PEM)</label>
                <textarea
                  className="ecs-setup-textarea"
                  placeholder={"-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhk...\n-----END PUBLIC KEY-----"}
                  value={callbackPublicKey}
                  onChange={e => setCallbackPublicKey(e.target.value)}
                />
                <span className="ecs-setup-hint">
                  The RSA public key for your callback handler (used for request verification).
                </span>
              </div>
            )}

            <button
              className="ecs-submit-btn"
              onClick={handleSubmit}
              disabled={submitting || !pairingToken.trim()}
            >
              {submitting ? <><span className="ecs-spinner" /> Submitting&hellip;</> : 'Submit Pairing Token'}
            </button>
          </div>
          {error && (
            <div className="ecs-inline-error">
              {error}
              <button className="ecs-dismiss" onClick={() => setError(null)}>&times;</button>
            </div>
          )}
          {successMsg && (
            <div className="ecs-success-banner">
              <span>{successMsg}</span>
              <button className="ecs-dismiss" onClick={() => setSuccessMsg(null)}>&times;</button>
            </div>
          )}
        </div>
      ) : (
        <div className="ecs-content">
          <h2 className="ecs-content-title">Easy Cosigner</h2>
          <p className="ecs-content-subtitle">Pairing token assistant for co-signer setup</p>

          {/* Cosigner public key banner */}
          <div className="ecs-info-banner">
            <div className="ecs-info-row">
              <span className="ecs-info-label">Cosigner Public Key</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button className="ecs-pubkey-toggle" onClick={() => setPubKeyVisible(v => !v)}>
                  <span className={`ecs-chevron ${pubKeyVisible ? 'open' : ''}`}>&#9654;</span>
                  {pubKeyVisible ? 'Hide' : 'Show'} Public Key
                </button>
                {pubKeyVisible && (
                  <pre className="ecs-pubkey-pre">{COSIGNER_PUBLIC_KEY}</pre>
                )}
              </div>
              <CopyButton text={COSIGNER_PUBLIC_KEY} />
            </div>
          </div>

          {/* Submit new token form */}
          <div className="ecs-new-token-form">
            <div className="ecs-new-token-header">
              <span className="ecs-new-token-title">Submit New Pairing Token</span>
            </div>
            <div className="ecs-new-token-row">
              <textarea
                className="ecs-setup-textarea"
                placeholder="Paste your pairing token here..."
                value={pairingToken}
                onChange={e => setPairingToken(e.target.value)}
              />
            </div>

            <button
              className="ecs-advanced-toggle"
              onClick={() => setAdvancedOpen(o => !o)}
              type="button"
            >
              <span className={`ecs-chevron ${advancedOpen ? 'open' : ''}`}>&#9654;</span>
              Advanced Options
            </button>

            {advancedOpen && (
              <div className="ecs-advanced-section">
                <label className="ecs-setup-label">Callback Handler URL</label>
                <input
                  className="ecs-setup-input"
                  type="text"
                  placeholder="https://your-callback-handler.example.com"
                  value={callbackUrl}
                  onChange={e => setCallbackUrl(e.target.value)}
                />
                <label className="ecs-setup-label">Callback Handler Public Key (PEM)</label>
                <textarea
                  className="ecs-setup-textarea"
                  placeholder={"-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhk...\n-----END PUBLIC KEY-----"}
                  value={callbackPublicKey}
                  onChange={e => setCallbackPublicKey(e.target.value)}
                  style={{ minHeight: '80px' }}
                />
              </div>
            )}

            <div className="ecs-new-token-actions">
              <button
                className="ecs-new-token-submit"
                onClick={handleSubmit}
                disabled={submitting || !pairingToken.trim()}
              >
                {submitting ? <><span className="ecs-spinner" /> Submitting&hellip;</> : 'Submit'}
              </button>
            </div>

            {error && (
              <div className="ecs-inline-error">
                {error}
                <button className="ecs-dismiss" onClick={() => setError(null)}>&times;</button>
              </div>
            )}
            {successMsg && (
              <div className="ecs-success-banner">
                <span>{successMsg}</span>
                <button className="ecs-dismiss" onClick={() => setSuccessMsg(null)}>&times;</button>
              </div>
            )}
          </div>

          {/* Submission history */}
          <div className="ecs-submissions-header">Submission History</div>
          <div className="ecs-submissions-list">
            {submissions.map(sub => (
              <div key={sub.id} className="ecs-submission-item">
                <span className={`ecs-status-dot ${sub.status}`} />
                <div className="ecs-submission-info">
                  <span className="ecs-submission-token">{sub.tokenPreview}</span>
                  <span className="ecs-submission-meta">
                    <span>ID: {sub.id}</span>
                    <span>{timeAgo(sub.submittedAt)}</span>
                  </span>
                  {sub.error && (
                    <span className="ecs-submission-error">{sub.error}</span>
                  )}
                </div>
                <span className={`ecs-submission-status ${sub.status}`}>
                  {sub.status === 'picked_up' ? 'Picked Up' : sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default EasyCosigner
