import { useState, useCallback, useMemo, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
            <span className="sidebar-text">Ton Details</span>
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
      </div>
    </div>
  )
}

export default CsvBuilder
