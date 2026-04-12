import { useState, useEffect, useRef } from 'react'
import ToolInfoPanel from '../components/ToolInfoPanel'
import './TxIdGenerator.css'

const API_BASE = 'https://delicate-haze-2a16.tm8six.workers.dev'

function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* noop */ }
  }
  return (
    <button className={`txid-copy-btn ${copied ? 'copied' : ''} ${className}`} onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export default function TxIdGenerator() {
  const [publicKey, setPublicKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [lastId, setLastId] = useState(null)
  const [generating, setGenerating] = useState(false)

  const [batchCount, setBatchCount] = useState(5)
  const [batchIds, setBatchIds] = useState([])
  const [batchGenerating, setBatchGenerating] = useState(false)

  const [history, setHistory] = useState([])

  const [regenerating, setRegenerating] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)

  const mountedRef = useRef(true)

  useEffect(() => {
    document.title = 'ExternalTxId Generator'
    mountedRef.current = true
    initSession()
    return () => {
      mountedRef.current = false
      document.title = 'Monad Boss Game'
    }
  }, [])

  async function initSession() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/tx-id/session`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Session init failed (${res.status})`)
      const data = await res.json()
      if (!mountedRef.current) return
      setPublicKey(data.publicKey)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/tx-id/generate`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Generate failed (${res.status})`)
      const data = await res.json()
      if (!mountedRef.current) return
      setLastId(data.externalTxId)
      setHistory(prev => [{ id: data.externalTxId, ts: Date.now() }, ...prev].slice(0, 50))
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message)
    } finally {
      if (mountedRef.current) setGenerating(false)
    }
  }

  async function handleBatchGenerate() {
    if (batchGenerating) return
    setBatchGenerating(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/tx-id/generate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: batchCount }),
      })
      if (!res.ok) throw new Error(`Batch generate failed (${res.status})`)
      const data = await res.json()
      if (!mountedRef.current) return
      setBatchIds(data.externalTxIds || [])
      setHistory(prev => [
        ...(data.externalTxIds || []).map(id => ({ id, ts: Date.now() })),
        ...prev,
      ].slice(0, 50))
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message)
    } finally {
      if (mountedRef.current) setBatchGenerating(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setError(null)
    setShowRegenerateConfirm(false)
    try {
      const res = await fetch(`${API_BASE}/tx-id/session`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Regenerate failed (${res.status})`)
      const data = await res.json()
      if (!mountedRef.current) return
      setPublicKey(data.publicKey)
      setLastId(null)
      setBatchIds([])
      setHistory([])
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message)
    } finally {
      if (mountedRef.current) setRegenerating(false)
    }
  }

  const charCount = lastId ? lastId.length : 0

  return (
    <div className="txid-page">
      <div className="txid-container">
        <div className="txid-header">
          <h1 className="txid-title">ExternalTxId Generator</h1>
          <p className="txid-subtitle">
            Generate cryptographically signed Fireblocks <code>externalTxId</code> values.
            Each ID is signed with your session's Ed25519 private key — only you can produce valid IDs.
          </p>
        </div>

        {loading && (
          <div className="txid-loading">
            <span className="txid-spinner" />
            Initialising session&hellip;
          </div>
        )}

        {error && (
          <div className="txid-error">
            {error}
            <button className="txid-dismiss" onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {!loading && publicKey && (
          <>
            {/* ── Public Key ── */}
            <section className="txid-section">
              <div className="txid-section-header">
                <div>
                  <h2 className="txid-section-title">Your Public Key</h2>
                  <p className="txid-section-sub">
                    Paste this into <strong>Callback Handler → ExternalTxId Verification</strong> to verify incoming IDs.
                  </p>
                </div>
                <CopyButton text={publicKey} />
              </div>
              <pre className="txid-pubkey-box">{publicKey}</pre>
              <div className="txid-section-footer">
                <span className="txid-meta">{publicKey.length} hex chars · Ed25519 raw public key</span>
                <button
                  className="txid-regen-btn"
                  onClick={() => setShowRegenerateConfirm(true)}
                  disabled={regenerating}
                >
                  {regenerating ? <><span className="txid-spinner-sm" /> Rotating…</> : 'Rotate Keys'}
                </button>
              </div>
              {showRegenerateConfirm && (
                <div className="txid-confirm-banner">
                  <span>Rotating generates a new key pair. IDs from the old key will no longer verify. Continue?</span>
                  <button className="txid-confirm-yes" onClick={handleRegenerate}>Yes, rotate</button>
                  <button className="txid-confirm-no" onClick={() => setShowRegenerateConfirm(false)}>Cancel</button>
                </div>
              )}
            </section>

            {/* ── Single Generate ── */}
            <section className="txid-section">
              <h2 className="txid-section-title">Generate ID</h2>
              <div className="txid-generate-row">
                <button
                  className="txid-generate-btn"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? <><span className="txid-spinner-sm" /> Generating…</> : 'Generate'}
                </button>
              </div>
              {lastId && (
                <div className="txid-result">
                  <div className="txid-result-header">
                    <span className="txid-result-label">externalTxId</span>
                    <span className="txid-char-count">{charCount} chars</span>
                    <CopyButton text={lastId} />
                  </div>
                  <pre className="txid-result-pre">{lastId}</pre>
                  <div className="txid-result-breakdown">
                    <span className="txid-breakdown-part payload" title="base64url(16-byte UUID)">
                      {lastId.split('.')[0]}
                    </span>
                    <span className="txid-breakdown-dot">.</span>
                    <span className="txid-breakdown-part sig" title="base64url(Ed25519 signature)">
                      {lastId.split('.')[1]}
                    </span>
                  </div>
                  <p className="txid-result-hint">
                    <span className="txid-badge payload-badge">UUID</span> base64url-encoded 16 random bytes ·
                    <span className="txid-badge sig-badge">SIG</span> Ed25519 signature of those bytes
                  </p>
                </div>
              )}
            </section>

            {/* ── Batch Generate ── */}
            <section className="txid-section">
              <h2 className="txid-section-title">Batch Generate</h2>
              <div className="txid-batch-controls">
                <label className="txid-batch-label">
                  Count
                  <input
                    type="number"
                    className="txid-batch-input"
                    min={1}
                    max={100}
                    value={batchCount}
                    onChange={e => setBatchCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </label>
                <button
                  className="txid-generate-btn"
                  onClick={handleBatchGenerate}
                  disabled={batchGenerating}
                >
                  {batchGenerating ? <><span className="txid-spinner-sm" /> Generating…</> : 'Generate Batch'}
                </button>
                {batchIds.length > 0 && (
                  <CopyButton text={batchIds.join('\n')} className="txid-batch-copy" />
                )}
              </div>
              {batchIds.length > 0 && (
                <div className="txid-batch-result">
                  {batchIds.map((id, i) => (
                    <div key={i} className="txid-batch-row">
                      <span className="txid-batch-idx">{i + 1}</span>
                      <code className="txid-batch-id">{id}</code>
                      <CopyButton text={id} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── History ── */}
            {history.length > 0 && (
              <section className="txid-section txid-history-section">
                <div className="txid-section-header">
                  <h2 className="txid-section-title">Session History</h2>
                  <button className="txid-clear-btn" onClick={() => setHistory([])}>Clear</button>
                </div>
                <p className="txid-section-sub">Generated this session — cleared on page refresh.</p>
                <div className="txid-history-list">
                  {history.map((item, i) => (
                    <div key={i} className="txid-history-row">
                      <code className="txid-history-id">{item.id}</code>
                      <span className="txid-history-time">{new Date(item.ts).toLocaleTimeString()}</span>
                      <CopyButton text={item.id} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <ToolInfoPanel toolId="tx-id-generator" />
    </div>
  )
}
