// B1's integration layer: the CLI commands that talk to the swarm.
//
// Deliberately self-contained inside src/sync so it can be swapped for B2's richer
// src/commands + src/render without touching bin.mjs's wiring.

const fs = require('bare-fs')
const path = require('bare-path')
const c = require('./colors.js')

const { openStore } = require('./index.js')
const { loadVault } = require('../vault/index.js')
const view = require('../render/resume.js')
const demoGraph = require('../../demo/graph.json')
const bundledTemplate = require('../../web/template.generated.js')

/** Kept as the module's rendering entry point; the layout lives in src/render/resume.js. */
function renderResume(meta, nodes, edges, info) {
  return view.formatProject({ meta, nodes, edges, info })
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
    console.log(view.formatEmpty(store.id))
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
/**
 * Paint the project and keep repainting as peers write. This is the view a shared document
 * cannot give you: a teammate's note lands here with nothing to refresh.
 *
 * @param {object} store an open SwarmStore
 * @param {object} [opts] { invite } — keep an invite code pinned above the view
 */
async function liveView(store, opts = {}) {
  let timer = null
  let last = ''

  const paint = async () => {
    timer = null
    const snap = await snapshot(store)
    const body =
      snap.nodes.length === 0
        ? view.formatEmpty(store.id)
        : renderResume(snap.meta, snap.nodes, snap.edges, snap.info)
    const footer = view.formatLiveFooter(store)
    const frame = body + '\n' + footer
    if (frame === last) return
    last = frame

    console.log('\u001b[2J\u001b[H') // clear, home
    if (opts.invite) {
      console.log('  ' + c.bold('Invite code') + c.dim(' (single use) — your teammate runs:'))
      console.log('    ' + c.cyan('swarm-memory join ' + opts.invite))
    }
    console.log(frame)
  }

  await paint()
  store.watch(() => {
    if (timer) return
    timer = setTimeout(() => paint().catch(() => {}), 250)
  })
}

async function watch({ dir, name }) {
  const store = await openStore(dir, { name })
  await liveView(store)
  return store
}

/** Read a scanned vault straight from disk — no swarm, nothing published. */
async function inspect({ vault }) {
  const source = await loadVault(vault)
  const [meta, nodes, edges] = await Promise.all([source.meta(), source.nodes(), source.edges()])
  console.log(view.formatProject({ meta, nodes, edges, info: { source: 'local' } }))
  return null
}

/**
 * Load a project into the swarm: the bundled demo, a scanned .stellar-memory vault, or a
 * graph.json export. A vault is the interesting one — it is a real scan of real contracts.
 */
async function publish({ dir, name, file, demo, vault }) {
  const store = await openStore(dir, { name })

  let raw
  if (vault) {
    const source = await loadVault(vault)
    raw = { meta: await source.meta(), nodes: await source.nodes(), edges: await source.edges() }
  } else if (demo) {
    raw = demoGraph
  } else {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  }

  const nodes = raw.nodes || []
  const edges = raw.edges || []

  if (raw.meta && raw.meta.project) await store.putMeta('project', raw.meta.project)
  if (raw.meta && raw.meta.description) await store.putMeta('description', raw.meta.description)
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

  // The code has to survive the repaints, so it is pinned above the live view. Pairing only
  // happens while this process is online, which is why the command does not exit.
  await liveView(store, { invite: code })
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
  inspect,
  watch,
  note,
  publish,
  invite,
  join,
  peers,
  graph,
  renderResume,
  graphJSON,
  liveView,
  slugify
}
