import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ToolInfoPanel from '../components/ToolInfoPanel'
import './WebhookTester.css'

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

function tryParseJson(str) {
  if (!str) return null
  try { return JSON.parse(str) } catch { return null }
}

function prettyJson(str) {
  if (!str) return str
  try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
}

function extractEventInfo(event) {
  const parsed = tryParseJson(event.body)
  if (!parsed) return { eventType: event.method || 'Unknown', status: null, detail: null }
  const eventType = parsed.eventType || parsed.event_type || parsed.type || event.method || 'Unknown'
  const status = parsed.data?.status || parsed.status || null
  let detail = null
  if (parsed.data?.amount != null && parsed.data?.assetId) {
    detail = `${parsed.data.amount} ${parsed.data.assetId}`
  }
  if (parsed.data?.source?.name && parsed.data?.destination?.name) {
    const flow = `${parsed.data.source.name} → ${parsed.data.destination.name}`
    detail = detail ? `${detail} · ${flow}` : flow
  }
  return { eventType, status, detail }
}

const STATUS_STYLES = {
  QUEUED: '#eab308', PENDING: '#eab308', SUBMITTED: '#3b82f6',
  BROADCASTING: '#3b82f6', CONFIRMING: '#a855f7', COMPLETED: '#22c55e',
  CONFIRMED: '#22c55e', FAILED: '#ef4444', REJECTED: '#ef4444',
  CANCELLED: '#6b7280', BLOCKED: '#ef4444',
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
    <button className={`wht-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function EventBubble({ event, isExpanded, onToggle }) {
  const { eventType, status, detail } = extractEventInfo(event)
  const statusColor = STATUS_STYLES[status] || null
  const parsed = tryParseJson(event.body)
  const headerCount = event.headers ? Object.keys(event.headers).length : 0
  const [headersOpen, setHeadersOpen] = useState(false)

  return (
    <div className={`wht-bubble ${isExpanded ? 'expanded' : ''}`}>
      <button className="wht-bubble-summary" onClick={onToggle}>
        <span className="wht-bubble-dot" />
        <span className="wht-bubble-type">{eventType}</span>
        {status && (
          <span className="wht-bubble-status" style={statusColor ? { color: statusColor } : undefined}>
            {status}
          </span>
        )}
        {detail && <span className="wht-bubble-detail">{detail}</span>}
        <span className="wht-bubble-time">{timeAgo(event.timestamp)}</span>
      </button>

      {isExpanded && (
        <div className="wht-bubble-body">
          <div className="wht-detail-meta">
            <div className="wht-detail-row">
              <span className="wht-detail-label">Method</span>
              <span className="wht-detail-value">{event.method}</span>
            </div>
            <div className="wht-detail-row">
              <span className="wht-detail-label">Received</span>
              <span className="wht-detail-value">
                {event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'}
              </span>
            </div>
            {event.contentType && (
              <div className="wht-detail-row">
                <span className="wht-detail-label">Content-Type</span>
                <span className="wht-detail-value">{event.contentType}</span>
              </div>
            )}
            {event.query && event.query !== '' && event.query !== '?' && (
              <div className="wht-detail-row">
                <span className="wht-detail-label">Query</span>
                <code className="wht-detail-value">{event.query}</code>
              </div>
            )}
          </div>

          {headerCount > 0 && (
            <div className="wht-detail-section">
              <button className="wht-detail-toggle" onClick={() => setHeadersOpen(o => !o)}>
                <span className={`wht-chevron ${headersOpen ? 'open' : ''}`}>&#9654;</span>
                Headers ({headerCount})
              </button>
              {headersOpen && (
                <div className="wht-detail-headers">
                  {Object.entries(event.headers).map(([k, v]) => (
                    <div key={k} className="wht-detail-hrow">
                      <span className="wht-detail-hkey">{k}</span>
                      <span className="wht-detail-hval">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {event.body && (
            <div className="wht-detail-section">
              <div className="wht-detail-body-label">
                <span>Body</span>
                <CopyButton text={parsed ? JSON.stringify(parsed, null, 2) : event.body} />
              </div>
              <pre className="wht-detail-body-pre">{prettyJson(event.body)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────

function WebhookTester() {
  const location = useLocation()
  const [hooks, setHooks] = useState({})
  const [hookOrder, setHookOrder] = useState([])
  const [selectedHook, setSelectedHook] = useState(null)
  const [expandedEvent, setExpandedEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [secretInput, setSecretInput] = useState('')
  const [showSecretInput, setShowSecretInput] = useState(false)
  const wsRefs = useRef(new Map())
  const reconnectTimers = useRef(new Map())
  const mountedRef = useRef(true)

  useEffect(() => {
    document.title = 'Webhook Tester'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  // ─── WebSocket Logic (unchanged) ──────────────────────────

  const connectWebSocket = useCallback((hookId) => {
    if (!mountedRef.current) return
    const existing = wsRefs.current.get(hookId)
    if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
      return
    }

    const ws = new WebSocket(`${WS_BASE}/wht/ws/${hookId}`)
    wsRefs.current.set(hookId, ws)

    ws.onopen = () => {
      if (!mountedRef.current) return
      setHooks(prev => ({
        ...prev,
        [hookId]: { ...prev[hookId], status: 'connected' }
      }))
      reconnectTimers.current.delete(hookId)
    }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'history') {
          setHooks(prev => ({
            ...prev,
            [hookId]: { ...prev[hookId], events: msg.events || [] }
          }))
        } else if (msg.type === 'event') {
          setHooks(prev => {
            const existing = prev[hookId]?.events || []
            const updated = [msg.event, ...existing].slice(0, 30)
            return { ...prev, [hookId]: { ...prev[hookId], events: updated } }
          })
        } else if (msg.type === 'cleared') {
          setHooks(prev => ({
            ...prev,
            [hookId]: { ...prev[hookId], events: [] }
          }))
        } else if (msg.type === 'deleted') {
          ws.close()
          wsRefs.current.delete(hookId)
          setHooks(prev => {
            const next = { ...prev }
            delete next[hookId]
            return next
          })
          setHookOrder(prev => prev.filter(id => id !== hookId))
          setSelectedHook(prev => prev === hookId ? null : prev)
        }
      } catch { /* ignore malformed messages */ }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      wsRefs.current.delete(hookId)
      setHooks(prev => {
        if (!prev[hookId]) return prev
        return { ...prev, [hookId]: { ...prev[hookId], status: 'disconnected' } }
      })
      const attempt = (reconnectTimers.current.get(hookId) || 0) + 1
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000)
      const timer = setTimeout(() => {
        if (mountedRef.current) connectWebSocket(hookId)
      }, delay)
      reconnectTimers.current.set(hookId, attempt)
      reconnectTimers.current.set(`timer_${hookId}`, timer)
    }

    ws.onerror = () => { ws.close() }
  }, [])

  const disconnectWebSocket = useCallback((hookId) => {
    const ws = wsRefs.current.get(hookId)
    if (ws) { ws.onclose = null; ws.close(); wsRefs.current.delete(hookId) }
    clearTimeout(reconnectTimers.current.get(`timer_${hookId}`))
    reconnectTimers.current.delete(hookId)
    reconnectTimers.current.delete(`timer_${hookId}`)
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
      const res = await fetch(`${API_BASE}/wht/session`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Session init failed (${res.status})`)
      const data = await res.json()

      const initialHooks = {}
      const order = []
      if (data.hooks && data.hooks.length > 0) {
        for (const hook of data.hooks) {
          initialHooks[hook.id] = { events: [], status: 'connecting', createdAt: hook.createdAt }
          order.push(hook.id)
        }
      }
      setHooks(initialHooks)
      setHookOrder(order)
      if (order.length > 0) setSelectedHook(order[0])
      setLoading(false)
      for (const hookId of order) connectWebSocket(hookId)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setError(null)
    const secret = secretInput.trim() || null
    try {
      const fetchOpts = { method: 'POST', credentials: 'include' }
      if (secret) {
        fetchOpts.headers = { 'Content-Type': 'application/json' }
        fetchOpts.body = JSON.stringify({ secret })
      }
      const res = await fetch(`${API_BASE}/wht/generate`, fetchOpts)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Generate failed (${res.status})`)
      }
      const data = await res.json()
      const hookId = data.hookId
      setHooks(prev => ({
        ...prev,
        [hookId]: { events: [], status: 'connecting', createdAt: new Date().toISOString(), secret }
      }))
      setHookOrder(prev => [hookId, ...prev])
      setSelectedHook(hookId)
      setExpandedEvent(null)
      setSecretInput('')
      setShowSecretInput(false)
      connectWebSocket(hookId)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(hookId) {
    disconnectWebSocket(hookId)
    setHooks(prev => { const next = { ...prev }; delete next[hookId]; return next })
    setHookOrder(prev => {
      const next = prev.filter(id => id !== hookId)
      if (selectedHook === hookId) {
        setSelectedHook(next.length > 0 ? next[0] : null)
        setExpandedEvent(null)
      }
      return next
    })
    try { await fetch(`${API_BASE}/wht/url/${hookId}`, { method: 'DELETE', credentials: 'include' }) } catch { /* best effort */ }
  }

  async function handleClear(hookId) {
    setHooks(prev => ({ ...prev, [hookId]: { ...prev[hookId], events: [] } }))
    if (selectedHook === hookId) setExpandedEvent(null)
    try { await fetch(`${API_BASE}/wht/events/${hookId}`, { method: 'DELETE', credentials: 'include' }) } catch { /* best effort */ }
  }

  // ─── Derived ──────────────────────────────────────────────

  const activeHookData = selectedHook ? (hooks[selectedHook] || { events: [], status: 'disconnected' }) : null
  const activeEvents = activeHookData?.events || []
  const hookUrl = selectedHook ? `${API_BASE}/hook/${selectedHook}` : ''

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="wht-page">
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
        <div className="wht-center-msg">
          <span className="wht-spinner large" />
          <span>Initializing session&hellip;</span>
        </div>
      ) : hookOrder.length === 0 ? (
        <div className="wht-center-msg">
          <div className="wht-empty-icon">🔗</div>
          <h2 className="wht-empty-title">Webhook Tester</h2>
          <p className="wht-empty-text">
            Generate a temporary URL, point any service at it, and watch requests arrive in real time.
          </p>
          <button className="wht-generate-btn" onClick={handleGenerate} disabled={generating}>
            {generating ? <><span className="wht-spinner" /> Generating&hellip;</> : '+ Generate Your First URL'}
          </button>
          {error && <div className="wht-inline-error">{error}</div>}
        </div>
      ) : (
        <div className="wht-split">
          {/* Left panel: URL list */}
          <div className="wht-urls">
            <div className="wht-urls-header">
              <span className="wht-urls-title">Endpoints</span>
              <button
                className="wht-add-btn"
                onClick={() => showSecretInput ? handleGenerate() : setShowSecretInput(true)}
                disabled={generating}
                title="Generate new URL"
              >
                {generating ? <span className="wht-spinner" /> : '+ (New)'}
              </button>
            </div>
            {showSecretInput && (
              <div className="wht-secret-form">
                <input
                  type="text"
                  className="wht-secret-input"
                  placeholder="Secret key (optional)"
                  value={secretInput}
                  onChange={e => setSecretInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                />
                <div className="wht-secret-actions">
                  <button className="wht-secret-go" onClick={handleGenerate} disabled={generating}>
                    {generating ? <span className="wht-spinner" /> : 'Create'}
                  </button>
                  <button className="wht-secret-cancel" onClick={() => { setShowSecretInput(false); setSecretInput('') }}>
                    Cancel
                  </button>
                </div>
                <span className="wht-secret-hint">
                  For Fireblocks webhooks V1 that sign payloads with a secret key (x-webhook-secret header).
                </span>
              </div>
            )}
            <div className="wht-urls-list">
              {hookOrder.map(hookId => {
                const hk = hooks[hookId] || { events: [], status: 'disconnected' }
                const count = hk.events.length
                return (
                  <button
                    key={hookId}
                    className={`wht-url-item ${selectedHook === hookId ? 'active' : ''}`}
                    onClick={() => { setSelectedHook(hookId); setExpandedEvent(null) }}
                  >
                    <span className={`wht-dot ${hk.status}`} />
                    <div className="wht-url-item-text">
                      <span className="wht-url-item-id">
                        {hk.secret && <span className="wht-lock" title="Has secret key">🔒 </span>}
                        {hookId}
                      </span>
                      <span className="wht-url-item-count">{count} event{count !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right panel: events for selected URL */}
          <div className="wht-events">
            {selectedHook ? (
              <>
                <div className="wht-events-bar">
                  <div className="wht-events-bar-url">
                    <code className="wht-url-display">{hookUrl}</code>
                    <CopyButton text={hookUrl} />
                  </div>
                  <div className="wht-events-bar-actions">
                    <button className="wht-act clear" onClick={() => handleClear(selectedHook)} disabled={activeEvents.length === 0}>
                      Clear
                    </button>
                    <button className="wht-act delete" onClick={() => handleDelete(selectedHook)}>
                      Delete
                    </button>
                  </div>
                </div>
                {activeHookData?.secret && (
                  <div className="wht-secret-banner">
                    <span className="wht-secret-banner-label">🔒 Secret Key:</span>
                    <code className="wht-secret-banner-value">{activeHookData.secret}</code>
                    <CopyButton text={activeHookData.secret} />
                  </div>
                )}

                {error && (
                  <div className="wht-inline-error" style={{ margin: '0.5rem 1rem' }}>
                    {error}
                    <button className="wht-dismiss" onClick={() => setError(null)}>&times;</button>
                  </div>
                )}

                <div className="wht-events-scroll">
                  {activeEvents.length === 0 ? (
                    <div className="wht-waiting">
                      <span className="wht-waiting-icon">📡</span>
                      <p>Waiting for incoming webhooks&hellip;</p>
                      <p className="wht-waiting-sub">Send a request to the URL above to see it here.</p>
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
              <div className="wht-waiting">
                <p>Select a URL from the left to view events.</p>
              </div>
            )}
          </div>
        </div>
      )}
      <ToolInfoPanel toolId="webhook-tester" />
    </div>
  )
}

export default WebhookTester
