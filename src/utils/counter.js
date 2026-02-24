// ─── Persistent action counters (localStorage) ──────────────────────────────
// These survive page refreshes AND new builds — data lives on the user's
// browser tied to the domain, not to any particular build.
//
// Keys used in localStorage:
//   mbg_counter_broadcasts    – total txs sent via Broadcaster
//   mbg_counter_simulations   – total txs simulated via Simulator
//   mbg_counter_ton           – total TON txs inspected
//   mbg_counter_btc           – total BTC txs inspected

const PREFIX = 'mbg_counter_'

export const COUNTER_KEYS = {
  broadcasts:   'broadcasts',
  simulations:  'simulations',
  ton:          'ton',
  btc:          'btc',
}

/** Increment a counter by `amount` (default 1) and return the new value. */
export function incrementCounter(key, amount = 1) {
  try {
    const storageKey = PREFIX + key
    const current = parseInt(localStorage.getItem(storageKey) || '0', 10)
    const next = current + amount
    localStorage.setItem(storageKey, String(next))
    return next
  } catch {
    return 0
  }
}

/** Read the current value of a counter without changing it. */
export function getCounter(key) {
  try {
    return parseInt(localStorage.getItem(PREFIX + key) || '0', 10)
  } catch {
    return 0
  }
}

/** Read all four counters at once. */
export function getAllCounters() {
  return {
    broadcasts:  getCounter(COUNTER_KEYS.broadcasts),
    simulations: getCounter(COUNTER_KEYS.simulations),
    ton:         getCounter(COUNTER_KEYS.ton),
    btc:         getCounter(COUNTER_KEYS.btc),
  }
}

// ─── Remote counter via Cloudflare Pages Function → counterapi.dev ────────────
// Fires-and-forgets — never throws, never blocks the UI.
// `name` must match one of the counter names created on counterapi.dev:
//   bcaster | sim | ton | btc

/**
 * Increment a remote counterapi.dev counter by `count` (default 1).
 * The actual API call goes through /api/counter (Cloudflare Pages Function)
 * so the token stays server-side.
 *
 * @param {'bcaster'|'sim'|'ton'|'btc'} name
 * @param {number} [count=1]  Number of transactions / items to count
 */
export async function trackUsage(name, count = 1) {
  try {
    const n = Math.max(1, Math.round(count))
    await fetch(`/api/counter?name=${encodeURIComponent(name)}&count=${n}`, {
      method: 'GET',
      keepalive: true,
    })
  } catch {
    // Never let a counter failure reach the user
  }
}
