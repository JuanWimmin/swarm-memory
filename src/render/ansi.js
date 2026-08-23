/**
 * Formateo ANSI para TUI (resume). JS puro; códigos nativos de Bare/terminal.
 * `color: false` deja el texto plano (tests / pipe).
 */

const { SEVERITY_RANK } = require('../core/graph.js')

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'

/**
 * @param {boolean} color
 */
function paint(color) {
  const wrap = (code) => (s) => (color ? `${code}${s}${RESET}` : String(s))
  return {
    bold: wrap(BOLD),
    dim: wrap(DIM),
    red: wrap(RED),
    yellow: wrap(YELLOW),
    cyan: wrap(CYAN),
    green: wrap(GREEN)
  }
}

/**
 * Vista resume: header, contratos, señales warn/critical, tareas.
 * @param {object} graph instancia Graph
 * @param {{ color?: boolean }} [opts]
 */
function formatResume(graph, opts = {}) {
  const c = paint(opts.color !== false)
  const meta = graph.meta() || {}
  const counts = graph.counts()
  const lines = []

  lines.push('')
  lines.push(
    c.bold('SwarmMemory') +
      c.dim('  ·  ') +
      c.cyan(meta.project || 'unknown') +
      c.dim('  ·  ') +
      (meta.source || 'local') +
      c.dim('  ·  ') +
      peerLabel(meta.peers)
  )

  const tally = ['contract', 'function', 'storage', 'event', 'error', 'deployment', 'note', 'task']
    .filter((k) => counts[k])
    .map((k) => `${counts[k]} ${k}${counts[k] === 1 ? '' : 's'}`)
    .join('  ·  ')
  if (tally) lines.push(c.dim('  ' + tally))
  lines.push('')

  lines.push(c.bold('Contracts'))
  const contracts = graph.contracts()
  if (contracts.length === 0) {
    lines.push(c.dim('  (none)'))
  } else {
    for (const node of contracts) {
      const bits = [c.bold(node.label)]
      if (node.data?.network) bits.push(c.dim(String(node.data.network)))
      if (node.data?.external) bits.push(c.dim('external'))
      if (node.data?.drift) bits.push(c.yellow('drift'))
      if (typeof node.data?.functions === 'number') {
        bits.push(c.dim(`${node.data.functions} fn`))
      }
      lines.push('  ' + bits.join('  '))
      if (node.summary) lines.push(c.dim('    ' + clip(node.summary, 96)))
    }
  }
  lines.push('')

  lines.push(c.bold('Signals'))
  const signals = graph
    .signals()
    .filter((n) => n.type !== 'task')
    .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0))
  if (signals.length === 0) {
    lines.push(c.green('  none'))
  } else {
    for (const node of signals) {
      lines.push('  ' + badge(c, node.severity) + '  ' + c.bold(node.label))
      if (node.summary) lines.push(c.dim('           ' + clip(node.summary, 88)))
    }
  }
  lines.push('')

  lines.push(c.bold('Tasks'))
  const tasks = graph.tasks()
  if (tasks.length === 0) {
    lines.push(c.dim('  (none)'))
  } else {
    for (const node of tasks) {
      lines.push('  ' + c.yellow('□') + '  ' + node.label)
      if (node.summary) lines.push(c.dim('     ' + clip(node.summary, 92)))
    }
  }
  lines.push('')

  return lines.join('\n')
}

function badge(c, severity) {
  if (severity === 'critical') return c.red('CRITICAL')
  if (severity === 'warn') return c.yellow('WARN    ')
  return c.dim('INFO    ')
}

function peerLabel(peers) {
  const n = typeof peers === 'number' ? peers : 0
  if (n <= 0) return 'local'
  return n === 1 ? '1 peer' : `${n} peers`
}

function clip(text, max) {
  const one = String(text).replace(/\s+/g, ' ').trim()
  if (one.length <= max) return one
  return one.slice(0, max - 1) + '…'
}

module.exports = { paint, formatResume }
