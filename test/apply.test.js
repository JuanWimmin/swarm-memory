// Unit tests for the Autobase merge policy (src/sync/apply.js).
//
// apply() is the only place the shared view is mutated, and Autobase replays it every time the
// linearized order changes — so it has to be deterministic and total (never throw, whatever a
// peer appends). These tests drive it against a Map-backed fake view and a fake host: no
// network, no disk, so the suite runs on Node and on Bare in milliseconds.

const test = require('brittle')
const b4a = require('b4a')

const {
  apply,
  shouldOverwrite,
  validId,
  validNode,
  validEdge,
  nodeKey,
  edgeKey,
  rangeEnd
} = require('../src/sync/apply.js')

const PEER_A = 'aa'.repeat(32) // a 64-hex-char writer key
const PEER_B = 'bb'.repeat(32)

/** Minimal stand-in for the Hyperbee view: apply() may only get/put/del. */
function fakeView() {
  const map = new Map()
  return {
    map,
    get(key) {
      return Promise.resolve(map.has(key) ? { seq: map.size, key, value: map.get(key) } : null)
    },
    put(key, value) {
      map.set(key, value)
      return Promise.resolve()
    },
    del(key) {
      map.delete(key)
      return Promise.resolve()
    }
  }
}

/** Stand-in for the Autobase host — records every writer apply() tries to admit. */
function fakeHost() {
  const writers = []
  return {
    writers,
    addWriter(key, opts) {
      writers.push({ key: b4a.toString(key, 'hex'), opts })
      return Promise.resolve()
    }
  }
}

/** Wrap ops the way Autobase hands them to apply(): { value, from }. */
function ops(list, from = PEER_A) {
  return list.map((value) => ({
    value,
    from: from ? { key: b4a.from(from, 'hex') } : null
  }))
}

test('key helpers keep the frozen n!/e!/m! layout unambiguous', (t) => {
  t.is(nodeKey('contract/payroll'), 'n!contract/payroll')
  t.is(
    edgeKey({ from: 'contract/payroll', to: 'storage/last-paid', type: 'writes' }),
    'e!contract/payroll!writes!storage/last-paid'
  )

  t.is(rangeEnd('n!'), 'n"')
  t.is(rangeEnd('e!'), 'e"')
  t.is(rangeEnd('m!'), 'm"')
  t.ok(rangeEnd('n!') > 'n!\uffff', 'range end sorts after every key in the prefix')
  t.ok(rangeEnd('n!') < 'n#', 'range end does not swallow the next prefix')
})

test('validId / validNode / validEdge reject anything that would corrupt a key', (t) => {
  t.ok(validId('contract/payroll'))
  t.ok(validId('a'))
  t.absent(validId(''), 'empty id')
  t.absent(validId('has!bang'), 'the separator is reserved')
  t.absent(validId(null))
  t.absent(validId(undefined))
  t.absent(validId(42))

  t.ok(validNode({ id: 'contract/payroll', type: 'contract' }))
  t.absent(validNode(null))
  t.absent(validNode({ type: 'contract' }), 'no id')
  t.absent(validNode({ id: 'contract/payroll' }), 'no type')
  t.absent(validNode({ id: 'contract/payroll', type: 7 }), 'type must be a string')
  t.absent(validNode({ id: 'a!b', type: 'contract' }))

  t.ok(validEdge({ from: 'a', to: 'b', type: 'calls' }))
  t.absent(validEdge(null))
  t.absent(validEdge({ from: 'a', to: 'b' }), 'no type')
  t.absent(validEdge({ from: 'a!x', to: 'b', type: 'calls' }))
  t.absent(validEdge({ from: 'a', to: 'b!x', type: 'calls' }))
})

test('shouldOverwrite: LWW by `at`, ties overwrite, notes resist scans', (t) => {
  t.ok(shouldOverwrite(null, { at: 1, source: 'scan' }), 'first write always applies')
  t.ok(shouldOverwrite({ at: 1, type: 'contract' }, { at: 2, source: 'scan' }), 'newer wins')
  t.absent(shouldOverwrite({ at: 5, type: 'contract' }, { at: 2, source: 'scan' }), 'stale loses')
  t.ok(
    shouldOverwrite({ at: 5, type: 'contract' }, { at: 5, source: 'scan' }),
    'a tie overwrites — linearized order decides, and it is deterministic'
  )
  t.ok(shouldOverwrite({ type: 'contract' }, { at: 0 }), 'a missing stamp counts as 0')
  t.absent(shouldOverwrite({ at: 5, type: 'contract' }, {}), 'an op with no stamp cannot win')
  t.absent(shouldOverwrite({ at: 1, type: 'note' }, { at: 99, source: 'scan' }), 'note protected')
  t.ok(shouldOverwrite({ at: 1, type: 'note' }, { at: 2, source: 'human' }), 'a human may edit')
})

