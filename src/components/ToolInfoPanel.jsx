import { useState } from 'react'
import './ToolInfoPanel.css'

const TOOL_INFO = {
  broadcaster: {
    title: 'Broadcaster',
    why: 'Sometimes a transaction is not broadcast even though it\'s otherwise valid. You can take a signed RLP or raw tx and send it to the correct network. You can also test whether a transaction will fail by broadcasting it and checking if the RPC response is final or not.',
    how: 'Select a network or use Auto to detect the chain from the transaction. Paste signed transactions (one per line) — supports EVM RLP, Solana (base64/base58/hex), XRP blobs, Stellar XDR, and Bitcoin raw hex. You can also paste from clipboard, upload a file, or drag and drop. Configure rate limits and retry settings under Settings, then hit Broadcast. Results show tx hash or error per line with explorer links, and can be searched, filtered, and downloaded as CSV.',
  },
  simulator: {
    title: 'Simulator',
    why: 'Similar to Broadcaster, but lets you see what the RPC response would be without actually broadcasting the transaction on-chain. Useful for checking if a transaction would succeed or fail, and for decoding an RLP value to inspect its contents.',
    how: 'Paste a signed RLP-encoded EVM transaction, select the network (or use Auto to detect chain ID). The tool decodes the RLP into human-readable fields (nonce, gas, to, value, data, etc.), recovers the sender address, then simulates via eth_call. Results show gas estimates, return data, revert reasons (with Solidity error decoding), sender balance, and execution traces when the node supports debug_traceCall or trace_call.',
  },
  'tx-fetcher': {
    title: 'TX Fetcher',
    why: 'Use this to reconcile a vault or determine the highest confirmed nonce on-chain to verify whether a transaction is safe to fail.',
    how: 'Enter an EVM address and select a chain from the Etherscan V2 network list. Fetch all tx hashes (Normal, Internal, ERC-20, ERC-721, ERC-1155) for all time or within a specific date range. Filter results by direction (incoming/outgoing). Use "Max Confirmed Nonce Only" for a quick nonce-only lookup via eth_getTransactionCount. Results can be copied or downloaded as CSV.',
  },
  'onchain-check': {
    title: 'Am I Onchain?',
    why: 'Quickly verify whether a batch of EVM transaction hashes exists on a specific chain (for example after signing or before reconciliation).',
    how: 'Select a chain from the Etherscan V2 list and paste hashes (comma, space, or newline separated — large batches supported). Each hash uses eth_getTransactionByHash plus, when the tx is mined, gettxreceiptstatus for Success vs Fail (execution reverted) like Etherscan. Pending txs show Pending; conservative pacing and retries apply. Results include request_success, on_chain, and execution; export to CSV.',
  },
  'ton-details': {
    title: 'TON Details',
    why: 'Provides a quick way to convert a TON transaction to its Fireblocks-format hash and identify the masterchain blocks to rescan.',
    how: 'Paste one or more Tonscan/Tonviewer URLs or raw 64-hex transaction hashes (space or newline separated). The tool resolves each via TonCenter (trying message hash then transaction hash), and returns the FB hash to rescan, the masterchain block range (start to start+20), and the FB hash after rescan (trace external hash).',
  },
  'ton-batch-lookup': {
    title: 'TON Safe-to-Fail',
    why: 'Checks whether TON transactions are safe to fail by inspecting on-chain status: was the transaction aborted? Are all actions skipped in the action phase? Did the compute or action phases fail?',
    how: 'Paste TON transaction hashes or Tonscan/Tonviewer URLs (comma, space, or newline separated — handles large batches). The tool checks each against TonCenter: compute phase exit codes, action phase success/skip status, and trace actions. Results show Found/Not Found on explorer and a status verdict (Success, Failed, Partial Fail, Skipped). Adjust concurrency and request delay for rate limiting. Export results as CSV.',
  },
  'ton-seqno-check': {
    title: 'TON Seqno Check',
    why: 'Like TX Fetcher but for TON. Look up the current on-chain sequence number for a TON wallet to reconcile state and determine if transactions are safe to fail.',
    how: 'Enter a TON wallet address (EQ.../UQ.../raw 0:... format). The tool queries TonCenter for the wallet\'s current seqno, balance, status, and wallet type. The highest confirmed seqno and next seqno are displayed. Optionally enable Transaction Export to fetch full tx history with FB hashes, filterable by direction and date range, downloadable as CSV.',
  },
  'btc-safe-to-fail': {
    title: 'BTC / LTC Safe-to-Fail',
    why: 'Determines whether a BTC or LTC transaction can be safely failed by checking if its inputs have already been spent on-chain in another transaction. Also detects RBF signaling and double-spend flags.',
    how: 'Toggle between BTC and LTC at the top, then paste one or more txids or explorer URLs. The tool queries multiple providers (BlockCypher, mempool.space/litecoinspace.org, SoChain, and blockchain.com for BTC) to get confirmation status, then checks each input\'s UTXO to see if it\'s been spent by another tx. Results show Confirmed, Unconfirmed, Replaced, or Double-Spent status with a visual input flow layout showing source UTXOs. Use Batch mode for bulk checks with CSV export.',
  },
  'btc-fetcher': {
    title: 'BTC Fetcher',
    why: 'Like TX Fetcher but for Bitcoin and Litecoin. Fetches full transaction history for UTXO-based addresses.',
    how: 'Select BTC or LTC, paste one or more addresses (one per line or comma-separated). The tool pages through the full history and returns all tx hashes with direction (incoming/outgoing/both). Filter by direction or search by hash/address. Results include explorer links, block height, and can be copied or downloaded as CSV. Multi-address runs show a per-address breakdown.',
  },
  'csv-builder': {
    title: 'CSV Builder',
    why: 'Lets you quickly build CSV files that are ready to copy-paste into ops-client without manual formatting.',
    how: 'Add columns and configure each with either a static value (same for every row) or line-based values (one value per line in a textarea). The tool generates properly escaped CSV with an optional header row. Preview the output, then copy to clipboard or download as a .csv file. Add or remove columns as needed.',
  },
  faucet: {
    title: 'Faucet',
    why: 'A testnet faucet for grabbing crypto on supported testnets without hunting down individual chain faucets.',
    how: 'Supports Sepolia (ETH, USDC, LINK), Hoodi (ETH), Bitcoin Testnet (BTC), and Solana Devnet (SOL). Enter your wallet address on the appropriate card and hit Send. Rate limited to 1 request per asset per IP per 24 hours.',
  },
  'webhook-tester': {
    title: 'Webhook Tester',
    why: 'A webhooks.site clone where you can generate URLs and test webhooks. Great for comparing v1 and v2 webhook payloads side by side.',
    how: 'Generate a webhook URL (optionally with an HMAC secret for Fireblocks v1 webhook signing). Point any service at the URL and incoming requests appear in real time via WebSocket. Expand any event to see method, headers, query params, and pretty-printed body. Create multiple URLs to compare different webhook configurations simultaneously.',
  },
  'callback-handler': {
    title: 'Callback Handler',
    why: 'A hosted Fireblocks-compatible callback handler for your API Co-Signer. Every transaction signing request hits this handler before the Co-Signer auto-signs, giving you full visibility into what is being approved or rejected — and real policy control over it.',
    how: 'Paste your Co-Signer\'s RSA public key (PEM format) to create a handler. You\'ll receive a Callback URL and a Handler Public Key to paste into your Co-Signer configuration. Once wired up, incoming signing requests stream in real time via WebSocket. Expand any event to inspect the full decoded JWT payload, the raw request and response, and the action taken. Use Policy Rules to build conditional APPROVE/REJECT logic based on operation type, asset, amount, source/dest account, or destination address. Each rule is evaluated in priority order — the first match wins. The default action applies when no rule matches. Enable ExternalTxId Verification in any rule to require that the transaction\'s externalTxId was cryptographically signed by your TxId Generator key — if the signature is missing or invalid the rule will not match.',
  },
  'tx-id-generator': {
    title: 'TxId Generator',
    why: 'Gives you a way to prove that a Fireblocks transaction was initiated by you and not by an attacker who compromised your API key. Every externalTxId you generate is cryptographically signed with a secret key that lives only on the server — an attacker with your API key alone cannot forge a valid ID.',
    how: 'On first load a secret HMAC-SHA256 key is generated server-side and tied to your session. Your Secret Key is displayed at the top — copy it and paste it into a Callback Handler policy rule to enable verification. Hit Generate to produce a single signed externalTxId (format: base64url(random 16 bytes) + "." + base64url(HMAC-SHA256 signature), ~65 chars total, well under Fireblocks\' 255-char limit). Use Batch Generate to produce up to 100 IDs at once for pre-populating transaction queues. Session History tracks everything generated this visit. Use Rotate Keys to replace the key pair — note that any IDs signed with the old key will no longer verify.',
  },
  'easy-cosigner': {
    title: 'Easy Cosigner',
    why: 'A ready-to-go cosigner setup tool. Just paste your pairing token and you\'ll have a cosigner paired. Ideal for crypto journey testing.',
    how: 'Copy the pairing token from the Fireblocks console workspace settings, paste it here, and submit. The cosigner agent picks it up automatically — approval notifications will appear in the workspace owner\'s mobile app within 30-120 seconds. Optionally configure a callback handler URL and public key in Advanced Options. Submission history tracks the status of each pairing.',
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
