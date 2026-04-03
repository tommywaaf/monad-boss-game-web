import { useState, useCallback, useMemo, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
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

function CsvBuilder() {
  const location = useLocation()

  useEffect(() => {
    document.title = 'CSV Builder'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  const [columns, setColumns] = useState(() => [makeColumn(), makeColumn(), makeColumn(), makeColumn()])
  const [includeHeader, setIncludeHeader] = useState(false)

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

  const handleDownload = useCallback(() => {
    const csv = buildCsv()
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `csv_builder_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [buildCsv])

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

  const csvPreview = useMemo(() => buildCsv(), [buildCsv])

  const handleCopy = useCallback(() => {
    if (!csvPreview) return
    navigator.clipboard.writeText(csvPreview).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [csvPreview])

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
          <Link 
            to="/faucet" 
            className={`sidebar-link ${location.pathname === '/faucet' ? 'active' : ''}`}
          >
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
      </div>
      <ToolInfoPanel toolId="csv-builder" />
    </div>
  )
}

export default CsvBuilder