test('apply writes nodes, edges and meta into the view', async (t) => {
  const view = fakeView()
  const host = fakeHost()

  await apply(
    ops([
      { op: 'put-meta', key: 'project', value: 'private-payroll', at: 1 },
      {
        op: 'put-node',
        node: { id: 'contract/payroll', type: 'contract', label: 'Payroll' },
        at: 2,
        source: 'scan'
      },
      {
        op: 'put-edge',
        edge: { from: 'contract/payroll', to: 'storage/last-paid', type: 'writes' },
        at: 3,
        source: 'scan'
      }
    ]),
    view,
    host
  )

  t.is(view.map.size, 3, 'three keys written')
  t.alike(view.map.get('m!project'), { value: 'private-payroll', at: 1 })
  t.alike(view.map.get('n!contract/payroll'), {
    id: 'contract/payroll',
    type: 'contract',
    label: 'Payroll',
    at: 2,
    by: 'aaaaaaaa',
    source: 'scan'
  })
  t.alike(view.map.get('e!contract/payroll!writes!storage/last-paid'), {
    from: 'contract/payroll',
    to: 'storage/last-paid',
    type: 'writes',
    at: 3,
    by: 'aaaaaaaa',
    source: 'scan'
  })
  t.is(host.writers.length, 0, 'no writer admitted by data ops')
})

test('`by` comes from the writing peer unless the op names one', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const node = { id: 'contract/payroll', type: 'contract' }

  await apply(ops([{ op: 'put-node', node, at: 1 }], PEER_B), view, host)
  t.is(view.map.get('n!contract/payroll').by, 'bbbbbbbb', 'derived from node.from.key')

  await apply(ops([{ op: 'put-node', node, at: 2, by: 'alice' }], PEER_B), view, host)
  t.is(view.map.get('n!contract/payroll').by, 'alice', 'the op wins when it carries `by`')

  await apply(ops([{ op: 'put-node', node, at: 3 }], null), view, host)
  t.is(view.map.get('n!contract/payroll').by, 'unknown', 'no source peer, no attribution')
})

test('apply deletes nodes and edges', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const edge = { from: 'contract/payroll', to: 'contract/treasury', type: 'calls' }

  await apply(
    ops([
      { op: 'put-node', node: { id: 'contract/payroll', type: 'contract' }, at: 1 },
      { op: 'put-node', node: { id: 'contract/treasury', type: 'contract' }, at: 1 },
      { op: 'put-edge', edge, at: 1 }
    ]),
    view,
    host
  )
  t.is(view.map.size, 3)

  await apply(
    ops([
      { op: 'del-node', id: 'contract/treasury', at: 2, source: 'scan' },
      { op: 'del-edge', edge, at: 2, source: 'scan' }
    ]),
    view,
    host
  )

  t.is(view.map.size, 1, 'node and edge gone')
  t.ok(view.map.has('n!contract/payroll'), 'the untouched node survives')

  await apply(ops([{ op: 'del-node', id: 'contract/ghost', at: 3 }]), view, host)
  t.is(view.map.size, 1, 'deleting something that never existed is a no-op')
})

test('a human note survives a scan write AND a scan delete, but a human may edit it', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const key = nodeKey('note/ttl')

  await apply(
    ops([
      {
        op: 'put-node',
        node: { id: 'note/ttl', type: 'note', summary: 'human wrote this' },
        at: 1,
        source: 'human'
      }
    ]),
    view,
    host
  )
  t.is(view.map.get(key).summary, 'human wrote this')

  await apply(
    ops([
      {
        op: 'put-node',
        node: { id: 'note/ttl', type: 'note', summary: 'SCAN OVERWROTE ME' },
        at: 999,
        source: 'scan'
      },
      { op: 'del-node', id: 'note/ttl', at: 1000, source: 'scan' }
    ]),
    view,
    host
  )
  t.ok(view.map.has(key), 'a scan cannot delete a note')
  t.is(view.map.get(key).summary, 'human wrote this', 'a scan cannot rewrite a note')

  await apply(
    ops([
      {
        op: 'put-node',
        node: { id: 'note/ttl', type: 'note', summary: 'edited by a teammate' },
        at: 2,
        source: 'human'
      }
    ]),
    view,
    host
  )
  t.is(view.map.get(key).summary, 'edited by a teammate', 'humans still own their notes')
})

