// B1's integration layer: the CLI commands that talk to the swarm.
//
// Deliberately self-contained inside src/sync so it can be swapped for B2's richer
// src/commands + src/render without touching bin.mjs's wiring.

const fs = require('bare-fs')
const path = require('bare-path')
const c = require('./colors.js')

const { openStore } = require('./index.js')
const demoGraph = require('../../demo/graph.json')
const bundledTemplate = require('../../web/template.generated.js')

const TYPE_COLOR = {
  contract: c.cyan,
  function: c.blue,
  storage: c.magenta,
  event: c.green,
  error: c.red,
  deployment: c.yellow,
  note: c.white,
  task: c.yellow
}

const SEVERITY_MARK = {
  critical: c.red('!!'),
  warn: c.yellow(' !'),
  info: c.dim('  ')
}

function paint(type, text) {
  const fn = TYPE_COLOR[type] || c.white
  return fn(text)
}

function line(char = '─', width = 62) {
  return c.dim(char.repeat(width))
}

/** Render the project's context: the star view of the CLI. */
function renderResume(meta, nodes, edges, info) {
  const out = []
  const project = meta.project || '(unnamed project)'

  out.push('')
  out.push('  ' + c.bold(c.green('🍐 SwarmMemory')) + c.dim(' · ') + c.bold(project))
  out.push(
    '  ' +
      c.dim(
        `${nodes.length} nodes · ${edges.length} edges · ${info.peers} peer${info.peers === 1 ? '' : 's'} connected · ${info.writable ? 'writer' : 'read-only'}`
      )
  )
  out.push('  ' + c.dim(info.id || ''))
  out.push('  ' + line())

  const byType = new Map()
  for (const node of nodes) {
    if (!byType.has(node.type)) byType.set(node.type, [])
    byType.get(node.type).push(node)
  }

  const order = ['contract', 'function', 'storage', 'event', 'error', 'deployment', 'task', 'note']
  const types = [...byType.keys()].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  for (const type of types) {
    const list = byType.get(type)
    out.push('')
    out.push('  ' + paint(type, c.bold(type)) + c.dim(` (${list.length})`))
    for (const node of list.slice(0, 12)) {
      const mark = SEVERITY_MARK[node.severity] || SEVERITY_MARK.info
      const label = node.label || node.id
      out.push('   ' + mark + ' ' + paint(type, label) + (node.by ? c.dim(' · ' + node.by) : ''))
      if (node.summary) out.push('        ' + c.dim(truncate(node.summary, 68)))
    }
    if (list.length > 12) out.push(c.dim(`        … ${list.length - 12} more`))
  }

  const flagged = nodes.filter((n) => n.severity === 'critical' || n.severity === 'warn')
  if (flagged.length) {
    out.push('')
    out.push('  ' + c.bold('needs attention'))
    for (const node of flagged) {
      const mark = SEVERITY_MARK[node.severity]
      out.push(
        '   ' +
          mark +
          ' ' +
          (node.label || node.id) +
          c.dim(' — ' + truncate(node.summary || '', 54))
      )
    }
  }

  out.push('')
  return out.join('\n')
}

/** Node ids may not contain '!' (the Hyperbee key separator) — keep them boring. */
function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'note'
}

function truncate(text, max) {
  const s = String(text).replace(/\s+/g, ' ')
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function graphJSON(meta, nodes, edges, info) {
  return {
    meta: {
      project: meta.project || 'unknown',
      generatedAt: new Date().toISOString(),
      source: 'swarm',
      peers: info.peers
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label || n.id,
      summary: n.summary || '',
      severity: n.severity || 'info',
      data: n.data || {}
    })),
    edges: edges.map((e) => ({ from: e.from, to: e.to, type: e.type }))
  }
}

async function snapshot(store) {
  const [meta, nodes, edges] = await Promise.all([store.meta(), store.nodes(), store.edges()])
  return {
    meta,
    nodes,
    edges,
    info: { peers: store.peers, writable: store.writable, id: store.id }
  }
}

// ---------------------------------------------------------------- commands

async function resume({ dir, name }) {
  const store = await openStore(dir, { name })
  const snap = await snapshot(store)
  if (snap.nodes.length === 0) {
    console.log('')
    console.log('  ' + c.bold(c.green('🍐 SwarmMemory')) + c.dim(' · empty store'))
    console.log('  ' + c.dim(store.id))
    console.log('')
    console.log('  Nothing here yet. Load the demo project:')
    console.log('    ' + c.cyan('swarm-memory publish --demo'))
    console.log('  or import your own export:')
    console.log('    ' + c.cyan('swarm-memory publish --graph graph.json'))
    console.log('  or join a teammate:')
    console.log('    ' + c.cyan('swarm-memory join <invite-code>'))
    console.log('')
  } else {
    console.log(renderResume(snap.meta, snap.nodes, snap.edges, snap.info))
  }
  return store
}

/**
 * Write a human note into the graph. Notes are the one thing an automatic scan may never
 * overwrite (see apply.js), which is what makes them worth writing down.
 */
