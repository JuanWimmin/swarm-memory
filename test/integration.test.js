// End-to-end tests for the CLI command layer (src/sync/commands.js).
//
// Bare only: commands.js reads/writes files through bare-fs. The commands are called as
// functions, never spawned as processes — Bare has no child_process here.
//
// Nothing may touch the public DHT. commands.* build their own Hyperswarm and take no
// bootstrap option, so we point hyperdht's default bootstrap list at a local testnet for the
// duration of each test and put it back afterwards.

const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const DHT = require('hyperdht')
const fs = require('bare-fs')
const path = require('bare-path')

const commands = require('../src/sync/commands.js')
const { openStore } = require('../src/sync')

const ROOT = 'test/.tmp/cli-' + Date.now()
const SHARED = ROOT + '/project' // published once, reopened by resume/graph
let counter = 0

function dir(tag) {
  return ROOT + '/' + tag + '-' + ++counter
}

function waitFor(fn, ms = 30000, step = 100) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        if (await fn()) return resolve()
      } catch (err) {
        return reject(err)
      }
      if (Date.now() - start > ms) return reject(new Error('timeout waiting for condition'))
      setTimeout(tick, step)
    }
    tick()
  })
}

/** Spin up a local DHT and make it the default one, so no command reaches the internet. */
async function localTestnet(t) {
  const testnet = await createTestnet(3, t.teardown)
  const saved = DHT.BOOTSTRAP.slice()
  DHT.BOOTSTRAP.length = 0
  for (const node of testnet.bootstrap) DHT.BOOTSTRAP.push(node)
  t.teardown(() => {
    DHT.BOOTSTRAP.length = 0
    for (const node of saved) DHT.BOOTSTRAP.push(node)
  })
  return testnet
}

/** Run a command and collect what it printed, so the suite output stays readable. */
async function run(fn) {
  const lines = []
  const original = console.log
  console.log = (...args) => lines.push(args.map(String).join(' '))
  try {
    const store = await fn()
    return { store, out: lines.join('\n') }
  } finally {
    console.log = original
  }
}

function readText(file) {
  const raw = fs.readFileSync(file, 'utf8')
  return typeof raw === 'string' ? raw : raw.toString('utf8')
}

/** Publish the bundled demo dataset into SHARED and leave the store closed. */
async function publishDemo(t) {
  const { store, out } = await run(() =>
    commands.publish({ dir: SHARED, name: 'alice', demo: true })
  )
  t.teardown(() => store.close())
  await waitFor(async () => (await store.nodes()).length === 23)
  const snapshot = {
    nodes: await store.nodes(),
    edges: await store.edges(),
    meta: await store.meta(),
    id: store.id
  }
  await store.close()
  return { out, ...snapshot }
}

test('publish --demo loads the bundled dataset into the swarm store', async (t) => {
  await localTestnet(t)

  const { out, nodes, edges, meta, id } = await publishDemo(t)

  t.is(nodes.length, 23, '23 nodes')
  t.is(edges.length, 25, '25 edges')
  t.is(meta.project, 'private-payroll', 'project name replicated into the view')
  t.ok(out.includes('published'), 'the command reports what it did')
  t.ok(out.includes(id), 'and prints the store id to share')

  t.ok(
    nodes.every((n) => typeof n.id === 'string' && n.id.indexOf('!') === -1 && n.type),
    'every node satisfies the key contract'
  )
  t.ok(
    edges.every((e) => e.from && e.to && e.type),
    'every edge kept its ends'
  )

  const note = nodes.find((n) => n.type === 'note')
  t.ok(note, 'the demo carries human notes')
  t.is(note.source, 'human', 'notes are written as human ops, so a rescan cannot clobber them')
})

test('resume renders the project without throwing', async (t) => {
  await localTestnet(t)

  const { store, out } = await run(() => commands.resume({ dir: SHARED, name: 'alice' }))
  t.teardown(() => store.close())

  t.ok(out.includes('private-payroll'), 'project name leads')
  t.ok(out.includes('23 nodes'), 'node count')
  t.ok(out.includes('25 edges'), 'edge count')
  t.ok(out.includes('Contracts'), 'contracts get a section')
  t.ok(out.includes('On-chain'), 'deployments get a section')
  t.ok(out.includes('Worth knowing'), 'flagged nodes get their own section')
  t.ok(out.includes('!!'), 'critical severity marker')
  t.ok(out.includes('Notes'), 'human notes get a section of their own')
  t.ok(out.includes('Open tasks'), 'tasks get a section')
  // a deployment belongs to On-chain, never repeated under Worth knowing
  const worth = out.slice(out.indexOf('Worth knowing'), out.indexOf('Notes'))
  t.absent(worth.includes('@ testnet'), 'a node appears in exactly one section')
  t.absent(out.includes('storages'), 'counts read like English')

  await store.close()
})