test('last write wins by `at`, and an equal stamp overwrites', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const key = nodeKey('contract/payroll')
  const at = (stamp, summary) => ({
    op: 'put-node',
    node: { id: 'contract/payroll', type: 'contract', summary },
    at: stamp,
    source: 'scan'
  })

  await apply(ops([at(5, 'scan v5')]), view, host)
  await apply(ops([at(2, 'stale scan')]), view, host)
  t.is(view.map.get(key).summary, 'scan v5', 'stale scan rejected')

  await apply(ops([at(5, 'same stamp, later in the log')]), view, host)
  t.is(view.map.get(key).summary, 'same stamp, later in the log', 'ties overwrite')

  await apply(ops([at(6, 'scan v6')]), view, host)
  t.is(view.map.get(key).summary, 'scan v6', 'newer scan wins')

  // the same rule guards edges
  const edge = { from: 'a', to: 'b', type: 'calls' }
  await apply(ops([{ op: 'put-edge', edge, at: 9, source: 'scan' }]), view, host)
  await apply(ops([{ op: 'del-edge', edge, at: 3, source: 'scan' }]), view, host)
  t.ok(view.map.has(edgeKey(edge)), 'a stale delete cannot remove a newer edge')
})

test('malformed ops are ignored and apply never throws', async (t) => {
  const view = fakeView()
  const host = fakeHost()

  const malformed = ops([
    null, // acks
    undefined,
    'not-an-object',
    42,
    { node: { id: 'contract/payroll', type: 'contract' }, at: 1 }, // no `op` field
    { op: 'put-node', at: 1 }, // no node
    { op: 'put-node', node: null, at: 1 },
    { op: 'put-node', node: { id: 'has!bang', type: 'contract' }, at: 1 }, // '!' in the id
    { op: 'put-node', node: { id: 'contract/payroll', type: 7 }, at: 1 }, // type not a string
    { op: 'put-edge', edge: { from: 'a', to: 'b' }, at: 1 }, // no type
    { op: 'put-edge', edge: { from: 'a!x', to: 'b', type: 'calls' }, at: 1 },
    { op: 'del-node', id: 'has!bang', at: 1 },
    { op: 'del-node', at: 1 },
    { op: 'del-edge', edge: null, at: 1 },
    { op: 'put-meta', key: 'a!b', value: 1, at: 1 },
    { op: 'put-meta', at: 1 },
    { op: 'add-writer', key: 'deadbeef', at: 1 }, // not 64 hex chars
    { op: 'add-writer', key: null, at: 1 },
    { op: 'add-writer', at: 1 },
    { op: 'add-invite', invite: 'ff', publicKey: 'ee' }, // no id
    { op: 'del-invite' }
  ])

  await t.execution(apply(malformed, view, host), 'apply survives every malformed op')
  t.is(view.map.size, 0, 'the view was never touched')
  t.is(host.writers.length, 0, 'no writer was admitted')
})

test('an unknown op from a newer peer is ignored (forward compatible)', async (t) => {
  const view = fakeView()
  const host = fakeHost()

  await t.execution(
    apply(
      ops([
        { op: 'put-node', node: { id: 'contract/payroll', type: 'contract' }, at: 1 },
        { op: 'put-hypergraph', payload: { shipped: 'in v0.2' }, at: 2 },
        { op: 'del-everything', at: 3 },
        { op: 'put-node', node: { id: 'contract/treasury', type: 'contract' }, at: 4 }
      ]),
      view,
      host
    )
  )

  t.is(view.map.size, 2, 'the ops we understand still applied')
  t.ok(view.map.has('n!contract/payroll') && view.map.has('n!contract/treasury'))
})

test('add-writer, add-invite and del-invite', async (t) => {
  const view = fakeView()
  const host = fakeHost()

  await apply(ops([{ op: 'add-writer', key: PEER_B, name: 'bob' }]), view, host)
  t.is(host.writers.length, 1, 'one writer admitted')
  t.is(host.writers[0].key, PEER_B, 'the key is passed as bytes, not a string')
  t.alike(host.writers[0].opts, { indexer: true }, 'joiners become indexers')
  t.is(view.map.size, 0, 'add-writer does not touch the graph')

  await apply(
    ops([{ op: 'add-invite', id: 'abc123', invite: 'ff', publicKey: 'ee', expires: 0 }]),
    view,
    host
  )
  t.alike(
    view.map.get('i!abc123'),
    { invite: 'ff', publicKey: 'ee', expires: 0 },
    'the pending invite is stored under i!<inviteId>'
  )

  await apply(ops([{ op: 'del-invite', id: 'abc123' }]), view, host)
  t.absent(view.map.has('i!abc123'), 'invites are single use')
})
