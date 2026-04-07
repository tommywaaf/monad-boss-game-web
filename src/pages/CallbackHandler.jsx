import { useState, useEffect, useRef, useCallback } from 'react'
import ToolInfoPanel from '../components/ToolInfoPanel'
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

// ─── Policy Engine Helpers ─────────────────────────────────

function generateRuleId() {
  return crypto.randomUUID ? crypto.randomUUID() : `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createEmptyRule() {
  return {
    id: generateRuleId(),
    name: '',
    enabled: true,
    conditions: {
      operations: [],
      assets: [],
      amountMin: null,
      amountMax: null,
      amountUsdMin: null,
      amountUsdMax: null,
      sourceTypes: [],
      sourceIds: [],
      destTypes: [],
      destIds: [],
      destAddressTypes: [],
      destAddresses: [],
    },
    action: 'APPROVE',
  }
}

function buildRuleChips(conditions) {
  if (!conditions) return [{ label: 'Any', type: 'any' }]
  const chips = []
  if (conditions.operations?.length) {
    conditions.operations.forEach(op => chips.push({ label: op, type: 'operation' }))
  }
  if (conditions.assets?.length) {
    conditions.assets.forEach(a => chips.push({ label: a, type: 'asset' }))
  }
  if (conditions.amountMin != null || conditions.amountMax != null) {
    let label
    if (conditions.amountMin != null && conditions.amountMax != null) {
      label = `${conditions.amountMin}–${conditions.amountMax}`
    } else if (conditions.amountMin != null) {
      label = `≥${conditions.amountMin}`
    } else {
      label = `≤${conditions.amountMax}`
    }
    chips.push({ label, type: 'amount' })
  }
  if (conditions.amountUsdMin != null || conditions.amountUsdMax != null) {
    let label
    if (conditions.amountUsdMin != null && conditions.amountUsdMax != null) {
      label = `$${conditions.amountUsdMin}–$${conditions.amountUsdMax}`
    } else if (conditions.amountUsdMin != null) {
      label = `≥$${conditions.amountUsdMin}`
    } else {
      label = `≤$${conditions.amountUsdMax}`
    }
    chips.push({ label, type: 'amount' })
  }
  if (conditions.sourceTypes?.length) {
    conditions.sourceTypes.forEach(t => chips.push({ label: `src:${t}`, type: 'source' }))
  }
  if (conditions.sourceIds?.length) {
    chips.push({ label: `srcId:${conditions.sourceIds.join(',')}`, type: 'source' })
  }
  if (conditions.destTypes?.length) {
    conditions.destTypes.forEach(t => chips.push({ label: `dst:${t}`, type: 'dest' }))
  }
  if (conditions.destIds?.length) {
    chips.push({ label: `dstId:${conditions.destIds.join(',')}`, type: 'dest' })
  }
  if (conditions.destAddressTypes?.length) {
    conditions.destAddressTypes.forEach(t => chips.push({ label: t, type: 'addrtype' }))
  }
  if (conditions.destAddresses?.length) {
    chips.push({ label: `${conditions.destAddresses.length} addr`, type: 'address' })
  }
  if (chips.length === 0) chips.push({ label: 'Any', type: 'any' })
  return chips
}

function RuleEditor({ rule, isNew, onSave, onCancel }) {
  const [name, setName] = useState(rule.name || '')
  const [action, setAction] = useState(rule.action || 'APPROVE')
  const [operations, setOperations] = useState(rule.conditions?.operations || [])
  const [assets, setAssets] = useState((rule.conditions?.assets || []).join(', '))
  const [amountMin, setAmountMin] = useState(rule.conditions?.amountMin ?? '')
  const [amountMax, setAmountMax] = useState(rule.conditions?.amountMax ?? '')
  const [amountUsdMin, setAmountUsdMin] = useState(rule.conditions?.amountUsdMin ?? '')
  const [amountUsdMax, setAmountUsdMax] = useState(rule.conditions?.amountUsdMax ?? '')
  const [sourceTypes, setSourceTypes] = useState(rule.conditions?.sourceTypes || [])
  const [sourceIds, setSourceIds] = useState((rule.conditions?.sourceIds || []).join(', '))
  const [destTypes, setDestTypes] = useState(rule.conditions?.destTypes || [])
  const [destIds, setDestIds] = useState((rule.conditions?.destIds || []).join(', '))
  const [destAddressTypes, setDestAddressTypes] = useState(rule.conditions?.destAddressTypes || [])
  const [destAddresses, setDestAddresses] = useState((rule.conditions?.destAddresses || []).join('\n'))

  const toggleList = (setter, val) =>
    setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])
  const parseList = (str) => str.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
  const parseNum = (str) => { const n = parseFloat(str); return isNaN(n) ? null : n }

  const handleSave = () => {
    onSave({
      ...rule,
      name: name.trim() || 'Untitled Rule',
      action,
      conditions: {
        operations,
        assets: parseList(assets),
        amountMin: parseNum(amountMin),
        amountMax: parseNum(amountMax),
        amountUsdMin: parseNum(amountUsdMin),
        amountUsdMax: parseNum(amountUsdMax),
        sourceTypes,
        sourceIds: parseList(sourceIds),
        destTypes,
        destIds: parseList(destIds),
        destAddressTypes,
        destAddresses: parseList(destAddresses),
      },
    })
  }

  return (
    <div className="cbt-rule-editor">
      <div className="cbt-rule-editor-field">
        <label className="cbt-rule-editor-label">Rule Name</label>
        <input
          className="cbt-rule-editor-input"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Block large transfers"
          autoFocus
        />
      </div>

      <div className="cbt-rule-editor-field">
        <label className="cbt-rule-editor-label">Operation</label>
        <div className="cbt-rule-editor-checkboxes">
          {['TRANSFER', 'CONTRACT_CALL', 'TYPED_MESSAGE', 'RAW', 'MINT', 'BURN', 'ENABLE_ASSET', 'STAKE', 'UNSTAKE', 'WITHDRAW', 'PROGRAM_CALL'].map(op => (
            <label key={op} className="cbt-rule-checkbox">
              <input type="checkbox" checked={operations.includes(op)} onChange={() => toggleList(setOperations, op)} />
              <span>{op}</span>
            </label>
          ))}
        </div>
        <span className="cbt-rule-editor-hint">Leave unchecked to match any operation</span>
      </div>

      <div className="cbt-rule-editor-field">
        <label className="cbt-rule-editor-label">Asset</label>
        <input
          className="cbt-rule-editor-input"
          type="text"
          value={assets}
          onChange={e => setAssets(e.target.value)}
          placeholder="e.g., MONAD, ETH, BTC (empty = any)"
        />
      </div>

      <div className="cbt-rule-editor-row">
        <div className="cbt-rule-editor-field">
          <label className="cbt-rule-editor-label">Amount Min (native)</label>
          <input className="cbt-rule-editor-input" type="number" step="any" value={amountMin} onChange={e => setAmountMin(e.target.value)} placeholder="No min" />
        </div>
        <div className="cbt-rule-editor-field">
          <label className="cbt-rule-editor-label">Amount Max (native)</label>
          <input className="cbt-rule-editor-input" type="number" step="any" value={amountMax} onChange={e => setAmountMax(e.target.value)} placeholder="No max" />
        </div>
      </div>

      <div className="cbt-rule-editor-row">
        <div className="cbt-rule-editor-field">
          <label className="cbt-rule-editor-label">USD Amount Min</label>
          <input className="cbt-rule-editor-input" type="number" step="any" value={amountUsdMin} onChange={e => setAmountUsdMin(e.target.value)} placeholder="No min" />
        </div>
        <div className="cbt-rule-editor-field">
          <label className="cbt-rule-editor-label">USD Amount Max</label>
          <input className="cbt-rule-editor-input" type="number" step="any" value={amountUsdMax} onChange={e => setAmountUsdMax(e.target.value)} placeholder="No max" />
        </div>
      </div>

      <div className="cbt-rule-editor-row">
        <div className="cbt-rule-editor-field">
          <label className="cbt-rule-editor-label">Source Type</label>
          <div className="cbt-rule-editor-checkboxes">
            {['VAULT', 'EXCHANGE'].map(t => (
              <label key={t} className="cbt-rule-checkbox">
                <input type="checkbox" checked={sourceTypes.includes(t)} onChange={() => toggleList(setSourceTypes, t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="cbt-rule-editor-field">
          <label className="cbt-rule-editor-label">Dest Type</label>
          <div className="cbt-rule-editor-checkboxes">
            {['VAULT', 'EXCHANGE_ACCOUNT', 'FIAT_ACCOUNT', 'UNMANAGED', 'ONE_TIME'].map(t => (
              <label key={t} className="cbt-rule-checkbox">
                <input type="checkbox" checked={destTypes.includes(t)} onChange={() => toggleList(setDestTypes, t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="cbt-rule-editor-row">
        <div className="cbt-rule-editor-field">
          <label className="cbt-rule-editor-label">Source Account IDs</label>
          <input className="cbt-rule-editor-input" type="text" value={sourceIds} onChange={e => setSourceIds(e.target.value)} placeholder="e.g., 0, 1 (empty = any)" />
        </div>
        <div className="cbt-rule-editor-field">
          <label className="cbt-rule-editor-label">Dest Account IDs</label>
          <input className="cbt-rule-editor-input" type="text" value={destIds} onChange={e => setDestIds(e.target.value)} placeholder="e.g., 2, 3 (empty = any)" />
        </div>
      </div>

      <div className="cbt-rule-editor-field">
        <label className="cbt-rule-editor-label">Dest Address Type</label>
        <div className="cbt-rule-editor-checkboxes">
          {['WHITELISTED', 'ONE_TIME'].map(t => (
            <label key={t} className="cbt-rule-checkbox">
              <input type="checkbox" checked={destAddressTypes.includes(t)} onChange={() => toggleList(setDestAddressTypes, t)} />
              <span>{t}</span>
            </label>
          ))}
        </div>
        <span className="cbt-rule-editor-hint">Leave unchecked to match any address type</span>
      </div>

      <div className="cbt-rule-editor-field">
        <label className="cbt-rule-editor-label">Dest Addresses</label>
        <textarea
          className="cbt-rule-editor-textarea"
          value={destAddresses}
          onChange={e => setDestAddresses(e.target.value)}
          placeholder="One address per line (empty = any)"
          rows={3}
        />
      </div>

      <div className="cbt-rule-editor-field">
        <label className="cbt-rule-editor-label">Action</label>
        <div className="cbt-toggle-group">
          <button className={`cbt-toggle-opt ${action === 'APPROVE' ? 'active-approve' : ''}`} onClick={() => setAction('APPROVE')}>APPROVE</button>
          <button className={`cbt-toggle-opt ${action === 'REJECT' ? 'active-reject' : ''}`} onClick={() => setAction('REJECT')}>REJECT</button>
        </div>
      </div>

      <div className="cbt-rule-editor-actions">
        <button className="cbt-rule-editor-save" onClick={handleSave}>{isNew ? 'Add Rule' : 'Save Changes'}</button>
        <button className="cbt-rule-editor-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function RuleCard({ rule, index, total, onToggle, onEdit, onDelete, onMove }) {
  const chips = buildRuleChips(rule.conditions)
  const actionLower = (rule.action || '').toLowerCase()
  return (
    <div className={`cbt-rule-card ${rule.enabled ? '' : 'disabled'}`}>
      <span className="cbt-rule-priority">{index + 1}</span>
      <label className="cbt-rule-toggle-switch" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={rule.enabled} onChange={() => onToggle(rule.id)} />
        <span className="cbt-rule-toggle-track" />
        <span className="cbt-rule-toggle-knob" />
      </label>
      <div className="cbt-rule-info">
        <span className="cbt-rule-name">{rule.name || 'Untitled Rule'}</span>
        <div className="cbt-rule-chips">
          {chips.map((c, i) => (
            <span key={i} className={`cbt-rule-chip ${c.type}`}>{c.label}</span>
          ))}
        </div>
      </div>
      <span className={`cbt-rule-action-badge ${actionLower}`}>{rule.action}</span>
      <div className="cbt-rule-controls">
        <button className="cbt-rule-ctrl-btn" disabled={index === 0} onClick={() => onMove(rule.id, -1)} title="Move up">&#9650;</button>
        <button className="cbt-rule-ctrl-btn" disabled={index === total - 1} onClick={() => onMove(rule.id, 1)} title="Move down">&#9660;</button>
        <button className="cbt-rule-ctrl-btn" onClick={() => onEdit(rule.id)} title="Edit">&#9998;</button>
        <button className="cbt-rule-ctrl-btn delete" onClick={() => onDelete(rule.id)} title="Delete">&times;</button>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────

function CallbackHandler() {
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
  const [rulesExpanded, setRulesExpanded] = useState(true)
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [showNewRuleEditor, setShowNewRuleEditor] = useState(false)
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
            rules: h.rules || [],
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
          rules: data.rules || [],
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

  // ─── Policy Rules CRUD ──────────────────────────────────

  function getHandlerRules(handlerId) {
    return handlers[handlerId]?.rules || []
  }

  function updateRulesState(handlerId, newRules) {
    setHandlers(prev => ({
      ...prev,
      [handlerId]: { ...prev[handlerId], rules: newRules }
    }))
    saveRulesToServer(handlerId, newRules)
  }

  async function saveRulesToServer(handlerId, rules) {
    try {
      await fetch(`${API_BASE}/cbt/rules/${handlerId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })
    } catch { /* best effort */ }
  }

  function handleAddRule(newRule) {
    if (!selectedHandler) return
    const rules = [...getHandlerRules(selectedHandler), newRule]
    updateRulesState(selectedHandler, rules)
    setShowNewRuleEditor(false)
  }

  function handleUpdateRule(updatedRule) {
    if (!selectedHandler) return
    const rules = getHandlerRules(selectedHandler).map(r => r.id === updatedRule.id ? updatedRule : r)
    updateRulesState(selectedHandler, rules)
    setEditingRuleId(null)
  }

  function handleDeleteRule(ruleId) {
    if (!selectedHandler) return
    const rules = getHandlerRules(selectedHandler).filter(r => r.id !== ruleId)
    updateRulesState(selectedHandler, rules)
    if (editingRuleId === ruleId) setEditingRuleId(null)
  }

  function handleToggleRule(ruleId) {
    if (!selectedHandler) return
    const rules = getHandlerRules(selectedHandler).map(r =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    )
    updateRulesState(selectedHandler, rules)
  }

  function handleMoveRule(ruleId, direction) {
    if (!selectedHandler) return
    const rules = [...getHandlerRules(selectedHandler)]
    const idx = rules.findIndex(r => r.id === ruleId)
    if (idx < 0) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= rules.length) return
    ;[rules[idx], rules[newIdx]] = [rules[newIdx], rules[idx]]
    updateRulesState(selectedHandler, rules)
  }

  // ─── Derived ──────────────────────────────────────────────

  const activeData = selectedHandler
    ? (handlers[selectedHandler] || { events: [], status: 'disconnected' })
    : null
  const activeEvents = activeData?.events || []
  const activeRules = activeData?.rules || []

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="cbt-page">
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

                {/* Policy Rules */}
                <div className="cbt-rules-section">
                  <div className="cbt-rules-header" onClick={() => setRulesExpanded(v => !v)}>
                    <div className="cbt-rules-header-left">
                      <span className={`cbt-chevron ${rulesExpanded ? 'open' : ''}`}>&#9654;</span>
                      <span className="cbt-rules-title">Policy Rules</span>
                      <span className="cbt-rules-count">{activeRules.length} rule{activeRules.length !== 1 ? 's' : ''}</span>
                    </div>
                    <button
                      className="cbt-rules-add-btn"
                      onClick={e => { e.stopPropagation(); setShowNewRuleEditor(true); setEditingRuleId(null); setRulesExpanded(true) }}
                    >
                      + Add Rule
                    </button>
                  </div>
                  {rulesExpanded && (
                    <div className="cbt-rules-body">
                      {activeRules.length === 0 && !showNewRuleEditor && (
                        <div className="cbt-rules-empty">
                          No rules configured. All requests use the default action below.
                        </div>
                      )}
                      {activeRules.map((rule, idx) => (
                        editingRuleId === rule.id ? (
                          <RuleEditor
                            key={rule.id}
                            rule={rule}
                            isNew={false}
                            onSave={handleUpdateRule}
                            onCancel={() => setEditingRuleId(null)}
                          />
                        ) : (
                          <RuleCard
                            key={rule.id}
                            rule={rule}
                            index={idx}
                            total={activeRules.length}
                            onToggle={handleToggleRule}
                            onEdit={setEditingRuleId}
                            onDelete={handleDeleteRule}
                            onMove={handleMoveRule}
                          />
                        )
                      ))}
                      {showNewRuleEditor && (
                        <RuleEditor
                          rule={createEmptyRule()}
                          isNew={true}
                          onSave={handleAddRule}
                          onCancel={() => setShowNewRuleEditor(false)}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Default action (fallback when no rule matches) */}
                <div className="cbt-action-toggle">
                  <span className="cbt-action-label">Default Action:</span>
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
                  <span className="cbt-default-action-sub">when no rule matches</span>
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
      <ToolInfoPanel toolId="callback-handler" />
    </div>
  )

  function handleClear(handlerId) {
    setHandlers(prev => ({ ...prev, [handlerId]: { ...prev[handlerId], events: [] } }))
    if (selectedHandler === handlerId) setExpandedEvent(null)
  }
}

export default CallbackHandler
