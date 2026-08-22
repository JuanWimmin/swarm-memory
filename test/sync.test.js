// src/sync tests — run on Node (`node test/index.js`) and on Bare (`npm test`).
// Uses a local DHT testnet so nothing touches the public network.

const test = require('brittle')
const Corestore = require('corestore')
const createTestnet = require('hyperdht/testnet')

const { SwarmStore, openStore, shouldOverwrite } = require('../src/sync')

const ROOT = 'test/.tmp/sync-' + Date.now()
let counter = 0
function dir() {
  return ROOT + '/peer-' + ++counter
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

test('merge policy: LWW by `at`, human notes survive scans', (t) => {
  t.ok(shouldOverwrite(null, { at: 1, source: 'scan' }), 'first write always applies')
  t.ok(shouldOverwrite({ at: 1, type: 'contract' }, { at: 2, source: 'scan' }), 'newer scan wins')
  t.absent(
    shouldOverwrite({ at: 5, type: 'contract' }, { at: 2, source: 'scan' }),
    'stale scan rejected'
  )
  t.absent(
    shouldOverwrite({ at: 1, type: 'note' }, { at: 99, source: 'scan' }),
    'scan never clobbers a note'
  )
  t.ok(
    shouldOverwrite({ at: 1, type: 'note' }, { at: 2, source: 'human' }),
    'a human may edit a note'
  )
})

test('invalid ids are rejected before they reach the log', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const store = await openStore(dir(), { name: 'alice', bootstrap: testnet.bootstrap })
  t.teardown(() => store.close())

  await t.exception(() => store.putNode({ id: 'has!bang', type: 'contract' }), /invalid node/)
  await t.exception(() => store.putNode({ id: 'no-type' }), /invalid node/)
  await t.exception(() => store.putEdge({ from: 'a', to: 'b!c', type: 'calls' }), /invalid edge/)
  await t.exception(() => store.delNode('bad!id'), /invalid node id/)
})

test('single peer: write, read back through the GraphSource contract', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const store = await openStore(dir(), { name: 'alice', bootstrap: testnet.bootstrap })
  t.teardown(() => store.close())

  t.ok(store.writable, 'creator is a writer')
  t.ok(store.id && store.id.length > 40, 'has a z32 id')

  await store.putMeta('project', 'private-payroll')
  await store.putNode({
    id: 'contract/payroll',
    type: 'contract',
    label: 'Payroll',
    severity: 'info'
  })
  await store.putNode({
    id: 'contract/treasury',
    type: 'contract',
    label: 'Treasury',
    severity: 'info'
  })
  await store.putEdge({ from: 'contract/payroll', to: 'contract/treasury', type: 'calls' })

  await waitFor(async () => (await store.nodes()).length === 2)
  const nodes = await store.nodes()
  const edges = await store.edges()
  const meta = await store.meta()

  t.is(nodes.length, 2, 'two nodes')
  t.is(edges.length, 1, 'one edge')
  t.is(meta.project, 'private-payroll', 'meta round-trips')
  t.is(edges[0].from, 'contract/payroll', 'edge keeps its ends')
  t.ok(typeof nodes[0].at === 'number', 'nodes carry a lamport stamp')

  await store.delNode('contract/treasury')
  await waitFor(async () => (await store.nodes()).length === 1)
  t.is((await store.nodes())[0].id, 'contract/payroll', 'delNode removes the right node')
})

test('two peers: invite, join, replicate, merge policy end to end', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const bootstrap = testnet.bootstrap

  const alice = await openStore(dir(), { name: 'alice', bootstrap })
  t.teardown(() => alice.close())

  await alice.putMeta('project', 'private-payroll')
  await alice.putNode({
    id: 'contract/payroll',
    type: 'contract',
    label: 'Payroll',
    summary: 'scan v1'
  })
  await alice.putNode(
    { id: 'note/ttl', type: 'note', label: 'TTL risk', summary: 'human wrote this' },
    { source: 'human' }
  )

  const code = await alice.createInvite()
  t.ok(typeof code === 'string' && code.length > 50, 'invite is a z32 code')

  const bob = await openStore(dir(), { invite: code, name: 'bob', bootstrap, timeout: 60000 })
  t.teardown(() => bob.close())

  t.ok(bob.writable, 'joiner became a writer')
  t.is(bob.id, alice.id, 'same store')

  await waitFor(async () => (await bob.nodes()).length === 2)
  t.is((await bob.meta()).project, 'private-payroll', 'metadata replicated')

  // bob updates the contract with a newer scan and adds his own note
  await bob.putNode(
    { id: 'contract/payroll', type: 'contract', label: 'Payroll', summary: 'scan v2 from bob' },
    { at: 100 }
  )
  await bob.putNode(
    { id: 'note/bob', type: 'note', label: 'Bob note', summary: 'added live' },
    { source: 'human' }
  )

  await waitFor(async () => (await alice.nodes()).length === 3)
  const payroll = (await alice.nodes()).find((n) => n.id === 'contract/payroll')
  t.is(payroll.summary, 'scan v2 from bob', 'newer write replicated to alice')

  // a scan must not overwrite a human note, and a stale scan must not win
  await bob.putNode(
    { id: 'note/ttl', type: 'note', label: 'TTL risk', summary: 'SCAN OVERWROTE ME' },
    { at: 999, source: 'scan' }
  )
  await bob.putNode(
    { id: 'contract/payroll', type: 'contract', label: 'Payroll', summary: 'stale scan' },
    { at: 5, source: 'scan' }
  )
  await bob.putMeta('peersSeen', 2)
  await waitFor(async () => (await alice.meta()).peersSeen === 2)

  const aliceNodes = await alice.nodes()
  const note = aliceNodes.find((n) => n.id === 'note/ttl')
  const payrollAfter = aliceNodes.find((n) => n.id === 'contract/payroll')
  t.is(note.summary, 'human wrote this', 'human note protected from the scan')
  t.is(payrollAfter.summary, 'scan v2 from bob', 'stale scan rejected')
  t.alike(await bob.nodes(), aliceNodes, 'both peers converge on the same view')
  t.ok(alice.peers > 0, 'alice sees a peer')
})

test('reopen from disk keeps the data, the key and the clock', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const bootstrap = testnet.bootstrap
  const path = dir()

  const first = await openStore(path, { name: 'alice', bootstrap })
  await first.putNode({ id: 'contract/payroll', type: 'contract', label: 'Payroll' })
  await first.putNode({ id: 'note/ttl', type: 'note', label: 'TTL' }, { source: 'human' })
  await waitFor(async () => (await first.nodes()).length === 2)
  const key = first.id
  const clock = first.clock
  await first.close()

  const again = await openStore(path, { name: 'alice', bootstrap })
  t.teardown(() => again.close())

  t.is(again.id, key, 'same base key without passing one')
  t.ok(again.writable, 'still writable')
  t.is((await again.nodes()).length, 2, 'data survived the restart')
  t.ok(again.clock >= clock, 'lamport clock did not go backwards')
})

test('SwarmStore.pair is exposed for the CLI join flow', (t) => {
  t.is(typeof SwarmStore.pair, 'function')
  t.is(typeof SwarmStore.prototype.createInvite, 'function')
  t.is(typeof SwarmStore.prototype.nodes, 'function')
  t.is(typeof SwarmStore.prototype.edges, 'function')
  t.is(typeof SwarmStore.prototype.meta, 'function')
})
