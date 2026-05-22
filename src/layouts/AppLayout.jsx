import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'

export default function AppLayout() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('deprecation_warning_dismissed') === 'true'
  )

  function handleDismiss() {
    sessionStorage.setItem('deprecation_warning_dismissed', 'true')
    setDismissed(true)
  }

  return (
    <div className="app-layout">
      {!dismissed && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#1a1a2e',
            border: '2px solid #f59e0b',
            borderRadius: '12px',
            padding: '2.5rem 2rem',
            maxWidth: '480px',
            width: '90%',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{
              color: '#f59e0b',
              margin: '0 0 1rem',
              fontSize: '1.25rem',
              fontWeight: 700,
            }}>
              This Tool Has Moved
            </h2>
            <p style={{
              color: '#e2e8f0',
              margin: '0 0 0.75rem',
              lineHeight: 1.6,
              fontSize: '0.95rem',
            }}>
              This tool has been moved to an internal link. Please obtain the new link internally.
            </p>
            <p style={{
              color: '#94a3b8',
              margin: '0 0 1.75rem',
              fontSize: '0.875rem',
            }}>
              This version is old and will be shut down.
            </p>
            <button
              onClick={handleDismiss}
              style={{
                background: '#f59e0b',
                color: '#0f0c29',
                border: 'none',
                borderRadius: '8px',
                padding: '0.65rem 2rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              I understand, continue anyway
            </button>
          </div>
        </div>
      )}
      <Sidebar />
      <main className="app-main-content">
        <Outlet />
      </main>
    </div>
  )
}
