import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './WebhookTester.css'

const API_BASE = 'https://delicate-haze-2a16.tm8six.workers.dev'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

const METHOD_COLORS = {
  GET: '#3b82f6',
  POST: '#22c55e',
  PUT: '#f59e0b',
  PATCH: '#a855f7',
  DELETE: '#ef4444',
  HEAD: '#6b7280',
  OPTIONS: '#06b6d4',
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 5) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function tryPrettyJson(str) {
  if (!str) return str
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
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
    <button className={`wht-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="wht-collapsible">
      <button className="wht-collapsible-toggle" onClick={() => setOpen(o => !o)}>
        <span className={`wht-chevron ${open ? 'open' : ''}`}>&#9654;</span>
        {title}
      </button>
      {open && <div className="wht-collapsible-content">{children}</div>}
    </div>
  )
}

function EventCard({ event }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  const methodColor = METHOD_COLORS[event.method] || '#6b7280'
  const isJson = (event.contentType || '').includes('json')
  const headerCount = event.headers ? Object.keys(event.headers).length : 0

  return (
    <div className="wht-event-card">
      <div className="wht-event-header">
        <span className="wht-method-badge" style={{ background: methodColor }}>
          {event.method}
        </span>
        <span className="wht-event-time" key={now}>{timeAgo(event.timestamp)}</span>
        {event.contentType && (
          <span className="wht-content-type">{event.contentType}</span>
        )}
        <span className="wht-event-size">{formatBytes(event.size)}</span>
      </div>

      {event.query && event.query !== '' && event.query !== '?' && (
        <div className="wht-event-query">
          <span className="wht-query-label">Query:</span>
          <code>{event.query}</code>
        </div>
      )}

      {headerCount > 0 && (
        <CollapsibleSection title={`Headers (${headerCount})`}>
          <div className="wht-headers-grid">
            {Object.entries(event.headers).map(([k, v]) => (
              <div key={k} className="wht-header-row">
                <span className="wht-header-key">{k}</span>
                <span className="wht-header-val">{v}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {event.body && (
        <CollapsibleSection title="Body" defaultOpen={true}>
          <pre className={`wht-body-content ${isJson ? 'json' : ''}`}>
            {isJson ? tryPrettyJson(event.body) : event.body}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  )
}

function HookCard({ hookId, hookData, onDelete, onClear, wsRef }) {
  const { events = [], status = 'disconnected', createdAt } = hookData
  const hookUrl = `${API_BASE}/hook/${hookId}`

  return (
    <div className="wht-hook-card">
      <div className="wht-hook-header">
        <div className="wht-hook-url-row">
          <span className={`wht-status-dot ${status}`} title={status} />
          <code className="wht-hook-url">{hookUrl}</code>
          <CopyButton text={hookUrl} />
        </div>
        <div className="wht-hook-actions">
          <span className="wht-event-count">{events.length} event{events.length !== 1 ? 's' : ''}</span>
          <button className="wht-action-btn clear" onClick={() => onClear(hookId)} disabled={events.length === 0}>
            Clear
          </button>
          <button className="wht-action-btn delete" onClick={() => onDelete(hookId)}>
            Delete
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="wht-no-events">
          Waiting for webhooks&hellip; Send a request to the URL above.
        </div>
      ) : (
        <div className="wht-event-list">
          {events.map(evt => <EventCard key={evt.id} event={evt} />)}
        </div>
      )}
    </div>
  )
}

function WebhookTester() {
  const location = useLocation()
  const [hooks, setHooks] = useState({})
  const [hookOrder, setHookOrder] = useState([])
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
      // store timer id for cleanup
      reconnectTimers.current.set(`timer_${hookId}`, timer)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  const disconnectWebSocket = useCallback((hookId) => {
    const ws = wsRefs.current.get(hookId)
    if (ws) {
      ws.onclose = null
      ws.close()
      wsRefs.current.delete(hookId)
    }
    clearTimeout(reconnectTimers.current.get(`timer_${hookId}`))
    reconnectTimers.current.delete(hookId)
    reconnectTimers.current.delete(`timer_${hookId}`)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    initSession()
    return () => {
      mountedRef.current = false
      for (const [key, val] of wsRefs.current.entries()) {
        val.onclose = null
        val.close()
      }
      wsRefs.current.clear()
      for (const [key, val] of reconnectTimers.current.entries()) {
        if (key.startsWith('timer_')) clearTimeout(val)
      }
      reconnectTimers.current.clear()
    }
  }, [])

  async function initSession() {
    try {
      const res = await fetch(`${API_BASE}/wht/session`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Session init failed (${res.status})`)
      const data = await res.json()

      const initialHooks = {}
      const order = []
      if (data.hooks && data.hooks.length > 0) {
        for (const hook of data.hooks) {
          initialHooks[hook.id] = {
            events: [],
            status: 'connecting',
            createdAt: hook.createdAt,
          }
          order.push(hook.id)
        }
      }

      setHooks(initialHooks)
      setHookOrder(order)
      setLoading(false)

      for (const hookId of order) {
        connectWebSocket(hookId)
      }
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
      const res = await fetch(`${API_BASE}/wht/generate`, {
        method: 'POST',
        credentials: 'include',
      })
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
      connectWebSocket(hookId)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(hookId) {
    disconnectWebSocket(hookId)
    setHooks(prev => {
      const next = { ...prev }
      delete next[hookId]
      return next
    })
    setHookOrder(prev => prev.filter(id => id !== hookId))

    try {
      await fetch(`${API_BASE}/wht/url/${hookId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch { /* best effort */ }
  }

  async function handleClear(hookId) {
    setHooks(prev => ({
      ...prev,
      [hookId]: { ...prev[hookId], events: [] }
    }))

    try {
      await fetch(`${API_BASE}/wht/events/${hookId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch { /* best effort */ }
  }

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

      <div className="wht-container">
        <header className="wht-header">
          <h1>Webhook Tester</h1>
          <p>Generate temporary URLs to receive and inspect webhook requests in real time.</p>
        </header>

        {error && (
          <div className="wht-error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        <div className="wht-toolbar">
          <button className="wht-generate-btn" onClick={handleGenerate} disabled={generating || loading}>
            {generating ? (
              <><span className="wht-spinner" /> Generating&hellip;</>
            ) : (
              '+ Generate URL'
            )}
          </button>
          {hookOrder.length > 0 && (
            <span className="wht-hook-count">{hookOrder.length} URL{hookOrder.length !== 1 ? 's' : ''} active</span>
          )}
        </div>

        {loading ? (
          <div className="wht-loading">
            <span className="wht-spinner large" />
            <span>Initializing session&hellip;</span>
          </div>
        ) : hookOrder.length === 0 ? (
          <div className="wht-empty-state">
            <div className="wht-empty-icon">🔗</div>
            <h2>No Webhook URLs Yet</h2>
            <p>
              Generate a URL, then point any external service at it.
              Incoming requests will appear here in real time.
            </p>
            <button className="wht-generate-btn" onClick={handleGenerate} disabled={generating}>
              + Generate Your First URL
            </button>
          </div>
        ) : (
          <div className="wht-hooks-list">
            {hookOrder.map(hookId => (
              <HookCard
                key={hookId}
                hookId={hookId}
                hookData={hooks[hookId] || { events: [], status: 'disconnected' }}
                onDelete={handleDelete}
                onClear={handleClear}
                wsRef={wsRefs}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default WebhookTester
