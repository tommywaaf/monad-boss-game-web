import { useState } from 'react'
import './ToolInfoPanel.css'

const TOOL_INFO = {
  broadcaster: {
    title: 'Broadcaster',
    why: 'Sometimes a transaction is not broadcast even though it\'s otherwise valid. You can take a signed RLP or raw tx and send it to the correct network. You can also test whether a transaction will fail by broadcasting it and checking if the RPC response is final or not.',
    how: 'Select the target network (or use Auto to detect the chain from the transaction). Paste one or more signed RLP-encoded transactions (one per line) and hit Broadcast. Results show the tx hash or error for each, with explorer links.',
  },
  simulator: {
    title: 'Simulator',
    why: 'Similar to Broadcaster, but lets you see what the RPC response would be without actually broadcasting the transaction on-chain. Also useful for decoding an RLP value to inspect its contents.',
    how: 'Paste a signed RLP-encoded transaction, select the network, and simulate. The response shows what the RPC would return without submitting the transaction. Use the decode tab to break down the RLP into human-readable fields.',
  },
  'tx-fetcher': {
    title: 'TX Fetcher',
    why: 'Use this to reconcile a vault or determine the highest confirmed nonce on-chain to verify whether a transaction is safe to fail.',
    how: 'Enter a permanent address to fetch all tx hashes for all time or within a specific date range. You can also look up just the highest confirmed nonce on-chain for that address.',
  },
  'ton-details': {
    title: 'TON Details',
    why: 'Provides a quick way to convert a TON transaction hash to its Fireblocks equivalent and identify the blocks to rescan.',
    how: 'Paste a TON transaction hash and the tool converts it to the Fireblocks-format hash and shows the relevant blocks for rescanning.',
  },
  'ton-batch-lookup': {
    title: 'TON Safe-to-Fail',
    why: 'Checks multiple conditions to determine if a TON transaction is safe to fail: are all actions skipped in the action phase? Are the compute and action phase fees zero? Did the phases fail?',
    how: 'Paste a TON transaction hash or batch of hashes. The tool inspects the action phase, compute phase, and fees to give you a clear safe-to-fail determination.',
  },
  'ton-seqno-check': {
    title: 'TON Seqno Check',
    why: 'Like TX Fetcher but for TON. Lets you look up the current sequence number for a TON address to reconcile state and determine if transactions are safe to fail.',
    how: 'Enter a TON wallet address to fetch its current on-chain sequence number and compare it against pending transactions.',
  },
  'btc-safe-to-fail': {
    title: 'BTC Safe-to-Fail',
    why: 'Determines whether a BTC transaction can be safely failed by checking if its inputs have already been confirmed on-chain in another transaction.',
    how: 'Paste a BTC transaction hash. The tool grabs the inputs, checks if they\'re already confirmed in another tx, and visually displays the layout with source information so you can make a safe-to-fail determination.',
  },
  'btc-fetcher': {
    title: 'BTC Fetcher',
    why: 'Like TX Fetcher but for Bitcoin and Litecoin. Fetches transaction history for UTXO-based addresses.',
    how: 'Enter a BTC or LTC address to fetch all transaction hashes, filter by date range, or find the current UTXO state.',
  },
  'csv-builder': {
    title: 'CSV Builder',
    why: 'Lets you quickly build CSV files that are ready to copy-paste into ops-client without manual formatting.',
    how: 'Fill in the required fields, add rows as needed, and the tool generates a properly formatted CSV. Copy the output directly into ops-client.',
  },
  faucet: {
    title: 'Faucet',
    why: 'A testnet faucet for grabbing crypto on supported testnets without hunting down individual chain faucets.',
    how: 'Select the testnet network, enter your wallet address, and request test tokens. Tokens are sent directly to your address.',
  },
  'webhook-tester': {
    title: 'Webhook Tester',
    why: 'A self-hosted webhooks.site clone where you can generate URLs and test webhooks. Great for comparing v1 and v2 webhook payloads side by side.',
    how: 'Generate a unique webhook URL, configure it as your endpoint, and incoming requests are displayed in real time. Open multiple URLs to compare different webhook versions simultaneously.',
  },
  'callback-handler': {
    title: 'Callback Handler',
    why: 'An easy-to-set-up callback handler for your cosigner. Lets you see the traffic and payload structure so you can troubleshoot callback issues.',
    how: 'Set up the callback handler URL with your cosigner configuration. All incoming callback traffic is displayed with full request details for inspection and debugging.',
  },
  'easy-cosigner': {
    title: 'Easy Cosigner',
    why: 'A ready-to-go cosigner setup tool. Just paste your pairing token and you\'ll have a cosigner configured. Ideal for crypto journey testing.',
    how: 'Copy the pairing token from the Fireblocks console, paste it here, and submit. The cosigner agent picks it up automatically. Optionally configure a callback handler URL and public key in Advanced Options.',
  },
}

export function getToolInfo(toolId) {
  return TOOL_INFO[toolId] || null
}

export default function ToolInfoPanel({ toolId }) {
  const [collapsed, setCollapsed] = useState(false)
  const info = TOOL_INFO[toolId]
  if (!info) return null

  return (
    <aside className={`tool-info-panel ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="tool-info-collapse-btn"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand info panel' : 'Collapse info panel'}
      >
        {collapsed ? '◀' : '▶'}
      </button>
      {!collapsed && (
        <div className="tool-info-content">
          <h3 className="tool-info-title">{info.title}</h3>
          <div className="tool-info-section">
            <h4 className="tool-info-heading">Why does this exist?</h4>
            <p className="tool-info-text">{info.why}</p>
          </div>
          <div className="tool-info-section">
            <h4 className="tool-info-heading">How to use</h4>
            <p className="tool-info-text">{info.how}</p>
          </div>
        </div>
      )}
    </aside>
  )
}
