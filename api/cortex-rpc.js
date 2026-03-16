/**
 * Proxy for Cortex RPC (https://security.cortexlabs.ai:30088).
 * Server does the request (like curl) so the browser never hits CORS.
 */
const CORTEX_RPC = 'https://security.cortexlabs.ai:30088'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
    const response = await fetch(CORTEX_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const data = await response.json().catch(() => ({}))
    res.status(response.status).json(data)
  } catch (err) {
    console.error('[cortex-rpc]', err.message)
    res.status(502).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: err.message || 'Proxy request failed' },
    })
  }
}
