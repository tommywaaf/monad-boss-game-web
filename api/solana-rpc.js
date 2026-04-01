/**
 * Proxy for Solana RPC (https://api.mainnet-beta.solana.com).
 * Server does the request so the browser never hits CORS.
 */
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'

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
    const response = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const data = await response.json().catch(() => ({}))
    res.status(response.status).json(data)
  } catch (err) {
    console.error('[solana-rpc]', err.message)
    res.status(502).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: err.message || 'Proxy request failed' },
    })
  }
}
