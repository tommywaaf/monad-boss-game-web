/**
 * Cloudflare Pages Function: /api/counter
 *
 * Proxies counter increment calls to counterapi.dev so that the API
 * token never leaves the server.
 *
 * Required Cloudflare environment variables:
 *   COUNTER_API       – Bearer token from counterapi.dev
 *   COUNTER_WORKSPACE – Your counterapi.dev workspace name
 *
 * Usage (GET):
 *   /api/counter?name=bcaster           → increment by 1
 *   /api/counter?name=bcaster&count=42  → increment by 42
 */
export async function onRequest(context) {
  const { request, env } = context

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const url = new URL(request.url)
  const name = url.searchParams.get('name')
  const count = Math.min(Math.max(parseInt(url.searchParams.get('count') || '1', 10), 1), 10000)

  if (!name) {
    return new Response(JSON.stringify({ error: 'Missing ?name= parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const token = env.COUNTER_API
  const workspace = env.COUNTER_WORKSPACE

  if (!token || !workspace) {
    console.error('[counter] COUNTER_API or COUNTER_WORKSPACE env vars not set')
    return new Response(JSON.stringify({ ok: false, error: 'Counter not configured' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const apiUrl = `https://api.counterapi.dev/v2/${encodeURIComponent(workspace)}/${encodeURIComponent(name)}/up`
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    // Fire `count` increments in parallel (counterapi.dev /up adds 1 per call)
    const requests = Array.from({ length: count }, () =>
      fetch(apiUrl, { method: 'GET', headers })
    )
    const responses = await Promise.all(requests)

    // Use the last response for the returned count value
    const lastData = await responses[responses.length - 1].json().catch(() => ({}))

    return new Response(JSON.stringify({ ok: true, incremented: count, count: lastData.count ?? null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[counter] Failed to increment:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}