test('graph prints a document that matches the frozen graph.json contract', async (t) => {
  await localTestnet(t)

  const { store, out } = await run(() => commands.graph({ dir: SHARED, name: 'alice' }))
  t.teardown(() => store.close())

  const doc = JSON.parse(out)

  t.is(doc.meta.project, 'private-payroll')
  t.is(doc.meta.source, 'swarm')
  t.ok(typeof doc.meta.peers === 'number', 'meta.peers is a number')
  t.ok(
    typeof doc.meta.generatedAt === 'string' && !Number.isNaN(Date.parse(doc.meta.generatedAt)),
    'meta.generatedAt is an ISO timestamp'
  )

  t.is(doc.nodes.length, 23)
  t.is(doc.edges.length, 25)

  const ids = new Set(doc.nodes.map((n) => n.id))
  for (const node of doc.nodes) {
    t.is(
      Object.keys(node).sort().join(','),
      'data,id,label,severity,summary,type',
      'node exposes exactly the contract fields'
    )
    t.ok(typeof node.id === 'string' && node.id.length > 0)
    t.ok(typeof node.type === 'string' && node.type.length > 0)
    t.ok(typeof node.label === 'string' && node.label.length > 0)
    t.ok(typeof node.summary === 'string')
    t.ok(['info', 'warn', 'critical'].includes(node.severity), node.severity)
    t.ok(node.data !== null && typeof node.data === 'object')
  }

  for (const edge of doc.edges) {
    t.is(Object.keys(edge).sort().join(','), 'from,to,type', 'edge exposes exactly from/to/type')
    t.ok(ids.has(edge.from), 'edge.from resolves: ' + edge.from)
    t.ok(ids.has(edge.to), 'edge.to resolves: ' + edge.to)
    t.ok(typeof edge.type === 'string' && edge.type.length > 0)
  }

  await store.close()
})

