// The terminal view. A summary, not a dump: a person opening this wants to know what the project
// is, what is deployed, what is worth worrying about, and what the team has said — in that order.
// Everything else is one line at the bottom pointing at the full map.
//
// Layout rules that keep it readable:
//   · columns are aligned from the data, always separated by a real gap
//   · long text wraps under the column it started in; nothing is truncated into an ellipsis
//   · a section only appears when it has content, and a node appears in exactly one section
//   · peer attribution shows up where it carries meaning (notes), not on every row

const WIDTH = 88
const INDENT = '  '
const GAP = 2

const ESC = String.fromCharCode(27)
const ANSI = new RegExp(ESC + '\\[[0-9;]*m', 'g')

const CODES = {
  bold: [ESC + '[1m', ESC + '[22m'],
  dim: [ESC + '[2m', ESC + '[22m'],
  red: [ESC + '[31m', ESC + '[39m'],
  yellow: [ESC + '[33m', ESC + '[39m'],
  cyan: [ESC + '[36m', ESC + '[39m'],
  green: [ESC + '[32m', ESC + '[39m']
}

function painter(color) {
  const out = {}
  for (const [name, [open, close]] of Object.entries(CODES)) {
    out[name] = color ? (text) => open + text + close : (text) => String(text)
  }
  return out
}

/** Visible length: ANSI escapes take no columns. */
function width(text) {
  return String(text).replace(ANSI, '').length
}

function pad(text, to) {
  const gap = to - width(text)
  return gap > 0 ? text + ' '.repeat(gap) : text
}

