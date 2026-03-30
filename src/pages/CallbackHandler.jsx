import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './CallbackHandler.css'

const API_BASE = 'https://delicate-haze-2a16.tm8six.workers.dev'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

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

/** Decode JWT payload (middle segment) from raw JWT string. Returns parsed object or null. */
function decodeJwtPayload(jwt) {
  if (!jwt || typeof jwt !== 'string') return null
  const parts = jwt.trim().split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json)
  } catch {
    return null
  }
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
    <button className={`cbt-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function EventBubble({ event, isExpanded, onToggle }) {
  const [decodedRequestOpen, setDecodedRequestOpen] = useState(false)
  const [decodedResponseOpen, setDecodedResponseOpen] = useState(false)
  const [rawRequestOpen, setRawRequestOpen] = useState(false)
  const [rawResponseOpen, setRawResponseOpen] = useState(false)
  const actionLower = (event.action || '').toLowerCase()
  const decodedResponse = event.rawResponseSent ? decodeJwtPayload(event.rawResponseSent) : null
  const detail = event.asset && event.amount != null
    ? `${event.amount} ${event.asset}`
    : null
  const flow = event.sourceType && event.destType
    ? `${event.sourceType}:${event.sourceId} → ${event.destType}:${event.destId}`
    : null
  const summaryDetail = [detail, flow].filter(Boolean).join(' · ')

  return (
    <div className={`cbt-bubble ${isExpanded ? 'expanded' : ''}`}>
      <button className="cbt-bubble-summary" onClick={onToggle}>
        <span className={`cbt-bubble-dot ${actionLower === 'approve' ? 'approved' : 'rejected'}`} />
        <span className="cbt-bubble-operation">{event.operation || 'UNKNOWN'}</span>
        <span className={`cbt-bubble-action ${actionLower === 'approve' ? 'approve' : 'reject'}`}>
          {event.action}
        </span>
        {summaryDetail && <span className="cbt-bubble-detail">{summaryDetail}</span>}
        <span className="cbt-bubble-time">{timeAgo(event.timestamp)}</span>
      </button>

      {isExpanded && (
        <div className="cbt-bubble-body">
          {/* Request from Co-Signer */}
          <div className="cbt-detail-section-header request">Request from Co-Signer</div>
          <div className="cbt-detail-meta">
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Request ID</span>
              <span className="cbt-detail-value">{event.requestId || '—'}</span>
            </div>
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Operation</span>
              <span className="cbt-detail-value">{event.operation || '—'}</span>
            </div>
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Asset</span>
              <span className="cbt-detail-value">{event.asset || '—'}</span>
            </div>
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Amount</span>
              <span className="cbt-detail-value">{event.amount ?? '—'}</span>
            </div>
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Source</span>
              <span className="cbt-detail-value">
                {event.sourceType ? `${event.sourceType} (${event.sourceId})` : '—'}
              </span>
            </div>
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Destination</span>
              <span className="cbt-detail-value">
                {event.destType ? `${event.destType} (${event.destId})` : '—'}
              </span>
            </div>
            {event.destAddress && (
              <div className="cbt-detail-row">
                <span className="cbt-detail-label">Dest Address</span>
                <span className="cbt-detail-value">{event.destAddress}</span>
              </div>
            )}
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Received</span>
              <span className="cbt-detail-value">
                {event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'}
              </span>
            </div>
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">JWT Verified</span>
              <span className="cbt-detail-value">
                {event.verified ? '✓ Valid' : '✗ Failed'}
              </span>
            </div>
          </div>

          {/* Raw request from cosigner (opaque JWT) */}
          {event.rawRequestReceived != null && event.rawRequestReceived !== '' && (
            <div className="cbt-detail-section">
              <button className="cbt-detail-toggle" onClick={() => setRawRequestOpen(o => !o)}>
                <span className={`cbt-chevron ${rawRequestOpen ? 'open' : ''}`}>&#9654;</span>
                Request from cosigner (raw JWT)
              </button>
              {rawRequestOpen && (
                <>
                  <div className="cbt-detail-body-label">
                    <span>Request from cosigner</span>
                    <CopyButton text={event.rawRequestReceived} />
                  </div>
                  <pre className="cbt-detail-body-pre cbt-raw-jwt">
                    {event.rawRequestReceived}
                  </pre>
                </>
              )}
            </div>
          )}

          {/* Decoded request from Cosigner */}
          {event.rawPayload && (
            <div className="cbt-detail-section">
              <button className="cbt-detail-toggle" onClick={() => setDecodedRequestOpen(o => !o)}>
                <span className={`cbt-chevron ${decodedRequestOpen ? 'open' : ''}`}>&#9654;</span>
                Decoded request from Cosigner
              </button>
              {decodedRequestOpen && (
                <>
                  <div className="cbt-detail-body-label">
                    <span>Decoded request from Cosigner</span>
                    <CopyButton text={JSON.stringify(event.rawPayload, null, 2)} />
                  </div>
                  <pre className="cbt-detail-body-pre">
                    {JSON.stringify(event.rawPayload, null, 2)}
                  </pre>
                </>
              )}
            </div>
          )}

          {/* Response to Co-Signer */}
          <div className="cbt-detail-section-header response">Response to Co-Signer</div>
          <div className="cbt-detail-meta">
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Action</span>
              <span className={`cbt-detail-value ${actionLower}`}>{event.action}</span>
            </div>
            <div className="cbt-detail-row">
              <span className="cbt-detail-label">Request ID</span>
              <span className="cbt-detail-value">{event.requestId || '—'}</span>
            </div>
            {event.action === 'REJECT' && (
              <div className="cbt-detail-row">
                <span className="cbt-detail-label">Reason</span>
                <span className="cbt-detail-value">Callback handler auto-reject</span>
              </div>
            )}
          </div>

          {/* Raw response to cosigner (opaque JWT) */}
          {event.rawResponseSent != null && event.rawResponseSent !== '' && (
            <div className="cbt-detail-section">
              <button className="cbt-detail-toggle" onClick={() => setRawResponseOpen(o => !o)}>
                <span className={`cbt-chevron ${rawResponseOpen ? 'open' : ''}`}>&#9654;</span>
                Response to cosigner (raw JWT)
              </button>
              {rawResponseOpen && (
                <>
                  <div className="cbt-detail-body-label">
                    <span>Response to cosigner</span>
                    <CopyButton text={event.rawResponseSent} />
                  </div>
                  <pre className="cbt-detail-body-pre cbt-raw-jwt">
                    {event.rawResponseSent}
                  </pre>
                </>
              )}
            </div>
          )}

          {/* Decoded response to Cosigner (decode rawResponseSent ourselves) */}
          {(event.rawResponseSent != null && event.rawResponseSent !== '') && (
            <div className="cbt-detail-section">
              <button className="cbt-detail-toggle" onClick={() => setDecodedResponseOpen(o => !o)}>
                <span className={`cbt-chevron ${decodedResponseOpen ? 'open' : ''}`}>&#9654;</span>
                Decoded response to Cosigner
              </button>
              {decodedResponseOpen && (
                <>
                  <div className="cbt-detail-body-label">
                    <span>Decoded response to Cosigner</span>
                    {decodedResponse != null && (
                      <CopyButton text={JSON.stringify(decodedResponse, null, 2)} />
                    )}
                  </div>
                  <pre className="cbt-detail-body-pre">
                    {decodedResponse != null
                      ? JSON.stringify(decodedResponse, null, 2)
                      : 'Unable to decode JWT payload'}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────

function CallbackHandler() {
  const location = useLocation()
  const [handlers, setHandlers] = useState({})
  const [handlerOrder, setHandlerOrder] = useState([])
  const [selectedHandler, setSelectedHandler] = useState(null)
  const [expandedEvent, setExpandedEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [cosignerKeyInput, setCosignerKeyInput] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [pubKeyVisible, setPubKeyVisible] = useState(true)
  const wsRefs = useRef(new Map())
  const reconnectTimers = useRef(new Map())
  const mountedRef = useRef(true)

  useEffect(() => {
    document.title = 'Callback Handler Tester'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  // ─── WebSocket Logic ──────────────────────────────────────

  const connectWebSocket = useCallback((handlerId) => {
    if (!mountedRef.current) return
    const existing = wsRefs.current.get(handlerId)
    if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
      return
    }

    const ws = new WebSocket(`${WS_BASE}/cbt/ws/${handlerId}`)
    wsRefs.current.set(handlerId, ws)

    ws.onopen = () => {
      if (!mountedRef.current) return
      setHandlers(prev => ({
        ...prev,
        [handlerId]: { ...prev[handlerId], status: 'connected' }
      }))
      reconnectTimers.current.delete(handlerId)
    }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'history') {
          setHandlers(prev => ({
            ...prev,
            [handlerId]: { ...prev[handlerId], events: msg.events || [] }
          }))
        } else if (msg.type === 'event') {
          setHandlers(prev => {
            const existing = prev[handlerId]?.events || []
            const updated = [msg.event, ...existing].slice(0, 50)
            return { ...prev, [handlerId]: { ...prev[handlerId], events: updated } }
          })
        } else if (msg.type === 'deleted') {
          ws.close()
          wsRefs.current.delete(handlerId)
          setHandlers(prev => {
            const next = { ...prev }
            delete next[handlerId]
            return next
          })
          setHandlerOrder(prev => prev.filter(id => id !== handlerId))
          setSelectedHandler(prev => prev === handlerId ? null : prev)
        }
      } catch { /* ignore malformed messages */ }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      wsRefs.current.delete(handlerId)
      setHandlers(prev => {
        if (!prev[handlerId]) return prev
        return { ...prev, [handlerId]: { ...prev[handlerId], status: 'disconnected' } }
      })
      const attempt = (reconnectTimers.current.get(handlerId) || 0) + 1
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000)
      const timer = setTimeout(() => {
        if (mountedRef.current) connectWebSocket(handlerId)
      }, delay)
      reconnectTimers.current.set(handlerId, attempt)
      reconnectTimers.current.set(`timer_${handlerId}`, timer)
    }

    ws.onerror = () => { ws.close() }
  }, [])

  const disconnectWebSocket = useCallback((handlerId) => {
    const ws = wsRefs.current.get(handlerId)
    if (ws) { ws.onclose = null; ws.close(); wsRefs.current.delete(handlerId) }
    clearTimeout(reconnectTimers.current.get(`timer_${handlerId}`))
    reconnectTimers.current.delete(handlerId)
    reconnectTimers.current.delete(`timer_${handlerId}`)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    initSession()
    return () => {
      mountedRef.current = false
      for (const [, val] of wsRefs.current.entries()) { val.onclose = null; val.close() }
      wsRefs.current.clear()
      for (const [key, val] of reconnectTimers.current.entries()) {
        if (key.startsWith('timer_')) clearTimeout(val)
      }
      reconnectTimers.current.clear()
    }
  }, [])

  // ─── API Calls ────────────────────────────────────────────

  async function initSession() {
    try {
      const res = await fetch(`${API_BASE}/cbt/session`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Session init failed (${res.status})`)
      const data = await res.json()

      const initial = {}
      const order = []
      if (data.handlers && data.handlers.length > 0) {
        for (const h of data.handlers) {
          initial[h.id] = {
            events: [],
            status: 'connecting',
            callbackUrl: h.callbackUrl,
            callbackPublicKey: h.callbackPublicKey,
            action: h.action || 'REJECT',
            createdAt: h.createdAt,
          }
          order.push(h.id)
        }
      }
      setHandlers(initial)
      setHandlerOrder(order)
      if (order.length > 0) setSelectedHandler(order[0])
      setLoading(false)
      for (const hId of order) connectWebSocket(hId)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleCreate(cosignerKey) {
    const key = (cosignerKey || cosignerKeyInput).trim()
    if (!key || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/cbt/create`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosignerPublicKey: key }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Create failed (${res.status})`)
      }
      const data = await res.json()
      const hId = data.handlerId
      setHandlers(prev => ({
        ...prev,
        [hId]: {
          events: [],
          status: 'connecting',
          callbackUrl: data.callbackUrl,
          callbackPublicKey: data.callbackPublicKey,
          action: data.action || 'REJECT',
          createdAt: new Date().toISOString(),
        }
      }))
      setHandlerOrder(prev => [hId, ...prev])
      setSelectedHandler(hId)
      setExpandedEvent(null)
      setCosignerKeyInput('')
      setShowCreateForm(false)
      setPubKeyVisible(true)
      connectWebSocket(hId)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(handlerId) {
    disconnectWebSocket(handlerId)
    setHandlers(prev => { const next = { ...prev }; delete next[handlerId]; return next })
    setHandlerOrder(prev => {
      const next = prev.filter(id => id !== handlerId)
      if (selectedHandler === handlerId) {
        setSelectedHandler(next.length > 0 ? next[0] : null)
        setExpandedEvent(null)
      }
      return next
    })
    try {
      await fetch(`${API_BASE}/cbt/${handlerId}`, { method: 'DELETE', credentials: 'include' })
    } catch { /* best effort */ }
  }

  async function handleActionChange(handlerId, newAction) {
    setHandlers(prev => ({
      ...prev,
      [handlerId]: { ...prev[handlerId], action: newAction }
    }))
    try {
      await fetch(`${API_BASE}/cbt/action/${handlerId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: newAction }),
      })
    } catch { /* best effort — UI already updated optimistically */ }
  }

  // ─── Derived ──────────────────────────────────────────────

  const activeData = selectedHandler
    ? (handlers[selectedHandler] || { events: [], status: 'disconnected' })
    : null
  const activeEvents = activeData?.events || []

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="cbt-page">
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

      {/* Main content area */}
      {loading ? (
        <div className="cbt-center-msg">
          <span className="cbt-spinner large" />
          <span>Initializing session&hellip;</span>
        </div>
      ) : handlerOrder.length === 0 && !showCreateForm ? (
        <div className="cbt-center-msg">
          <div className="cbt-empty-icon">🛡️</div>
          <h2 className="cbt-empty-title">Callback Handler Tester</h2>
          <p className="cbt-empty-text">
            Create a Fireblocks-compatible Callback Handler server. Provide your Co-Signer&rsquo;s
            public key to get a callback URL and handler public key for your Co-Signer setup.
          </p>
          <div className="cbt-setup-form">
            <label className="cbt-setup-label">Co-Signer Public Key (PEM)</label>
            <textarea
              className="cbt-setup-textarea"
              placeholder={"-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhk...\n-----END PUBLIC KEY-----"}
              value={cosignerKeyInput}
              onChange={e => setCosignerKeyInput(e.target.value)}
            />
            <span className="cbt-setup-hint">
              Paste the RSA public key from your Co-Signer configuration. This is used to verify
              incoming transaction signing requests.
            </span>
            <button
              className="cbt-create-btn"
              onClick={() => handleCreate()}
              disabled={creating || !cosignerKeyInput.trim()}
            >
              {creating ? <><span className="cbt-spinner" /> Creating&hellip;</> : 'Create Callback Handler'}
            </button>
          </div>
          {error && <div className="cbt-inline-error">{error}</div>}
        </div>
      ) : (
        <div className="cbt-split">
          {/* Left panel: handler list */}
          <div className="cbt-handlers">
            <div className="cbt-handlers-header">
              <span className="cbt-handlers-title">Handlers</span>
              <button
                className="cbt-add-btn"
                onClick={() => setShowCreateForm(f => !f)}
                disabled={creating}
                title="Create new handler"
              >
                {creating ? <span className="cbt-spinner" /> : '+'}
              </button>
            </div>
            {showCreateForm && (
              <div className="cbt-inline-form">
                <textarea
                  className="cbt-inline-textarea"
                  placeholder={"Co-Signer public key (PEM)"}
                  value={cosignerKeyInput}
                  onChange={e => setCosignerKeyInput(e.target.value)}
                />
                <div className="cbt-inline-actions">
                  <button
                    className="cbt-inline-go"
                    onClick={() => handleCreate()}
                    disabled={creating || !cosignerKeyInput.trim()}
                  >
                    {creating ? <span className="cbt-spinner" /> : 'Create'}
                  </button>
                  <button
                    className="cbt-inline-cancel"
                    onClick={() => { setShowCreateForm(false); setCosignerKeyInput('') }}
                  >
                    Cancel
                  </button>
                </div>
                <span className="cbt-inline-hint">
                  Paste the RSA public key from your Co-Signer.
                </span>
              </div>
            )}
            <div className="cbt-handlers-list">
              {handlerOrder.map(hId => {
                const h = handlers[hId] || { events: [], status: 'disconnected' }
                const count = h.events.length
                return (
                  <button
                    key={hId}
                    className={`cbt-handler-item ${selectedHandler === hId ? 'active' : ''}`}
                    onClick={() => { setSelectedHandler(hId); setExpandedEvent(null) }}
                  >
                    <span className={`cbt-dot ${h.status}`} />
                    <div className="cbt-handler-item-text">
                      <span className="cbt-handler-item-id">{hId}</span>
                      <span className="cbt-handler-item-count">{count} event{count !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right panel: handler detail + events */}
          <div className="cbt-events">
            {selectedHandler ? (
              <>
                {/* Top bar: callback URL + actions */}
                <div className="cbt-events-bar">
                  <div className="cbt-events-bar-url">
                    <code className="cbt-url-display">{activeData?.callbackUrl || ''}</code>
                    {activeData?.callbackUrl && <CopyButton text={activeData.callbackUrl} />}
                  </div>
                  <div className="cbt-events-bar-actions">
                    <button className="cbt-act clear" onClick={() => handleClear(selectedHandler)} disabled={activeEvents.length === 0}>
                      Clear
                    </button>
                    <button className="cbt-act delete" onClick={() => handleDelete(selectedHandler)}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Info banner: public key */}
                <div className="cbt-info-banner">
                  <div className="cbt-info-row">
                    <span className="cbt-info-label">Callback URL</span>
                    <span className="cbt-info-value">{activeData?.callbackUrl || '—'}</span>
                    {activeData?.callbackUrl && <CopyButton text={activeData.callbackUrl} />}
                  </div>
                  <div className="cbt-info-row">
                    <span className="cbt-info-label">Handler Public Key</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button className="cbt-pubkey-toggle" onClick={() => setPubKeyVisible(v => !v)}>
                        <span className={`cbt-chevron ${pubKeyVisible ? 'open' : ''}`}>&#9654;</span>
                        {pubKeyVisible ? 'Hide' : 'Show'} Public Key
                      </button>
                      {pubKeyVisible && activeData?.callbackPublicKey && (
                        <pre className="cbt-pubkey-pre">{activeData.callbackPublicKey}</pre>
                      )}
                    </div>
                    {activeData?.callbackPublicKey && <CopyButton text={activeData.callbackPublicKey} />}
                  </div>
                </div>

                {/* Action toggle */}
                <div className="cbt-action-toggle">
                  <span className="cbt-action-label">Auto-Response:</span>
                  <div className="cbt-toggle-group">
                    <button
                      className={`cbt-toggle-opt ${activeData?.action === 'APPROVE' ? 'active-approve' : ''}`}
                      onClick={() => handleActionChange(selectedHandler, 'APPROVE')}
                    >
                      APPROVE
                    </button>
                    <button
                      className={`cbt-toggle-opt ${activeData?.action === 'REJECT' ? 'active-reject' : ''}`}
                      onClick={() => handleActionChange(selectedHandler, 'REJECT')}
                    >
                      REJECT
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="cbt-inline-error" style={{ margin: '0.5rem 1rem' }}>
                    {error}
                    <button className="cbt-dismiss" onClick={() => setError(null)}>&times;</button>
                  </div>
                )}

                {/* Event list */}
                <div className="cbt-events-scroll">
                  {activeEvents.length === 0 ? (
                    <div className="cbt-waiting">
                      <span className="cbt-waiting-icon">📡</span>
                      <p>Waiting for Co-Signer requests&hellip;</p>
                      <p className="cbt-waiting-sub">
                        Configure your Co-Signer with the callback URL and public key above,
                        then trigger a transaction to see requests here.
                      </p>
                    </div>
                  ) : (
                    activeEvents.map(evt => (
                      <EventBubble
                        key={evt.id}
                        event={evt}
                        isExpanded={expandedEvent === evt.id}
                        onToggle={() => setExpandedEvent(expandedEvent === evt.id ? null : evt.id)}
                      />
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="cbt-waiting">
                <p>Select a handler from the left to view details.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  function handleClear(handlerId) {
    setHandlers(prev => ({ ...prev, [handlerId]: { ...prev[handlerId], events: [] } }))
    if (selectedHandler === handlerId) setExpandedEvent(null)
  }
}

export default CallbackHandler