test('graph --html and --json write an offline viewer and a portable export', async (t) => {
  await localTestnet(t)

  const out = dir('export')
  fs.mkdirSync(out, { recursive: true })
  const htmlPath = path.join(out, 'graph.html')
  const jsonPath = path.join(out, 'graph.json')

  const { store } = await run(() =>
    commands.graph({ dir: SHARED, name: 'alice', html: htmlPath, json: jsonPath })
  )
  t.teardown(() => store.close())

  const html = readText(htmlPath)
  t.absent(html.includes('/*__GRAPH_DATA__*/'), 'the placeholder was substituted')
  t.ok(html.includes('const GRAPH = '), 'the viewer still declares GRAPH')
  t.absent(/https?:\/\//.test(html), 'no remote resources — the viewer must open offline')

  const start = html.indexOf('const GRAPH = ') + 'const GRAPH = '.length
  const eol = html.indexOf('\n', start)
  const embedded = JSON.parse(
    html
      .slice(start, eol === -1 ? html.length : eol)
      .trim()
      .replace(/;$/, '')
  )
  t.is(embedded.nodes.length, 23, 'the whole graph is inlined')
  t.is(embedded.edges.length, 25)
  t.is(embedded.meta.project, 'private-payroll')

  const exported = JSON.parse(readText(jsonPath))
  t.is(exported.nodes.length, 23, '--json exports the same graph')
  t.is(exported.edges.length, 25)
  t.alike(
    exported.nodes.map((n) => n.id).sort(),
    embedded.nodes.map((n) => n.id).sort(),
    'both exports agree'
  )

  await store.close()
})

test('two peers: A publishes and invites, B joins and sees the same graph', async (t) => {
  const testnet = await localTestnet(t)

  const dirA = dir('peer-a')
  const dirB = dir('peer-b')

  const { store: alice } = await run(() =>
    commands.publish({ dir: dirA, name: 'alice', demo: true })
  )
  t.teardown(() => alice.close())
  await waitFor(async () => (await alice.nodes()).length === 23)

  const code = await alice.createInvite()
  t.ok(typeof code === 'string' && code.length > 50, 'invite is a z32 code')

  const bob = await openStore(dirB, {
    invite: code,
    name: 'bob',
    bootstrap: testnet.bootstrap,
    timeout: 60000
  })
  t.teardown(() => bob.close())

  t.is(bob.id, alice.id, 'same store')
  t.ok(bob.writable, 'the joiner became a writer')

  await waitFor(async () => (await bob.nodes()).length === 23)
  const mine = (await alice.nodes()).map((n) => n.id).sort()
  const theirs = (await bob.nodes()).map((n) => n.id).sort()
  t.alike(theirs, mine, 'both peers see the same nodes')
  t.is((await bob.edges()).length, 25, 'edges replicated too')
  t.is((await bob.meta()).project, 'private-payroll', 'metadata replicated')
  t.ok(alice.peers > 0, 'alice sees the peer she invited')
})

test('note writes a human node that a later scan cannot overwrite', async (t) => {
  await localTestnet(t)
  const storage = dir('note')

  const { store, out } = await run(() =>
    commands.note({
      dir: storage,
      name: 'alice',
      text: 'LastPaid has no extend_ttl - a payment can become unreachable',
      about: 'storage/payroll.lastpaid'
    })
  )
  t.teardown(() => store.close())

  t.ok(out.includes('noted'), 'it says what it did')

  await waitFor(async () => (await store.nodes()).length === 1)
  const [node] = await store.nodes()
  t.is(node.type, 'note', 'stored as a note')
  t.is(node.source, 'human', 'attributed to a human, which is what protects it')
  t.absent(node.id.includes('!'), 'the id cannot contain the Hyperbee separator')
  t.ok(node.summary.startsWith('LastPaid has no extend_ttl'), 'keeps the full text')
  t.ok(node.label.length <= 48, 'label is a short form of it')

  const edges = await store.edges()
  t.is(edges.length, 1, '--about linked it')
  t.is(edges[0].to, 'storage/payroll.lastpaid', 'to the node it is about')
  t.is(edges[0].type, 'notes', 'with a notes edge')

  // the whole point: an automatic scan may not argue with a person
  await store.putNode(
    { id: node.id, type: 'note', label: 'rewritten by a scanner', summary: 'scan output' },
    { source: 'scan', at: 9999 }
  )
  await waitFor(async () => (await store.nodes()).some((n) => n.id === node.id), 200).catch(
    () => {}
  )
  const after = (await store.nodes()).find((n) => n.id === node.id)
  t.ok(after.summary.startsWith('LastPaid has no extend_ttl'), 'the scan did not overwrite it')

  await t.exception(
    () => commands.note({ dir: dir('note-empty'), name: 'alice', text: '   ' }),
    /nothing to note/,
    'an empty note is refused'
  )
})

test('the live view repaints when a peer writes', async (t) => {
  const testnet = await localTestnet(t)
  const dirA = dir('watch-a')
  const dirB = dir('watch-b')

  // One store per directory: Corestore takes an exclusive lock, so the watcher itself is
  // peer A — we write through the store it returns instead of opening a second one.
  const painted = []
  const original = console.log
  console.log = (...args) => painted.push(args.map(String).join(' '))
  let watcher
  try {
    watcher = await commands.watch({ dir: dirA, name: 'alice' })
    await watcher.putMeta('project', 'private-payroll')
    await watcher.putNode({
      id: 'contract/payroll',
      type: 'contract',
      label: 'Payroll',
      summary: 'pays employees out of Treasury'
    })
    await waitFor(() => painted.join('\n').includes('private-payroll'), 30000)
  } finally {
    console.log = original
  }
  t.teardown(() => watcher.close())

  const firstPaint = painted.join('\n')
  t.ok(firstPaint.includes('private-payroll'), 'the view shows the project')
  t.ok(firstPaint.includes('live'), 'and carries a live footer')

  const code = await watcher.createInvite()
  const before = painted.length

  console.log = (...args) => painted.push(args.map(String).join(' '))
  let bob
  try {
    bob = await openStore(dirB, {
      invite: code,
      name: 'bob',
      bootstrap: testnet.bootstrap,
      timeout: 60000
    })
    await bob.putNode(
      {
        id: 'note/from-bob',
        type: 'note',
        label: 'from bob',
        summary: 'written on the other peer'
      },
      { source: 'human' }
    )
    await waitFor(() => painted.slice(before).join('\n').includes('from bob'), 30000)
  } finally {
    console.log = original
  }
  t.teardown(() => bob.close())

  t.ok(painted.length > before, "a teammate's write repainted the view")
  t.ok(
    painted.slice(before).join('\n').includes('from bob'),
    'and the repaint carries their note — nothing was refreshed by hand'
  )
})
