import { useState, useCallback, useMemo, useEffect, useDeferredValue } from 'react'
import ToolInfoPanel from '../components/ToolInfoPanel'
import './CsvBuilder.css'

const makeColumn = () => ({ id: crypto.randomUUID(), label: '', staticValue: '', lines: '' })

function escapeCsvCell(value) {
  if (value === '') return ''
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

// =====================================================================
// UUID Extractor classifier — module-scope constants & helpers.
// Hoisted out of the component so they aren't re-allocated on every
// input change (was a major source of GC churn / paste lag).
// =====================================================================

// Maps a normalized alpha-only token to a canonical category name.
const UUID_LABEL_MAP = {
  tenantid: 'tenantId', tenant: 'tenantId', tenants: 'tenantId',
  tenantids: 'tenantId', tenanat: 'tenantId',
  workspaceid: 'tenantId', workspace: 'tenantId',
  userid: 'userId', user: 'userId', users: 'userId',
  createdby: 'userId', rejectedby: 'userId', signedby: 'userId',
  initiatorid: 'userId', initiator: 'userId',
  getusercertificate: 'userId', mobileuser: 'userId',
  signers: 'userId', signerids: 'userId',
  approvedby: 'userId', triggeredby: 'userId',
  txid: 'txId', tx: 'txId', transactionid: 'txId',
  transaction: 'txId', requestedtxid: 'txId', parenttxid: 'txId',
  generatedtxid: 'txId', fbtx: 'txId',
  requestid: 'requestId', xamznrequestid: 'requestId',
  nginxrequestid: 'requestId', requestcontext: 'requestId',
  idempotency: 'idempotencyKey', idempotencyheader: 'idempotencyKey',
  pipelineid: 'pipelineId', pipeline: 'pipelineId',
  pipelinecontext: 'pipelineId',
  functionid: 'functionId',
  notificationid: 'notificationId', notification: 'notificationId',
  subscriptionid: 'subscriptionId', subscription: 'subscriptionId',
  eventid: 'eventId',
  webhookid: 'webhookId',
  ruleid: 'ruleId', vruleid: 'ruleId', externaldescriptor: 'ruleId',
  capturedrule: 'ruleId',
  reportid: 'reportId',
  groupid: 'groupId', group: 'groupId', groups: 'groupId',
  approvalgroups: 'groupId',
  accountid: 'accountId', connectedaccountid: 'accountId',
  resourceid: 'resourceId',
  transferid: 'transferId',
  externaltxid: 'externalTxId',
  websocketuuid: 'webSocketUuid',
  deviceid: 'deviceId', device: 'deviceId',
  physicaldeviceid: 'physicalDeviceId',
  jobid: 'jobId',
  ticketid: 'ticketId',
  messageid: 'messageId',
  apikey: 'apiKey',
  vaultid: 'vaultId',
  keyid: 'keyId',
  queue: 'queueId', queuename: 'queueId', queueid: 'queueId',
  topic: 'topicId', topicid: 'topicId',
  walletid: 'walletId', wallets: 'walletId',
  eventgroupid: 'eventGroupId',
  destinationid: 'destinationId',
  tagid: 'tagId', tagids: 'tagId',
}

// High-confidence prefix patterns checked BEFORE token classification.
const UUID_PATTERN_PREFIXES = [
  [/load key \(\s*$/i, 'keyId'],
  [/(?:^|[\s,])Key:\s*$/, 'keyId'],
  [/\bAPI key\s+$/i, 'apiKey'],
  [/label='$/i, 'tenantId'],
  [/\bconfirmations request for [0-9a-f]+ and $/i, 'tenantId'],
  [/\/connected-accounts\/internal\/$/i, 'accountId'],
  [/\b(?:Destroyed|Locked|Called) (?:try-)?lock for key\s+$/i, 'tenantId'],
  [/\boff-exchange-tenant:\s*$/i, 'tenantId'],
  [/\bgroupKey:\s+\w+\/$/i, 'tenantId'],
  [/_user_wallet\/$/i, 'tenantId'],
  [/\/wallet\/ncw\/$/i, 'tenantId'],
  [/policyEngineVersion[":\s\w}]+,\{[":\s]*id[":]+\s*$/i, 'ruleId'],
]

// Maps a normalized CSV column-name segment to a canonical category.
const UUID_COL_CATEGORY = {
  tenantid: 'tenantId', tenantids: 'tenantId',
  workspaceid: 'tenantId',
  userid: 'userId', userids: 'userId',
  createdby: 'userId', rejectedby: 'userId', signedby: 'userId',
  initiatorid: 'userId', initiator: 'userId',
  signerid: 'userId', signers: 'userId',
  txid: 'txId', transactionid: 'txId',
  generatedtxid: 'txId', requestedtxid: 'txId', parenttxid: 'txId',
  requestid: 'requestId', internalrequestid: 'requestId',
  pipelineid: 'pipelineId', sourcepipelineid: 'pipelineId',
  pipelinepath: 'pipelineId',
  functionid: 'functionId',
  notificationid: 'notificationId', notificationdeduplicationid: 'notificationId',
  subscriptionid: 'subscriptionId',
  eventid: 'eventId', eventdeduplicationid: 'eventId',
  webhookid: 'webhookId',
  ruleid: 'ruleId',
  groupid: 'groupId',
  accountid: 'accountId', sourcethirdpartyaccountid: 'accountId',
  resourceid: 'resourceId',
  transferid: 'transferId',
  externaltxid: 'externalTxId',
  websocketuuid: 'webSocketUuid',
  deviceid: 'deviceId',
  physicaldeviceid: 'physicalDeviceId',
  jobid: 'jobId',
  ticketid: 'ticketId',
  messageid: 'messageId',
  topicmessageid: 'messageId', sqsmessageid: 'messageId',
  apikey: 'apiKey', httpxapikey: 'apiKey',
  vaultid: 'vaultId', vaultaccountid: 'vaultId',
  walletid: 'walletId', walletcontainerid: 'walletId',
  eventgroupid: 'eventGroupId',
  destinationid: 'destinationId', dstid: 'destinationId',
  tagid: 'tagId',
  keyid: 'keyId',
  queueid: 'queueId',
  topicid: 'topicId',
  taskid: 'taskId',
  traceid: 'traceId', spanid: 'traceId',
  reportid: 'reportId',
}

// IMPORTANT: Two distinct regex objects to avoid lastIndex aliasing.
// `String.prototype.replace` with a global RegExp resets that regex's
// lastIndex to 0 on completion (per ES spec), which would corrupt any
// concurrent `exec()` loop using the same regex object — that previously
// caused an infinite loop and froze the page on UUID-bearing input.
const UUID_RE_SCAN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const UUID_RE_STRIP = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const UUID_RE_FULL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_ALPHA_RE = /[A-Za-z]{2,}/g
const UUID_SEP_RE = /^["',\s\]\[\\]*$/

const uuidNormalizePrefix = (raw) => {
  let s = raw.replace(/\\+/g, '')
  if (s.indexOf('%') !== -1) {
    try { s = decodeURIComponent(s) } catch { /* leave as-is on bad escape */ }
  }
  return s
}

const uuidClassifyOccurrence = (prefix) => {
  const norm = uuidNormalizePrefix(prefix)
  for (let p = 0; p < UUID_PATTERN_PREFIXES.length; p++) {
    if (UUID_PATTERN_PREFIXES[p][0].test(norm)) return UUID_PATTERN_PREFIXES[p][1]
  }
  const close = norm.slice(-30).replace(UUID_RE_STRIP, ' ')
  let last = null
  let m
  UUID_ALPHA_RE.lastIndex = 0
  while ((m = UUID_ALPHA_RE.exec(close)) !== null) {
    const tok = m[0].toLowerCase()
    if (UUID_LABEL_MAP[tok]) last = UUID_LABEL_MAP[tok]
  }
  return last
}

// Walks column segments right-to-left, skipping numeric ones.
const uuidColumnCategory = (colName) => {
  if (!colName) return null
  const segments = colName.split('.')
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    if (!seg || /^\d+$/.test(seg)) continue
    const norm = seg.toLowerCase().replace(/[_-]/g, '')
    if (UUID_COL_CATEGORY[norm]) return UUID_COL_CATEGORY[norm]
  }
  return null
}

// Scans a single text blob for UUIDs. Uses `matchAll` which internally
// clones the regex, so it is immune to lastIndex aliasing with the
// strip-regex used inside `uuidClassifyOccurrence`.
const uuidScanText = (text, sourceLabel, lowercase) => {
  const local = []
  const matches = text.matchAll(UUID_RE_SCAN)
  for (const m of matches) {
    const start = m.index
    const end = start + m[0].length
    const prefix = text.slice(Math.max(0, start - 60), start)
    const after = text.slice(end, end + 30)
    const ctx = (prefix + '⟦UUID⟧' + after).replace(/\s+/g, ' ').trim()
    local.push({
      uuid: lowercase ? m[0].toLowerCase() : m[0],
      keyLower: m[0].toLowerCase(),
      category: uuidClassifyOccurrence(prefix),
      context: sourceLabel ? `[${sourceLabel}] ${ctx}` : ctx,
      start, end,
    })
  }
  // Chain propagation for JSON arrays of UUIDs.
  for (let i = 1; i < local.length; i++) {
    const cur = local[i]
    if (cur.category) continue
    const prev = local[i - 1]
    const between = text.slice(prev.end, cur.start)
    if (between.length === 0) continue
    const cleaned = between.replace(/%(?:22|2C|20)/gi, ' ')
    if (cleaned.length <= 12 && UUID_SEP_RE.test(cleaned) && prev.category) {
      cur.category = prev.category
    }
  }
  return local
}

// Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped
// double-quotes (""), embedded commas, and embedded newlines.
const uuidParseCsv = (text) => {
  const rows = []
  let field = '', row = [], inQuotes = false
  const len = text.length
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i)
    if (inQuotes) {
      if (c === 34 /* " */) {
        if (i + 1 < len && text.charCodeAt(i + 1) === 34) { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += text[i]
      }
    } else {
      if (c === 34) inQuotes = true
      else if (c === 44 /* , */) { row.push(field); field = '' }
      else if (c === 10 /* \n */) { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === 13 /* \r */) { /* skip */ }
      else field += text[i]
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function CsvBuilder() {
  useEffect(() => {
    document.title = 'CSV Builder'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  const [columns, setColumns] = useState(() => [makeColumn(), makeColumn(), makeColumn(), makeColumn()])
  const [includeHeader, setIncludeHeader] = useState(false)
  const [rowDeleterEnabled, setRowDeleterEnabled] = useState(false)
  const [hoveredRow, setHoveredRow] = useState(null)

  const updateColumn = useCallback((id, field, value) => {
    setColumns(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }, [])

  const addColumn = useCallback(() => {
    setColumns(prev => [...prev, makeColumn()])
  }, [])

  const removeColumn = useCallback((id) => {
    setColumns(prev => prev.length <= 1 ? prev : prev.filter(c => c.id !== id))
  }, [])

  const getActiveColumns = useCallback(() => {
    return columns.filter(c => c.staticValue.trim() !== '' || c.lines.trim() !== '')
  }, [columns])

  const buildCsv = useCallback(() => {
    const active = getActiveColumns()
    if (active.length === 0) return null

    const colData = active.map(c => {
      if (c.staticValue.trim() !== '') return { label: c.label, isStatic: true, value: c.staticValue }
      const parsed = c.lines.split(/\r?\n/).filter(l => l !== '')
      return { label: c.label, isStatic: false, rows: parsed }
    })

    const maxRows = colData.reduce((max, d) => {
      if (d.isStatic) return max
      return Math.max(max, d.rows.length)
    }, 0)

    if (maxRows === 0 && colData.every(d => d.isStatic)) return null

    const csvLines = []

    if (includeHeader) {
      csvLines.push(colData.map(d => escapeCsvCell(d.label)).join(','))
    }

    for (let i = 0; i < maxRows; i++) {
      const row = colData.map(d => {
        if (d.isStatic) return escapeCsvCell(d.value)
        return escapeCsvCell(d.rows[i] ?? '')
      })
      csvLines.push(row.join(','))
    }

    return csvLines.join('\n')
  }, [getActiveColumns, includeHeader])

  const csvPreview = useMemo(() => buildCsv(), [buildCsv])

  const handleDownload = useCallback(() => {
    if (!csvPreview) return
    const blob = new Blob([csvPreview], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `csv_builder_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [csvPreview])

  const activeCount = getActiveColumns().length
  const totalLines = columns.reduce((sum, c) => {
    if (c.staticValue.trim()) return sum
    const count = c.lines.trim() ? c.lines.split(/\r?\n/).filter(l => l !== '').length : 0
    return sum + count
  }, 0)

  const [copied, setCopied] = useState(false)
  const [colEditorInput, setColEditorInput] = useState('')
  const [colEditorPrepend, setColEditorPrepend] = useState('')
  const [colEditorAppend, setColEditorAppend] = useState('')
  const [colEditorOmitLast, setColEditorOmitLast] = useState(false)
  const [colEditorCopied, setColEditorCopied] = useState(false)

  const colEditorOutput = useMemo(() => {
    const lines = colEditorInput.split(/\r?\n/).filter(l => l.trim() !== '')
    if (lines.length === 0) return ''
    return lines.map((line, i) => {
      let suffix = colEditorAppend
      if (colEditorOmitLast && i === lines.length - 1 && suffix.endsWith(',')) {
        suffix = suffix.slice(0, -1)
      }
      return `${colEditorPrepend}${line.trim()}${suffix}`
    }).join('\n')
  }, [colEditorInput, colEditorPrepend, colEditorAppend, colEditorOmitLast])

  const handleColEditorCopy = useCallback(() => {
    if (!colEditorOutput) return
    navigator.clipboard.writeText(colEditorOutput).then(() => {
      setColEditorCopied(true)
      setTimeout(() => setColEditorCopied(false), 2000)
    })
  }, [colEditorOutput])

  const [dedupeInput, setDedupeInput] = useState('')
  const [dedupeTrim, setDedupeTrim] = useState(true)
  const [dedupeCaseInsensitive, setDedupeCaseInsensitive] = useState(false)
  const [dedupeCopied, setDedupeCopied] = useState(false)

  const dedupeResult = useMemo(() => {
    if (!dedupeInput) return { output: '', total: 0, unique: 0, dupes: 0 }
    // Manual split + \r strip is faster than a regex split for large inputs.
    const lines = dedupeInput.split('\n')
    const seen = new Set()
    const out = []
    let total = 0
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
      // Strip trailing \r from CRLF line endings without allocating a regex.
      if (line.length > 0 && line.charCodeAt(line.length - 1) === 13) {
        line = line.slice(0, -1)
      }
      if (dedupeTrim) line = line.trim()
      if (line === '') continue
      total++
      const key = dedupeCaseInsensitive ? line.toLowerCase() : line
      if (seen.has(key)) continue
      seen.add(key)
      out.push(line)
    }
    return {
      output: out.join('\n'),
      total,
      unique: out.length,
      dupes: total - out.length,
    }
  }, [dedupeInput, dedupeTrim, dedupeCaseInsensitive])

  const handleDedupeCopy = useCallback(() => {
    if (!dedupeResult.output) return
    navigator.clipboard.writeText(dedupeResult.output).then(() => {
      setDedupeCopied(true)
      setTimeout(() => setDedupeCopied(false), 2000)
    })
  }, [dedupeResult.output])

  const handleDedupeClear = useCallback(() => {
    setDedupeInput('')
  }, [])

  const [uuidInput, setUuidInput] = useState('')
  const [uuidDedupe, setUuidDedupe] = useState(true)
  const [uuidLowercase, setUuidLowercase] = useState(true)
  const [uuidShowContext, setUuidShowContext] = useState(false)
  const [uuidGroupHeaders, setUuidGroupHeaders] = useState(true)
  const [uuidCopied, setUuidCopied] = useState(false)
  const [uuidExcluded, setUuidExcluded] = useState(() => new Set())
  const [uuidMode, setUuidMode] = useState('text')
  const [uuidCsvText, setUuidCsvText] = useState('')
  const [uuidCsvFileName, setUuidCsvFileName] = useState('')
  const [uuidCsvError, setUuidCsvError] = useState('')
  const [uuidIsDragging, setUuidIsDragging] = useState(false)
  const [uuidFileType, setUuidFileType] = useState('csv')

  // useDeferredValue lets React keep the textarea responsive during a
  // big paste — the heavy classification work runs in the background and
  // can be interrupted by further keystrokes instead of blocking input.
  const deferredUuidInput = useDeferredValue(uuidInput)
  const deferredUuidCsvText = useDeferredValue(uuidCsvText)
  const uuidIsPending =
    (uuidMode === 'text' && deferredUuidInput !== uuidInput) ||
    (uuidMode === 'file' && deferredUuidCsvText !== uuidCsvText)

  const uuidResult = useMemo(() => {
    const activeText = uuidMode === 'file' ? deferredUuidCsvText : deferredUuidInput
    if (!activeText) {
      return { groups: [], categoryOrder: [], total: 0, csvStats: null }
    }

    const found = []
    let csvStats = null

    if (uuidMode === 'file' && uuidFileType === 'csv') {
      const rows = uuidParseCsv(activeText)
      if (rows.length === 0) {
        return { groups: [], categoryOrder: [], total: 0, csvStats: { rows: 0, cols: 0, classifiedCols: 0 } }
      }
      const headers = rows[0]
      const colCats = headers.map(uuidColumnCategory)
      const classifiedCols = colCats.filter(Boolean).length
      csvStats = { rows: rows.length - 1, cols: headers.length, classifiedCols }

      let posCursor = 0
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]
        for (let c = 0; c < row.length; c++) {
          const val = row[c]
          if (!val) continue
          const colName = headers[c] || ''
          const colCat = colCats[c]
          // Whole-cell UUID with classifying column → direct high-confidence record.
          if (colCat && UUID_RE_FULL.test(val.trim().replace(/^"|"$/g, ''))) {
            const u = val.trim().replace(/^"|"$/g, '')
            found.push({
              uuid: uuidLowercase ? u.toLowerCase() : u,
              keyLower: u.toLowerCase(),
              category: colCat,
              context: `[col: ${colName}]`,
              start: posCursor, end: posCursor + 36,
            })
            posCursor += 40
            continue
          }
          // Free-text cell (or non-UUID value in classified col) — scan for embedded UUIDs.
          if (val.indexOf('-') === -1) continue
          const cellFound = uuidScanText(val, colName, uuidLowercase)
          for (const it of cellFound) {
            it.start += posCursor
            it.end += posCursor
            found.push(it)
          }
          posCursor += val.length + 1
        }
      }
    } else {
      // Text mode OR file mode with a JSON file. JSON pretty-printed has the
      // labels embedded as keys (`"tenantId": "<uuid>"`), which the existing
      // free-text classifier already handles perfectly.
      const local = uuidScanText(activeText, '', uuidLowercase)
      for (const it of local) found.push(it)
    }

    // Cross-reference pass: if a UUID is confidently classified in any
    // occurrence, propagate that label to every occurrence of that UUID. If
    // multiple confident labels exist, pick the most common one (ties broken
    // by first-seen).
    const labelVotes = new Map()
    for (const it of found) {
      if (!it.category) continue
      let votes = labelVotes.get(it.keyLower)
      if (!votes) { votes = new Map(); labelVotes.set(it.keyLower, votes) }
      votes.set(it.category, (votes.get(it.category) || 0) + 1)
    }
    const consensus = new Map()
    for (const [uuidKey, votes] of labelVotes) {
      let bestCat = null, bestN = 0
      for (const [cat, n] of votes) {
        if (n > bestN) { bestN = n; bestCat = cat }
      }
      consensus.set(uuidKey, bestCat)
    }
    for (const it of found) {
      it.category = consensus.get(it.keyLower) || it.category || 'unknown'
    }

    // Group by category. Optionally dedupe within category (case-insensitive key).
    const groupsMap = new Map()
    for (const item of found) {
      if (!groupsMap.has(item.category)) {
        groupsMap.set(item.category, { category: item.category, items: [], seen: new Set() })
      }
      const g = groupsMap.get(item.category)
      if (uuidDedupe && g.seen.has(item.keyLower)) continue
      g.seen.add(item.keyLower)
      g.items.push(item)
    }

    // Sort categories: known categories alphabetically, unknown last.
    const categoryOrder = Array.from(groupsMap.keys()).sort((a, b) => {
      if (a === 'unknown') return 1
      if (b === 'unknown') return -1
      return a.localeCompare(b)
    })

    const groups = categoryOrder.map(c => groupsMap.get(c))
    return { groups, categoryOrder, total: found.length, csvStats }
  }, [uuidMode, uuidFileType, deferredUuidInput, deferredUuidCsvText, uuidDedupe, uuidLowercase])

  const uuidOutput = useMemo(() => {
    const selectedGroups = uuidResult.groups.filter(g => !uuidExcluded.has(g.category))
    if (selectedGroups.length === 0) return ''
    const showHeaders = uuidGroupHeaders && selectedGroups.length > 1
    const parts = []
    for (const g of selectedGroups) {
      if (showHeaders) {
        parts.push(`# ${g.category} (${g.items.length})`)
      }
      for (const it of g.items) {
        if (uuidShowContext && g.category === 'unknown') {
          parts.push(`${it.uuid}  // ${it.context}`)
        } else {
          parts.push(it.uuid)
        }
      }
      if (showHeaders) parts.push('')
    }
    return parts.join('\n').replace(/\n+$/, '')
  }, [uuidResult.groups, uuidExcluded, uuidGroupHeaders, uuidShowContext])

  const uuidSelectedCount = useMemo(
    () => uuidResult.groups
      .filter(g => !uuidExcluded.has(g.category))
      .reduce((sum, g) => sum + g.items.length, 0),
    [uuidResult.groups, uuidExcluded]
  )

  const handleUuidCopy = useCallback(() => {
    if (!uuidOutput) return
    navigator.clipboard.writeText(uuidOutput).then(() => {
      setUuidCopied(true)
      setTimeout(() => setUuidCopied(false), 2000)
    })
  }, [uuidOutput])

  const handleUuidCopyCategory = useCallback((category) => {
    const g = uuidResult.groups.find(gr => gr.category === category)
    if (!g) return
    const text = g.items.map(it => it.uuid).join('\n')
    navigator.clipboard.writeText(text)
  }, [uuidResult.groups])

  const handleUuidClear = useCallback(() => {
    setUuidInput('')
  }, [])

  const handleUuidCsvFile = useCallback((file) => {
    if (!file) return
    setUuidCsvError('')
    const isCsvName = /\.csv$/i.test(file.name)
    const isJsonName = /\.json$/i.test(file.name)
    const isCsvType = file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
    const isJsonType = file.type === 'application/json'
    let fileType = null
    if (isCsvName || isCsvType) fileType = 'csv'
    else if (isJsonName || isJsonType) fileType = 'json'
    if (!fileType) {
      setUuidCsvError(`"${file.name}" doesn't look like a CSV or JSON file.`)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target.result || '')
      setUuidCsvText(text)
      setUuidCsvFileName(file.name)
      setUuidFileType(fileType)
      setUuidMode('file')
    }
    reader.onerror = () => setUuidCsvError(`Failed to read "${file.name}".`)
    reader.readAsText(file)
  }, [])

  const handleUuidCsvInputChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0]
    handleUuidCsvFile(file)
    e.target.value = ''
  }, [handleUuidCsvFile])

  const handleUuidDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    setUuidIsDragging(true)
  }, [])
  const handleUuidDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setUuidIsDragging(false)
  }, [])
  const handleUuidDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setUuidIsDragging(false)
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
    handleUuidCsvFile(file)
  }, [handleUuidCsvFile])

  const handleUuidCsvUnload = useCallback(() => {
    setUuidCsvText('')
    setUuidCsvFileName('')
    setUuidCsvError('')
  }, [])

  const toggleUuidCategory = useCallback((category) => {
    setUuidExcluded(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  const handleUuidSelectAll = useCallback(() => setUuidExcluded(new Set()), [])
  const handleUuidSelectNone = useCallback(() => {
    setUuidExcluded(new Set(uuidResult.categoryOrder))
  }, [uuidResult.categoryOrder])

  const handleCopy = useCallback(() => {
    if (!csvPreview) return
    navigator.clipboard.writeText(csvPreview).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [csvPreview])

  const deleteRow = useCallback((rowIndex) => {
    setColumns(prev => prev.map(col => {
      if (col.staticValue.trim()) return col
      const lines = col.lines.split(/\r?\n/)
      let nonEmptyIdx = 0
      const filtered = lines.filter(l => {
        if (l === '') return true
        if (nonEmptyIdx === rowIndex) { nonEmptyIdx++; return false }
        nonEmptyIdx++
        return true
      })
      return { ...col, lines: filtered.join('\n') }
    }))
  }, [])

  const colCounts = columns.map(c => {
    if (c.staticValue.trim() === '' && c.lines.trim() === '') return null
    if (c.staticValue.trim() !== '') return 'static'
    return c.lines.split(/\r?\n/).filter(l => l !== '').length
  })
  const nonStaticCounts = colCounts.filter(c => c !== null && c !== 'static')
  const maxNonStatic = nonStaticCounts.length > 0 ? Math.max(...nonStaticCounts) : 0
  const effectiveCounts = colCounts.map(c => {
    if (c === null) return null
    if (c === 'static') return maxNonStatic
    return c
  })
  const activeCounts = effectiveCounts.filter(c => c !== null)
  const countsAllMatch = activeCounts.length > 0 && activeCounts.every(c => c === activeCounts[0])

  return (
    <div className="csvbuilder-page">
      <div className="csvbuilder-container">
        <header className="csvbuilder-header">
          <h1>📊 CSV Builder</h1>
          <p>Paste data into columns, set static values, and download as CSV.</p>
        </header>

        <section className="csvbuilder-toolbar">
          <div className="toolbar-left">
            <label className="header-toggle">
              <input
                type="checkbox"
                checked={includeHeader}
                onChange={e => setIncludeHeader(e.target.checked)}
              />
              <span>Include header row</span>
            </label>
            <label className="header-toggle">
              <input
                type="checkbox"
                checked={rowDeleterEnabled}
                onChange={e => setRowDeleterEnabled(e.target.checked)}
              />
              <span>Row Deleter</span>
            </label>
            <div className="toolbar-stats">
              {activeCount > 0 && (
                <span className="stat-badge">{activeCount} column{activeCount !== 1 ? 's' : ''} active</span>
              )}
              {totalLines > 0 && (
                <span className="stat-badge">{totalLines.toLocaleString()} line{totalLines !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
          <div className="toolbar-right">
            <button className="add-col-btn" onClick={addColumn}>+ Add Column</button>
            <button
              className="download-btn"
              onClick={handleDownload}
              disabled={activeCount === 0}
            >
              Download CSV
            </button>
          </div>
        </section>

        <section className="csvbuilder-columns">
          {columns.map((col, idx) => {
            const ec = effectiveCounts[idx]
            const isActive = ec !== null
            const countClass = isActive
              ? (countsAllMatch ? 'col-count-match' : 'col-count-mismatch')
              : 'col-count-inactive'
            return (
            <div className="csv-column" key={col.id}>
              <div className="col-header-row">
                <span className="col-number">Column {idx + 1}</span>
                <div className="col-header-right">
                  <span className={`col-count-badge ${countClass}`}>
                    {isActive ? ec.toLocaleString() : '—'}
                  </span>
                  {columns.length > 1 && (
                    <button className="remove-col-btn" onClick={() => removeColumn(col.id)} title="Remove column">×</button>
                  )}
                </div>
              </div>

              {includeHeader && (
                <div className="col-field">
                  <label className="col-field-label">Header Label</label>
                  <input
                    type="text"
                    className="col-input"
                    placeholder="Column header..."
                    value={col.label}
                    onChange={e => updateColumn(col.id, 'label', e.target.value)}
                  />
                </div>
              )}

              <div className="col-field">
                <label className="col-field-label">Static Value</label>
                {col.lines.trim() ? (
                  <div className="col-static-notice col-static-notice-small">
                    Using Values
                  </div>
                ) : (
                  <input
                    type="text"
                    className="col-input"
                    placeholder="Same value for every row..."
                    value={col.staticValue}
                    onChange={e => updateColumn(col.id, 'staticValue', e.target.value)}
                  />
                )}
              </div>

              {!col.staticValue.trim() && !col.lines.trim() && (
                <div className="col-field-divider">or</div>
              )}

              <div className="col-field col-field-grow">
                <label className="col-field-label">
                  Values (1 per line)
                  {col.lines.trim() && (
                    <span className="line-count">
                      {col.lines.split(/\r?\n/).filter(l => l !== '').length.toLocaleString()} lines
                    </span>
                  )}
                </label>
                {col.staticValue.trim() ? (
                  <div className="col-static-notice">
                    Static value set — every row will use "{col.staticValue}"
                  </div>
                ) : rowDeleterEnabled && col.lines.trim() ? (
                  <div className="col-lines-deleter" onMouseLeave={() => setHoveredRow(null)}>
                    {col.lines.split(/\r?\n/).filter(l => l !== '').map((line, i) => (
                      <div
                        key={i}
                        className={`col-line-item${hoveredRow === i ? ' col-line-item-hover' : ''}`}
                        onMouseEnter={() => setHoveredRow(i)}
                      >
                        <button
                          className="col-line-delete-btn"
                          onClick={() => deleteRow(i)}
                          title="Delete row from all columns"
                        >×</button>
                        <span className="col-line-num">{i + 1}</span>
                        <span className="col-line-text">{line}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="col-textarea"
                    placeholder={"Paste values here...\nOne per line"}
                    value={col.lines}
                    onChange={e => updateColumn(col.id, 'lines', e.target.value)}
                    spellCheck={false}
                  />
                )}
              </div>
            </div>
            )
          })}
        </section>

        {csvPreview && (
          <section className="csv-preview-section">
            <div className="csv-preview-header">
              <h2 className="csv-preview-title">CSV Preview</h2>
              <button className="copy-csv-btn" onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy to Clipboard'}
              </button>
            </div>
            <textarea
              className="csv-preview-textarea"
              value={csvPreview}
              rows={Math.min((csvPreview.split('\n').length) + 1, 75)}
              readOnly
              spellCheck={false}
              onFocus={e => e.target.select()}
            />
          </section>
        )}
        {/* Column Editor */}
        <section className="coleditor-section">
          <div className="coleditor-header">
            <h2 className="coleditor-title">Column Editor</h2>
            <p className="coleditor-desc">Paste a list of values and wrap each line with a prefix/suffix. Useful for building SQL IN clauses.</p>
          </div>
          <div className="coleditor-layout">
            <div className="coleditor-input-side">
              <div className="coleditor-presets">
                <button
                  className="coleditor-preset-btn"
                  onClick={() => { setColEditorPrepend("'"); setColEditorAppend("',"); setColEditorOmitLast(true) }}
                >
                  Quick SQL
                </button>
              </div>
              <div className="coleditor-controls">
                <div className="coleditor-field">
                  <label className="col-field-label">Prepend</label>
                  <input
                    className="col-input"
                    type="text"
                    value={colEditorPrepend}
                    onChange={e => setColEditorPrepend(e.target.value)}
                    placeholder="e.g., '"
                  />
                </div>
                <div className="coleditor-field">
                  <label className="col-field-label">Append</label>
                  <input
                    className="col-input"
                    type="text"
                    value={colEditorAppend}
                    onChange={e => setColEditorAppend(e.target.value)}
                    placeholder="e.g., ',"
                  />
                </div>
              </div>
              <label className="coleditor-checkbox">
                <input
                  type="checkbox"
                  checked={colEditorOmitLast}
                  onChange={e => setColEditorOmitLast(e.target.checked)}
                />
                <span>Omit trailing comma on last line</span>
              </label>
              <label className="col-field-label">
                Input (1 value per line)
                {colEditorInput.trim() && (
                  <span className="line-count">
                    {colEditorInput.split(/\r?\n/).filter(l => l.trim() !== '').length.toLocaleString()} lines
                  </span>
                )}
              </label>
              <textarea
                className="col-textarea coleditor-textarea"
                placeholder={"Paste values here...\nOne per line"}
                value={colEditorInput}
                onChange={e => setColEditorInput(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="coleditor-output-side">
              <div className="coleditor-output-header">
                <label className="col-field-label">Output</label>
                <button className="copy-csv-btn" onClick={handleColEditorCopy} disabled={!colEditorOutput}>
                  {colEditorCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                className="col-textarea coleditor-textarea coleditor-output-textarea"
                value={colEditorOutput}
                readOnly
                spellCheck={false}
                onFocus={e => e.target.select()}
                placeholder="Output will appear here..."
              />
            </div>
          </div>
        </section>

        {/* Deduplicator */}
        <section className="coleditor-section dedupe-section">
          <div className="coleditor-header">
            <h2 className="coleditor-title">Deduplicator</h2>
            <p className="coleditor-desc">Paste a list of values (one per line) and remove duplicates. Order of first occurrence is preserved. Optimized for 100k+ lines.</p>
          </div>
          <div className="coleditor-layout">
            <div className="coleditor-input-side">
              <div className="coleditor-controls dedupe-controls">
                <label className="coleditor-checkbox">
                  <input
                    type="checkbox"
                    checked={dedupeTrim}
                    onChange={e => setDedupeTrim(e.target.checked)}
                  />
                  <span>Trim whitespace</span>
                </label>
                <label className="coleditor-checkbox">
                  <input
                    type="checkbox"
                    checked={dedupeCaseInsensitive}
                    onChange={e => setDedupeCaseInsensitive(e.target.checked)}
                  />
                  <span>Case-insensitive</span>
                </label>
                {dedupeInput && (
                  <button
                    className="coleditor-preset-btn dedupe-clear-btn"
                    onClick={handleDedupeClear}
                    title="Clear input"
                  >
                    Clear
                  </button>
                )}
              </div>
              <label className="col-field-label">
                Input (1 value per line)
                {dedupeResult.total > 0 && (
                  <span className="line-count">
                    {dedupeResult.total.toLocaleString()} non-empty
                  </span>
                )}
              </label>
              <textarea
                className="col-textarea coleditor-textarea"
                placeholder={"Paste values here...\nOne per line\nDuplicates will be removed"}
                value={dedupeInput}
                onChange={e => setDedupeInput(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="coleditor-output-side">
              <div className="coleditor-output-header">
                <label className="col-field-label">
                  Output
                  {dedupeResult.unique > 0 && (
                    <span className="line-count">
                      {dedupeResult.unique.toLocaleString()} unique
                      {dedupeResult.dupes > 0 && (
                        <> · {dedupeResult.dupes.toLocaleString()} removed</>
                      )}
                    </span>
                  )}
                </label>
                <button
                  className="copy-csv-btn"
                  onClick={handleDedupeCopy}
                  disabled={!dedupeResult.output}
                >
                  {dedupeCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                className="col-textarea coleditor-textarea coleditor-output-textarea"
                value={dedupeResult.output}
                readOnly
                spellCheck={false}
                onFocus={e => e.target.select()}
                placeholder="Deduplicated output will appear here..."
              />
            </div>
          </div>
        </section>

        {/* UUID Extractor */}
        <section className="coleditor-section dedupe-section uuid-section">
          <div className="coleditor-header">
            <h2 className="coleditor-title">UUID Extractor</h2>
            <p className="coleditor-desc">Paste any text and extract every UUID found, one per line. Smart-classifies each UUID by surrounding context (tenantId, userId, txId, deviceId, physicalDeviceId, requestId, pipelineId, and more). Toggle categories to page-in just the IDs you need.</p>
          </div>
          <div className="coleditor-layout">
            <div className="coleditor-input-side">
              <div className="uuid-mode-tabs">
                <button
                  className={`uuid-mode-tab${uuidMode === 'text' ? ' uuid-mode-tab-active' : ''}`}
                  onClick={() => setUuidMode('text')}
                  type="button"
                >
                  Paste Text
                </button>
                <button
                  className={`uuid-mode-tab${uuidMode === 'file' ? ' uuid-mode-tab-active' : ''}`}
                  onClick={() => setUuidMode('file')}
                  type="button"
                  title='Drop a CSV or JSON file. CSV column names like "requestContext.tenantId" become high-confidence classifiers; JSON keys like "tenantId": do the same in the free-text classifier.'
                >
                  Drop File
                </button>
              </div>
              <div className="coleditor-controls dedupe-controls">
                <label className="coleditor-checkbox">
                  <input
                    type="checkbox"
                    checked={uuidDedupe}
                    onChange={e => setUuidDedupe(e.target.checked)}
                  />
                  <span>Deduplicate</span>
                </label>
                <label className="coleditor-checkbox">
                  <input
                    type="checkbox"
                    checked={uuidLowercase}
                    onChange={e => setUuidLowercase(e.target.checked)}
                  />
                  <span>Lowercase</span>
                </label>
                <label className="coleditor-checkbox">
                  <input
                    type="checkbox"
                    checked={uuidGroupHeaders}
                    onChange={e => setUuidGroupHeaders(e.target.checked)}
                  />
                  <span>Group headers</span>
                </label>
                {uuidResult.groups.some(g => g.category === 'unknown') && (
                  <label className="coleditor-checkbox">
                    <input
                      type="checkbox"
                      checked={uuidShowContext}
                      onChange={e => setUuidShowContext(e.target.checked)}
                    />
                    <span>Show context (unknown)</span>
                  </label>
                )}
                {uuidMode === 'text' && uuidInput && (
                  <button
                    className="coleditor-preset-btn dedupe-clear-btn"
                    onClick={handleUuidClear}
                    title="Clear input"
                  >
                    Clear
                  </button>
                )}
                {uuidMode === 'file' && uuidCsvFileName && (
                  <button
                    className="coleditor-preset-btn dedupe-clear-btn"
                    onClick={handleUuidCsvUnload}
                    title="Unload file"
                  >
                    Unload File
                  </button>
                )}
              </div>
              {uuidMode === 'text' ? (
                <>
                  <label className="col-field-label">
                    Input (any text)
                    {uuidResult.total > 0 && (
                      <span className="line-count">
                        {uuidResult.total.toLocaleString()} found
                      </span>
                    )}
                  </label>
                  <textarea
                    className="col-textarea coleditor-textarea"
                    placeholder={"Paste anything containing UUIDs...\nLogs, JSON, CSV, SQL, etc.\nUUIDs are classified by context (tenantId, userId, txId, ...)"}
                    value={uuidInput}
                    onChange={e => setUuidInput(e.target.value)}
                    spellCheck={false}
                  />
                </>
              ) : (
                <>
                  <label className="col-field-label">
                    {uuidFileType === 'json' ? 'JSON file' : 'CSV file'}
                    {uuidResult.csvStats && (
                      <span className="line-count">
                        {uuidResult.csvStats.rows.toLocaleString()} rows · {uuidResult.csvStats.cols} cols ·{' '}
                        {uuidResult.csvStats.classifiedCols} classified
                      </span>
                    )}
                    {!uuidResult.csvStats && uuidFileType === 'json' && uuidCsvText && (
                      <span className="line-count">
                        {(uuidCsvText.length / 1024).toFixed(1).toLocaleString()} KB
                      </span>
                    )}
                  </label>
                  <label
                    className={`uuid-csv-dropzone${uuidIsDragging ? ' uuid-csv-dropzone-active' : ''}${uuidCsvFileName ? ' uuid-csv-dropzone-loaded' : ''}`}
                    onDragOver={handleUuidDragOver}
                    onDragEnter={handleUuidDragOver}
                    onDragLeave={handleUuidDragLeave}
                    onDrop={handleUuidDrop}
                  >
                    <input
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      onChange={handleUuidCsvInputChange}
                      className="uuid-csv-input"
                    />
                    {uuidCsvFileName ? (
                      <div className="uuid-csv-loaded">
                        <div className="uuid-csv-file-name">
                          {uuidFileType === 'json' ? '🗎' : '📄'} {uuidCsvFileName}
                        </div>
                        <div className="uuid-csv-file-meta">
                          {uuidFileType === 'json'
                            ? `JSON file (${(uuidCsvText.length / (1024 * 1024)).toFixed(2)} MB) — keys like "tenantId":, "txId": are auto-classified`
                            : (uuidResult.csvStats
                                ? `${uuidResult.csvStats.rows.toLocaleString()} rows · ${uuidResult.csvStats.classifiedCols} of ${uuidResult.csvStats.cols} columns auto-classified`
                                : 'Parsing...')}
                        </div>
                        <div className="uuid-csv-replace-hint">Drop another file or click to replace</div>
                      </div>
                    ) : (
                      <div className="uuid-csv-empty">
                        <div className="uuid-csv-empty-icon">⬇</div>
                        <div className="uuid-csv-empty-title">Drop a CSV or JSON file here, or click to browse</div>
                        <div className="uuid-csv-empty-desc">
                          <strong>CSV:</strong> column names like <code>requestContext.tenantId</code>,{' '}
                          <code>metadata.txId</code>, <code>nginx.tenant_id</code> become high-confidence
                          classifiers; free-text columns (e.g. <code>message</code>) are still scanned
                          for embedded UUIDs.<br />
                          <strong>JSON:</strong> pretty-printed log entries with keys like{' '}
                          <code>"tenantId":</code>, <code>"txId":</code>, <code>"requestId":</code> are
                          classified directly by the free-text classifier.
                        </div>
                      </div>
                    )}
                  </label>
                  {uuidCsvError && <div className="uuid-csv-error">{uuidCsvError}</div>}
                </>
              )}
            </div>
            <div className="coleditor-output-side">
              {uuidResult.groups.length > 0 && (
                <div className="uuid-chips-bar">
                  <div className="uuid-chips-header">
                    <span className="uuid-chips-label">Categories</span>
                    <div className="uuid-chips-actions">
                      <button className="uuid-chips-action" onClick={handleUuidSelectAll}>All</button>
                      <button className="uuid-chips-action" onClick={handleUuidSelectNone}>None</button>
                    </div>
                  </div>
                  <div className="uuid-chips">
                    {uuidResult.groups.map(g => {
                      const selected = !uuidExcluded.has(g.category)
                      return (
                        <div
                          key={g.category}
                          className={`uuid-chip uuid-chip-${g.category}${selected ? ' uuid-chip-on' : ''}`}
                        >
                          <button
                            className="uuid-chip-toggle"
                            onClick={() => toggleUuidCategory(g.category)}
                            title={selected ? 'Click to hide' : 'Click to show'}
                          >
                            <span className="uuid-chip-name">{g.category}</span>
                            <span className="uuid-chip-count">{g.items.length}</span>
                          </button>
                          <button
                            className="uuid-chip-copy"
                            onClick={() => handleUuidCopyCategory(g.category)}
                            title={`Copy all ${g.category}s to clipboard`}
                          >
                            ⎘
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="coleditor-output-header">
                <label className="col-field-label">
                  Output
                  {uuidIsPending && (
                    <span className="line-count uuid-pending">Computing…</span>
                  )}
                  {uuidSelectedCount > 0 && (
                    <span className="line-count">
                      {uuidSelectedCount.toLocaleString()} {uuidDedupe ? 'unique' : 'total'}
                      {uuidResult.total > uuidSelectedCount && (
                        <> · {(uuidResult.total - uuidSelectedCount).toLocaleString()} hidden</>
                      )}
                    </span>
                  )}
                </label>
                <button
                  className="copy-csv-btn"
                  onClick={handleUuidCopy}
                  disabled={!uuidOutput}
                >
                  {uuidCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                className="col-textarea coleditor-textarea coleditor-output-textarea"
                value={uuidOutput}
                readOnly
                spellCheck={false}
                onFocus={e => e.target.select()}
                placeholder="Extracted UUIDs will appear here, grouped by classification..."
              />
            </div>
          </div>
        </section>
      </div>
      <ToolInfoPanel toolId="csv-builder" />
    </div>
  )
}

export default CsvBuilder