/** Wrap plain text to `max` columns. */
function wrap(text, max) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line)
      line = word
    } else {
      line = line ? line + ' ' + word : word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Longest visible label in a set, capped so one outlier cannot push every column right. */
function columnWidth(items, get, cap) {
  const longest = items.reduce((max, item) => Math.max(max, width(get(item))), 0)
  return Math.min(cap, longest) + GAP
}

function clip(text, max) {
  const plain = String(text)
  return plain.length > max ? plain.slice(0, max - 1) + '…' : plain
}

function bySeverity(a, b) {
  const rank = { critical: 0, warn: 1, info: 2 }
  return (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2)
}

function byLabel(a, b) {
  return String(a.label || a.id).localeCompare(String(b.label || b.id))
}

/**
 * Deployment summaries carry the full contract address and often a whole sentence. This section
 * wants a state, not an essay.
 */
function deploymentState(node) {
  const summary = String(node.summary || '')
  if (/out of sync/i.test(summary)) return { text: 'out of sync with local source', tone: 'warn' }
  if (/in sync/i.test(summary)) return { text: 'in sync', tone: 'ok' }
  if (/external/i.test(summary)) return { text: 'external dependency', tone: 'ok' }
  const withoutAddress = summary.replace(/`?C[A-Z0-9]{20,}`?/g, '').replace(/Live at\s*/i, '')
  const firstSentence = withoutAddress.split(/[.—]/)[0].trim()
  return { text: firstSentence || 'deployed', tone: node.severity === 'critical' ? 'bad' : 'ok' }
}

/** A task's label is the thing to do; its summary says where it lives. */
function taskWhere(node) {
  return String(node.summary || '')
    .replace(/^Open,\s*from\s*/i, '')
    .replace(/^(TODO|FIXME|CHECKLIST)\s*(in)?\s*/i, '')
    .replace(/`/g, '')
    .trim()
}

function taskLabel(node) {
  return String(node.label || node.id)
    .replace(/^□\s*/, '')
    .replace(/(TODO|FIXME|CHECKLIST)\s*$/i, '')
    .trim()
}

/**
 * @param {{ meta: object, nodes: Array, edges: Array, info: object }} snapshot
 * @param {{ color?: boolean, width?: number }} [opts]
 * @returns {string}
 */
function formatProject(snapshot, opts = {}) {
  const c = painter(opts.color !== false)
  const cols = opts.width || WIDTH
  const { meta = {}, nodes = [], edges = [], info = {} } = snapshot
  const out = []

  const of = (type) => nodes.filter((n) => n.type === type)
  const contracts = of('contract').sort(byLabel)
  const deployments = of('deployment').sort(byLabel)
  const notes = of('note').sort(bySeverity)
  const tasks = of('task').sort(byLabel)
  // deployments and tasks have their own sections; a node belongs in exactly one place
  const flagged = nodes
    .filter((n) => n.severity === 'critical' || n.severity === 'warn')
    .filter((n) => n.type !== 'task' && n.type !== 'deployment')
    .sort(bySeverity)

  // ---------------------------------------------------------------- header
  out.push('')
  out.push(c.bold(meta.project || 'untitled project'))
  if (meta.description) for (const line of wrap(meta.description, cols)) out.push(c.dim(line))

  const facts = [
    nodes.length + ' node' + (nodes.length === 1 ? '' : 's'),
    edges.length + ' edge' + (edges.length === 1 ? '' : 's')
  ]
  if (info.peers !== undefined) facts.push(info.peers + ' peer' + (info.peers === 1 ? '' : 's'))
  if (info.writable !== undefined) facts.push(info.writable ? 'writer' : 'read-only')
  if (info.source === 'local') facts.push('local vault')
  out.push(c.dim(facts.join('  ·  ')))
  if (info.id) out.push(c.dim(info.id))

  // ---------------------------------------------------------------- contracts
  if (contracts.length) {
    const nameCol = columnWidth(contracts, (n) => clip(n.label || n.id, 24), 24)
    out.push('')
    out.push(c.bold('Contracts'))
    for (const node of contracts) {
      const data = node.data || {}
      const fns = typeof data.functions === 'number' ? data.functions + ' fn' : ''
      const where = data.network ? String(data.network) : data.external ? 'external' : ''
      const flag = data.drift ? c.yellow('drift') : ''
      const line =
        INDENT +
        pad(c.cyan(clip(node.label || node.id, 24)), nameCol) +
        pad(c.dim(fns), 7) +
        pad(c.dim(where), 11) +
        flag
      out.push(line.replace(/\s+$/, ''))
    }
  }

  // ---------------------------------------------------------------- on-chain
  if (deployments.length) {
    const nameCol = columnWidth(deployments, (n) => clip(n.label || n.id, 28), 28)
    out.push('')
    out.push(c.bold('On-chain'))
    for (const node of deployments) {
      const state = deploymentState(node)
      const tint = state.tone === 'warn' ? c.yellow : state.tone === 'bad' ? c.red : c.dim
      out.push(
        INDENT +
          pad(clip(node.label || node.id, 28), nameCol) +
          tint(clip(state.text, cols - nameCol - 4))
      )
    }
  }

  // ---------------------------------------------------------------- signals
  if (flagged.length) {
    out.push('')
    out.push(c.bold('Worth knowing'))
    for (const node of flagged) {
      const mark = node.severity === 'critical' ? c.red('!!') : c.yellow(' !')
      out.push(INDENT + mark + '  ' + c.bold(node.label || node.id))
      for (const line of wrap(node.summary || '', cols - 7)) out.push(INDENT + '    ' + c.dim(line))
    }
  }

  // ---------------------------------------------------------------- notes
  if (notes.length) {
    out.push('')
    out.push(c.bold('Notes') + c.dim('    written by people, never overwritten by a scan'))
    for (const node of notes) {
      const title = c.green(clip(node.label || node.id, 58))
      const who = node.by ? c.dim(String(node.by)) : ''
      out.push(INDENT + (who ? pad(title, 60) + who : title))
      if (node.summary && node.summary !== node.label) {
        for (const line of wrap(node.summary, cols - 6)) out.push(INDENT + '    ' + c.dim(line))
      }
    }
  }

  // ---------------------------------------------------------------- tasks
  if (tasks.length) {
    const labelCol = columnWidth(tasks, (n) => clip(taskLabel(n), 50), 50)
    out.push('')
    out.push(c.bold('Open tasks'))
    for (const node of tasks) {
      const line =
        INDENT + c.dim('□ ') + pad(clip(taskLabel(node), 50), labelCol) + c.dim(taskWhere(node))
      out.push(line.replace(/\s+$/, ''))
    }
  }

  // ---------------------------------------------------------------- the rest
  const PLURAL = {
    function: 'functions',
    storage: 'storage keys',
    event: 'events',
    error: 'errors'
  }
  const rest = Object.keys(PLURAL)
    .map((type) => ({ type, count: of(type).length }))
    .filter((x) => x.count)
    .map((x) => x.count + ' ' + (x.count === 1 ? x.type : PLURAL[x.type]))
  if (rest.length) {
    out.push('')
    out.push(c.dim(INDENT + rest.join('  ·  ')))
    out.push(c.dim(INDENT + 'swarm-memory graph --html map.html   for the whole picture'))
  }

  out.push('')
  return out.join('\n')
}

/** The one-line footer the live view puts under the project. */
function formatLiveFooter(store, opts = {}) {
  const c = painter(opts.color !== false)
  const peers = store.peers
  return (
    INDENT +
    c.dim('live') +
    c.dim('  ·  ') +
    c.bold(String(peers)) +
    c.dim(' peer' + (peers === 1 ? '' : 's') + ' connected  ·  Ctrl+C to stop')
  )
}

/** What a fresh install sees before anything has been loaded. */
function formatEmpty(id, opts = {}) {
  const c = painter(opts.color !== false)
  return [
    '',
    c.bold('SwarmMemory'),
    c.dim('nothing loaded yet' + (id ? '  ·  ' + id : '')),
    '',
    INDENT + 'Load the bundled demo project',
    INDENT + '  ' + c.cyan('swarm-memory publish --demo'),
    '',
    INDENT + 'Read a project you have scanned',
    INDENT + '  ' + c.cyan('swarm-memory publish --vault .stellar-memory'),
    '',
    INDENT + 'Or join a teammate',
    INDENT + '  ' + c.cyan('swarm-memory join <invite-code>'),
    ''
  ].join('\n')
}

module.exports = {
  formatProject,
  formatLiveFooter,
  formatEmpty,
  deploymentState,
  taskLabel,
  taskWhere,
  wrap,
  pad,
  width,
  clip
}
