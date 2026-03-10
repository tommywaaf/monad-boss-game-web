import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './WebhookTester.css'

const API_BASE = 'https://delicate-haze-2a16.tm8six.workers.dev'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

function timeAgo(ts) {
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime()
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

function extractSummary(event) {
  const parsed = tryParseJson(event.body)
  if (!parsed) return { eventType: null, status: null, detail: null }

  const eventType = parsed.eventType || parsed.event_type || parsed.type || null
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

const EVENT_TYPE_COLORS = {
  transaction: '#3b82f6',
  transfer: '#22c55e',
  payment: '#8b5cf6',
  vault: '#f59e0b',
  webhook: '#06b6d4',
  address: '#ec4899',
  default: '#6b7280',
}

function getEventColor(eventType) {
  if (!eventType) return EVENT_TYPE_COLORS.default
  const lower = eventType.toLowerCase()
  for (const [key, color] of Object.entries(EVENT_TYPE_COLORS)) {
    if (lower.includes(key)) return color
  }
  return EVENT_TYPE_COLORS.default
}

const STATUS_COLORS = {
  QUEUED: '#eab308',
  PENDING: '#eab308',
  SUBMITTED: '#3b82f6',
  BROADCASTING: '#3b82f6',
  CONFIRMING: '#a855f7',
  COMPLETED: '#22c55e',
  CONFIRMED: '#22c55e',
  FAILED: '#ef4444',
  REJECTED: '#ef4444',
  CANCELLED: '#6b7280',
  BLOCKED: '#ef4444',
}

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
    <button className={`wht-copy-btn ${copied ? 'copied' : ''} ${className}`} onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function EventBubble({ event, isSelected, onClick }) {
  const { eventType, status, detail } = extractSummary(event)
  const color = getEventColor(eventType)
  const statusColor = STATUS_COLORS[status] || null
  const ts = event.timestamp || (tryParseJson(event.body)?.createdAt)

  return (
    <button
      className={`wht-bubble ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="wht-bubble-dot" style={{ background: color }} />
      <div className="wht-bubble-content">
        <span className="wht-bubble-type" style={{ color }}>
          {eventType || event.method || 'Unknown'}
        </span>
        <div className="wht-bubble-meta">
          {status && (
            <span className="wht-bubble-status" style={statusColor ? { color: statusColor } : undefined}>
              {status}
            </span>
          )}
          {detail && <span className="wht-bubble-detail">{detail}</span>}
        </div>
      </div>
      <span className="wht-bubble-time">{ts ? timeAgo(ts) : ''}</span>
    </button>
  )
}

function EventDetail({ event, onClose }) {
  if (!event) return null
  const parsed = tryParseJson(event.body)
  const { eventType, status } = extractSummary(event)
  const headerCount = event.headers ? Object.keys(event.headers).length : 0
  const [headersOpen, setHeadersOpen] = useState(false)

  return (
    <div className="wht-detail">
      <div className="wht-detail-header">
        <div className="wht-detail-title-row">
          <span className="wht-detail-type" style={{ color: getEventColor(eventType) }}>
            {eventType || event.method || 'Webhook Event'}
          </span>
          {status && (
            <span
              className="wht-detail-status"
              style={{ color: STATUS_COLORS[status] || '#a1a1aa' }}
            >
              {status}
            </span>
          )}
        </div>
        <button className="wht-detail-close" onClick={onClose}>&times;</button>
      </div>

      <div className="wht-detail-info">
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
        {event.id && (
          <div className="wht-detail-row">
            <span className="wht-detail-label">Event ID</span>
            <code className="wht-detail-value wht-detail-mono">{event.id}</code>
          </div>
        )}
      </div>

      {headerCount > 0 && (
        <div className="wht-detail-section">
          <button className="wht-detail-section-toggle" onClick={() => setHeadersOpen(o => !o)}>
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
          <div className="wht-detail-section-label">
            Body
            <CopyButton text={parsed ? JSON.stringify(parsed, null, 2) : event.body} className="small" />
          </div>
          <pre className="wht-detail-body">{prettyJson(event.body)}</pre>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────

function WebhookTester() {
  const location = useLocation()
  const [hooks, setHooks] = useState({})
  const [hookOrder, setHookOrder] = useState([])
  const [selectedHook, setSelectedHook] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const wsRefs = useRef(new Map())
  const reconnectTimers = useRef(new Map())
  const mountedRef = useRef(true)

  useEffect(() => {
    document.title = 'Webhook Tester'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  // ─── WebSocket Logic ──────────────────────────────────────

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
          setSelectedEvent(prev => {
            if (!prev) return null
            const evts = hooks[hookId]?.events || []
            if (evts.some(e => e.id === prev.id)) return null
            return prev
          })
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
          setSelectedEvent(null)
        }
      } catch { /* ignore malformed */ }
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
    try {
      const res = await fetch(`${API_BASE}/wht/generate`, { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Generate failed (${res.status})`)
      }
      const data = await res.json()
      const hookId = data.hookId
      setHooks(prev => ({
        ...prev,
        [hookId]: { events: [], status: 'connecting', createdAt: new Date().toISOString() }
      }))
      setHookOrder(prev => [hookId, ...prev])
      setSelectedHook(hookId)
      setSelectedEvent(null)
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
        setSelectedEvent(null)
      }
      return next
    })
    try { await fetch(`${API_BASE}/wht/url/${hookId}`, { method: 'DELETE', credentials: 'include' }) } catch { /* best effort */ }
  }

  async function handleClear(hookId) {
    setHooks(prev => ({ ...prev, [hookId]: { ...prev[hookId], events: [] } }))
    if (selectedHook === hookId) setSelectedEvent(null)
    try { await fetch(`${API_BASE}/wht/events/${hookId}`, { method: 'DELETE', credentials: 'include' }) } catch { /* best effort */ }
  }

  // ─── Derived State ────────────────────────────────────────

  const selectedHookData = selectedHook ? (hooks[selectedHook] || { events: [], status: 'disconnected' }) : null
  const selectedEvents = selectedHookData?.events || []
  const hookUrl = selectedHook ? `${API_BASE}/hook/${selectedHook}` : ''

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="wht-page">
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
        </div>
      </nav>

      <div className="wht-main">
        {loading ? (
          <div className="wht-loading">
            <span className="wht-spinner large" />
            <span>Initializing session&hellip;</span>
          </div>
        ) : hookOrder.length === 0 ? (
          <div className="wht-empty-state">
            <div className="wht-empty-icon">🔗</div>
            <h2>Webhook Tester</h2>
            <p>
              Generate a temporary URL, point any external service at it,
              and watch incoming requests appear here in real time.
            </p>
            <button className="wht-generate-btn" onClick={handleGenerate} disabled={generating}>
              {generating ? <><span className="wht-spinner" /> Generating&hellip;</> : '+ Generate Your First URL'}
            </button>
          </div>
        ) : (
          <div className="wht-split">
            {/* ── Left: URL List ── */}
            <div className="wht-url-panel">
              <div className="wht-url-panel-header">
                <span className="wht-url-panel-title">Endpoints</span>
                <button className="wht-generate-sm" onClick={handleGenerate} disabled={generating}>
                  {generating ? <span className="wht-spinner" /> : '+'}
                </button>
              </div>
              <div className="wht-url-list">
                {hookOrder.map(hookId => {
                  const data = hooks[hookId] || { events: [], status: 'disconnected' }
                  const count = data.events.length
                  return (
                    <button
                      key={hookId}
                      className={`wht-url-item ${selectedHook === hookId ? 'active' : ''}`}
                      onClick={() => { setSelectedHook(hookId); setSelectedEvent(null) }}
                    >
                      <span className={`wht-status-dot ${data.status}`} />
                      <div className="wht-url-item-info">
                        <span className="wht-url-item-id">{hookId}</span>
                        <span className="wht-url-item-count">
                          {count} event{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Right: Events ── */}
            <div className="wht-events-panel">
              {selectedHook ? (
                <>
                  {/* URL header bar */}
                  <div className="wht-events-header">
                    <div className="wht-events-url-row">
                      <code className="wht-events-url">{hookUrl}</code>
                      <CopyButton text={hookUrl} />
                    </div>
                    <div className="wht-events-actions">
                      <button className="wht-action-btn clear" onClick={() => handleClear(selectedHook)} disabled={selectedEvents.length === 0}>
                        Clear
                      </button>
                      <button className="wht-action-btn delete" onClick={() => handleDelete(selectedHook)}>
                        Delete
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="wht-error-banner">
                      <span>{error}</span>
                      <button onClick={() => setError(null)}>&times;</button>
                    </div>
                  )}

                  {/* Event bubbles + detail split */}
                  <div className="wht-events-body">
                    <div className={`wht-bubbles-col ${selectedEvent ? 'has-detail' : ''}`}>
                      {selectedEvents.length === 0 ? (
                        <div className="wht-no-events">
                          <div className="wht-no-events-icon">📡</div>
                          <p>Waiting for webhooks&hellip;</p>
                          <p className="wht-no-events-hint">
                            Send a request to the URL above to see it here.
                          </p>
                        </div>
                      ) : (
                        selectedEvents.map(evt => (
                          <EventBubble
                            key={evt.id}
                            event={evt}
                            isSelected={selectedEvent?.id === evt.id}
                            onClick={() => setSelectedEvent(
                              selectedEvent?.id === evt.id ? null : evt
                            )}
                          />
                        ))
                      )}
                    </div>

                    {selectedEvent && (
                      <div className="wht-detail-col">
                        <EventDetail
                          event={selectedEvent}
                          onClose={() => setSelectedEvent(null)}
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="wht-no-selection">
                  <p>Select a URL from the left to view events.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WebhookTester
