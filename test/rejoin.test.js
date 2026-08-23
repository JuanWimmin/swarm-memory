// Two failures the test suite could not see, because every earlier test kept both peers alive in
// one process. A demo does not: you join, the command exits, and later you run another one.

const test = require('brittle')
const createTestnet = require('hyperdht/testnet')

const { openStore } = require('../src/sync')

const ROOT = 'test/.tmp/rejoin-' + Date.now()
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

test('a peer that joined by invite still has the project after a restart', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const bootstrap = testnet.bootstrap
  const alice = await openStore(dir('alice'), { name: 'alice', bootstrap })
  t.teardown(() => alice.close())

  await alice.putMeta('project', 'private-payroll')
  await alice.putNode({ id: 'contract/payroll', type: 'contract', label: 'Payroll' })
  await alice.putNode({ id: 'contract/treasury', type: 'contract', label: 'Treasury' })
  await waitFor(async () => (await alice.nodes()).length === 2)

  const code = await alice.createInvite()
  const bobDir = dir('bob')

  const bob = await openStore(bobDir, { invite: code, name: 'bob', bootstrap, timeout: 60000 })
  await waitFor(async () => (await bob.nodes()).length === 2)
  const joinedId = bob.id
  t.is(joinedId, alice.id, 'joined the right store')
  await bob.close()

  // the whole point: reopen the same directory with no invite and no key
  const again = await openStore(bobDir, { name: 'bob', bootstrap })
  t.teardown(() => again.close())

  t.is(again.id, joinedId, 'reopens as the store it joined, not as a fresh empty one')
  t.is((await again.nodes()).length, 2, 'the replicated project survived the restart')
  t.is((await again.meta()).project, 'private-payroll', 'and so did the metadata')
  t.ok(again.writable, 'it is still a writer')
})

test('a one-shot write waits until a peer has taken it', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const bootstrap = testnet.bootstrap

  const alice = await openStore(dir('alice'), { name: 'alice', bootstrap })
  t.teardown(() => alice.close())
  await alice.putNode({ id: 'contract/payroll', type: 'contract', label: 'Payroll' })
  const code = await alice.createInvite()

  const bob = await openStore(dir('bob'), { invite: code, name: 'bob', bootstrap, timeout: 60000 })
  t.teardown(() => bob.close())
  await waitFor(async () => (await bob.nodes()).length === 1)

  await bob.putNode(
    { id: 'note/from-bob', type: 'note', label: 'from bob', summary: 'written then closed' },
    { source: 'human' }
  )

  const flush = await bob.flushed({ timeout: 30000 })
  t.ok(flush.pushed, 'the write was acknowledged by a peer before we would have closed')
  t.ok(flush.peers > 0, 'and it names how many peers were there')

  await waitFor(async () => (await alice.nodes()).length === 2, 30000)
  const landed = (await alice.nodes()).find((n) => n.id === 'note/from-bob')
  t.ok(landed, "the teammate's note is on the other peer")
})

test('flushing is a no-op when there is nothing to push', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const store = await openStore(dir('solo'), { name: 'solo', bootstrap: testnet.bootstrap })
  t.teardown(() => store.close())

  const before = Date.now()
  const flush = await store.flushed({ timeout: 5000, connectWait: 5000 })
  t.absent(flush.pushed, 'nothing was pushed')
  t.is(flush.reason, 'nothing written', 'and it says why')
  t.ok(Date.now() - before < 1000, 'a read-only command never pays the wait')
})

test('a write with nobody online is kept, and says so', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const store = await openStore(dir('alone'), { name: 'alone', bootstrap: testnet.bootstrap })
  t.teardown(() => store.close())

  await store.putNode({ id: 'note/alone', type: 'note', label: 'alone' }, { source: 'human' })
  const flush = await store.flushed({ timeout: 2000, connectWait: 1500 })

  t.absent(flush.pushed, 'nothing to push it to')
  t.is(flush.reason, 'no peers online', 'and the caller can explain that to the user')
  await waitFor(async () => (await store.nodes()).length === 1)
  t.is((await store.nodes()).length, 1, 'the note is still durable locally')
})
