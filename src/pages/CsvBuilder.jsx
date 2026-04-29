import { useState, useCallback, useMemo, useEffect } from 'react'
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
  const [uuidCopied, setUuidCopied] = useState(false)

  const uuidResult = useMemo(() => {
    if (!uuidInput) return { output: '', total: 0, unique: 0 }
    // Standard UUID format: 8-4-4-4-12 hex chars. Case-insensitive match.
    const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
    const matches = uuidInput.match(re) || []
    const total = matches.length
    let out
    if (uuidDedupe) {
      const seen = new Set()
      out = []
      for (let i = 0; i < matches.length; i++) {
        const m = uuidLowercase ? matches[i].toLowerCase() : matches[i]
        const key = m.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(m)
      }
    } else {
      out = uuidLowercase ? matches.map(m => m.toLowerCase()) : matches
    }
    return { output: out.join('\n'), total, unique: out.length }
  }, [uuidInput, uuidDedupe, uuidLowercase])

  const handleUuidCopy = useCallback(() => {
    if (!uuidResult.output) return
    navigator.clipboard.writeText(uuidResult.output).then(() => {
      setUuidCopied(true)
      setTimeout(() => setUuidCopied(false), 2000)
    })
  }, [uuidResult.output])

  const handleUuidClear = useCallback(() => {
    setUuidInput('')
  }, [])

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
        <section className="coleditor-section dedupe-section">
          <div className="coleditor-header">
            <h2 className="coleditor-title">UUID Extractor</h2>
            <p className="coleditor-desc">Paste any text and extract every UUID (8-4-4-4-12 format) found, one per line. Works on logs, JSON, CSV, or any blob of text.</p>
          </div>
          <div className="coleditor-layout">
            <div className="coleditor-input-side">
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
                {uuidInput && (
                  <button
                    className="coleditor-preset-btn dedupe-clear-btn"
                    onClick={handleUuidClear}
                    title="Clear input"
                  >
                    Clear
                  </button>
                )}
              </div>
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
                placeholder={"Paste anything containing UUIDs...\nLogs, JSON, CSV, SQL, etc.\nAll UUIDs will be extracted"}
                value={uuidInput}
                onChange={e => setUuidInput(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="coleditor-output-side">
              <div className="coleditor-output-header">
                <label className="col-field-label">
                  Output
                  {uuidResult.unique > 0 && (
                    <span className="line-count">
                      {uuidResult.unique.toLocaleString()} {uuidDedupe ? 'unique' : 'total'}
                      {uuidDedupe && uuidResult.total > uuidResult.unique && (
                        <> · {(uuidResult.total - uuidResult.unique).toLocaleString()} removed</>
                      )}
                    </span>
                  )}
                </label>
                <button
                  className="copy-csv-btn"
                  onClick={handleUuidCopy}
                  disabled={!uuidResult.output}
                >
                  {uuidCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                className="col-textarea coleditor-textarea coleditor-output-textarea"
                value={uuidResult.output}
                readOnly
                spellCheck={false}
                onFocus={e => e.target.select()}
                placeholder="Extracted UUIDs will appear here..."
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