async function note({ dir, name, text, about }) {
  if (!text || !String(text).trim()) throw new Error('nothing to note — pass some text')
  const store = await openStore(dir, { name })
  const at = store.tick()
  const id = 'note/' + slugify(text) + '-' + at

  await store.putNode(
    {
      id,
      type: 'note',
      label: truncate(text, 48),
      summary: String(text).trim(),
      severity: 'info'
    },
    { source: 'human', at }
  )

  if (about) await store.putEdge({ from: id, to: about, type: 'notes' }, { source: 'human' })

  console.log(c.green('noted ') + c.dim(id) + (about ? c.dim(' → ' + about) : ''))
  return store
}

/**
 * Render the project and keep re-rendering as peers write. This is the view that a shared
 * document cannot give you: a teammate's note appears here without anyone refreshing anything.
 */
async function watch({ dir, name }) {
  const store = await openStore(dir, { name })
  let timer = null
  let last = ''

  const paint = async () => {
    timer = null
    const snap = await snapshot(store)
    const body =
      snap.nodes.length === 0
        ? '\n  ' + c.bold(c.green('🍐 SwarmMemory')) + c.dim(' · waiting for the swarm…')
        : renderResume(snap.meta, snap.nodes, snap.edges, snap.info)
    if (body === last) return
    last = body
    console.log('\u001b[2J\u001b[H') // clear, home
    console.log(body)
    console.log(
      '  ' +
        c.dim('live · ') +
        c.bold(String(store.peers)) +
        c.dim(' peer' + (store.peers === 1 ? '' : 's') + ' · Ctrl+C to stop')
    )
  }

  await paint()
  store.watch(() => {
    if (timer) return
    timer = setTimeout(() => paint().catch(() => {}), 250)
  })

  return store
}

async function publish({ dir, name, file, demo }) {
  const store = await openStore(dir, { name })
  const raw = demo ? demoGraph : JSON.parse(fs.readFileSync(file, 'utf8'))
  const nodes = raw.nodes || []
  const edges = raw.edges || []

  if (raw.meta && raw.meta.project) await store.putMeta('project', raw.meta.project)
  for (const node of nodes) {
    await store.putNode(node, { source: node.type === 'note' ? 'human' : 'scan' })
  }
  for (const edge of edges) await store.putEdge(edge)

  console.log(
    c.green('published') +
      c.dim(` ${nodes.length} nodes, ${edges.length} edges into `) +
      (store.id || '')
  )
  return store
}

async function invite({ dir, name }) {
  const store = await openStore(dir, { name })
  const code = await store.createInvite()
  console.log('')
  console.log('  ' + c.bold('Invite code') + c.dim(' (single use)'))
  console.log('  ' + c.green(code))
  console.log('')
  console.log('  ' + c.dim('Your teammate runs:'))
  console.log('    ' + c.cyan('swarm-memory join ' + code))
  console.log('')
  console.log('  ' + c.dim('Keep this process running until they join — pairing happens live.'))
  return store
}

async function join({ dir, name, code }) {
  console.log(c.dim('pairing…'))
  const store = await openStore(dir, { invite: code, name, timeout: 120000 })
  const snap = await snapshot(store)
  console.log(
    c.green('joined ') + c.dim(store.id) + c.dim(` — ${snap.nodes.length} nodes replicated`)
  )
  return store
}

async function peers({ dir, name }) {
  const store = await openStore(dir, { name })
  const snap = await snapshot(store)
  console.log('')
  console.log('  ' + c.bold('swarm') + c.dim(' ' + store.id))
  console.log('  ' + c.dim('peers connected: ') + c.bold(String(store.peers)))
  console.log(
    '  ' + c.dim('this peer:       ') + (store.writable ? c.green('writer') : c.yellow('read-only'))
  )
  console.log(
    '  ' + c.dim('graph:           ') + `${snap.nodes.length} nodes, ${snap.edges.length} edges`
  )
  console.log('')
  return store
}

async function graph({ dir, name, json, html }) {
  const store = await openStore(dir, { name })
  const snap = await snapshot(store)
  const data = graphJSON(snap.meta, snap.nodes, snap.edges, snap.info)

  if (json) {
    fs.writeFileSync(json, JSON.stringify(data, null, 2))
    console.log(c.green('wrote ') + json)
  }

  if (html) {
    // prefer the working copy (so F can iterate without a rebuild), else the bundled one
    const template = findTemplate()
    const raw = template ? fs.readFileSync(template, 'utf8') : bundledTemplate
    const page = raw.replace('/*__GRAPH_DATA__*/', JSON.stringify(data))
    fs.writeFileSync(html, page)
    console.log(c.green('wrote ') + html + (template ? '' : c.dim(' (bundled viewer)')))
  }

  if (!json && !html) console.log(JSON.stringify(data, null, 2))
  return store
}

function findTemplate() {
  const candidates = ['web/template.html', path.join(__dirname, '..', '..', 'web', 'template.html')]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignore
    }
  }
  return null
}

module.exports = {
  resume,
  watch,
  note,
  publish,
  invite,
  join,
  peers,
  graph,
  renderResume,
  graphJSON,
  slugify
}
