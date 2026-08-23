// Plan B spike: hand-rolled Autobase 7 + Hyperbee view + blind-pairing (autopass as reference).
// Runtime-agnostic (Node or Bare): no fs/process/node: imports.
// Only APIs verified in node_modules READMEs/source are used.

const Corestore = require('corestore')
const Autobase = require('autobase')
const Hyperbee = require('hyperbee')
const Hyperswarm = require('hyperswarm')
const BlindPairing = require('blind-pairing')
const Wakeup = require('protomux-wakeup')
const ReadyResource = require('ready-resource')
const z32 = require('z32')
const b4a = require('b4a')
const createTestnet = require('hyperdht/testnet')

const ROOT = (typeof __dirname !== 'undefined' ? __dirname : '.') + '/tmp-' + Date.now()

// ---------------------------------------------------------------- policy
function shouldOverwrite(prev, op) {
  if (!prev) return true
  // human notes are never overwritten by automatic scans
  if (prev.type === 'note' && op.source === 'scan') return false
  return op.at >= prev.at // LWW by lamport `at`; ties -> later in linearized order wins (deterministic)
}

async function apply(nodes, view, host) {
  for (const node of nodes) {
    const v = node.value
    if (!v || typeof v !== 'object') continue
    switch (v.op) {
      case 'add-writer':
        await host.addWriter(b4a.from(v.key, 'hex'), { indexer: true })
        break
      case 'add-invite':
        await view.put('i!' + v.id, { invite: v.invite, publicKey: v.publicKey, expires: v.expires })
        break
      case 'del-invite':
        await view.del('i!' + v.id)
        break
      case 'put-node': {
        const k = 'n!' + v.node.id
        const prev = await view.get(k)
        if (!shouldOverwrite(prev && prev.value, v)) break
        await view.put(k, { ...v.node, at: v.at, by: v.by, source: v.source })
        break
      }
      case 'put-edge': {
        const e = v.edge
        const k = 'e!' + e.from + '!' + e.type + '!' + e.to
        const prev = await view.get(k)
        if (!shouldOverwrite(prev && prev.value, v)) break
        await view.put(k, { ...e, at: v.at, by: v.by, source: v.source })
        break
      }
      case 'del-node': {
        const k = 'n!' + v.id
        const prev = await view.get(k)
        if (!shouldOverwrite(prev && prev.value, v)) break
        await view.del(k)
        break
      }
      case 'put-meta':
        await view.put('m!' + v.key, { value: v.value, at: v.at })
        break
      default:
        // unknown op from a newer peer: ignore (forward compatible)
        break
    }
  }
}

// ---------------------------------------------------------------- store
class SwarmStore extends ReadyResource {
  constructor(store, opts = {}) {
    super()
    this.store = store
    this.swarm = opts.swarm || null
    this.wakeup = opts.wakeup || null
    this.bootstrap = opts.bootstrap || null
    this.pairing = null
    this.member = null
    this.name = opts.name || 'anon'
    this.clock = 0

    this.base = new Autobase(store, opts.key || null, {
      valueEncoding: 'json',
      encrypt: true,
      encryptionKey: opts.encryptionKey,
      wakeup: this.wakeup || undefined,
      open(store) {
        return new Hyperbee(store.get('view'), { keyEncoding: 'utf-8', valueEncoding: 'json' })
      },
      apply
    })
    this.base.on('update', () => this.emit('update'))
    this.ready().catch(noop)
  }

  get key() { return this.base.key }
  get writable() { return this.base.writable }
  get view() { return this.base.view }
  get peers() { return this.swarm ? this.swarm.connections.size : 0 }

  async _open() {
    await this.base.ready()
    if (this.swarm === null) {
      this.swarm = new Hyperswarm({
        keyPair: await this.store.createKeyPair('hyperswarm'),
        bootstrap: this.bootstrap
      })
      this.swarm.on('connection', (conn) => this.base.replicate(conn))
    }
    this.pairing = new BlindPairing(this.swarm)
    this.member = this.pairing.addMember({
      discoveryKey: this.base.discoveryKey,
      onadd: async (candidate) => {
        const id = b4a.toString(candidate.inviteId, 'hex')
        const inv = await this.base.view.get('i!' + id)
        if (!inv) return
        candidate.open(b4a.from(inv.value.publicKey, 'hex'))
        const { key, name } = JSON.parse(b4a.toString(candidate.userData))
        await this.base.append({ op: 'add-writer', key, name })
        candidate.confirm({ key: this.base.key, encryptionKey: this.base.encryptionKey })
        await this.base.append({ op: 'del-invite', id })
      }
    })
    this.swarm.join(this.base.discoveryKey)
  }

  async _close() {
    if (this.member) await this.member.close()
    if (this.pairing) await this.pairing.close()
    if (this.swarm) await this.swarm.destroy()
    await this.base.close()
  }

  tick() { return ++this.clock }

  async createInvite() {
    if (!this.opened) await this.ready()
    const { id, invite, publicKey, expires } = BlindPairing.createInvite(this.base.key)
    await this.base.append({
      op: 'add-invite',
      id: b4a.toString(id, 'hex'),
      invite: b4a.toString(invite, 'hex'),
      publicKey: b4a.toString(publicKey, 'hex'),
      expires
    })
    if (this.member) await this.member.flushed()
    return z32.encode(invite)
  }

  putNode(node, { source = 'scan', at = this.tick() } = {}) {
    return this.base.append({ op: 'put-node', node, at, by: this.name, source })
  }
  putEdge(edge, { source = 'scan', at = this.tick() } = {}) {
    return this.base.append({ op: 'put-edge', edge, at, by: this.name, source })
  }
  delNode(id, { source = 'scan', at = this.tick() } = {}) {
    return this.base.append({ op: 'del-node', id, at, by: this.name, source })
  }
  putMeta(key, value, { at = this.tick() } = {}) {
    return this.base.append({ op: 'put-meta', key, value, at })
  }

  async nodes() {
    const out = []
    for await (const e of this.base.view.createReadStream({ gte: 'n!', lt: 'n"' })) out.push(e.value)
    return out
  }
  async edges() {
    const out = []
    for await (const e of this.base.view.createReadStream({ gte: 'e!', lt: 'e"' })) out.push(e.value)
    return out
  }
  async meta() {
    const out = {}
    for await (const e of this.base.view.createReadStream({ gte: 'm!', lt: 'm"' })) out[e.key.slice(2)] = e.value.value
    return out
  }

  static pair(store, inviteCode, opts) {
    return new SwarmPairer(store, inviteCode, opts)
  }
}

class SwarmPairer extends ReadyResource {
  constructor(store, inviteCode, opts = {}) {
    super()
    this.store = store
    this.invite = inviteCode
    this.bootstrap = opts.bootstrap || null
    this.name = opts.name || 'anon'
    this.swarm = null
    this.wakeup = null
    this.pairing = null
    this.candidate = null
    this.result = null
    this.onresolve = null
    this.onreject = null
    this.ready().catch(noop)
  }

  async _open() {
    await this.store.ready()
    this.swarm = new Hyperswarm({
      keyPair: await this.store.createKeyPair('hyperswarm'),
      bootstrap: this.bootstrap
    })
    this.wakeup = new Wakeup()
    const store = this.store
    this.swarm.on('connection', (conn) => {
      store.replicate(conn)
      this.wakeup.addStream(conn)
    })
    this.pairing = new BlindPairing(this.swarm)
    const core = Autobase.getLocalCore(this.store)
    await core.ready()
    const key = b4a.toString(core.key, 'hex')
    await core.close()

    this.candidate = this.pairing.addCandidate({
      invite: z32.decode(this.invite),
      userData: b4a.from(JSON.stringify({ key, name: this.name })),
      onadd: async (result) => {
        if (this.result === null) {
          this.result = new SwarmStore(this.store, {
            swarm: this.swarm,
            wakeup: this.wakeup,
            key: result.key,
            encryptionKey: result.encryptionKey,
            bootstrap: this.bootstrap,
            name: this.name
          })
        }
        this.swarm = null
        this.store = null
        if (this.onresolve) this._whenWritable()
        this.candidate.close().catch(noop)
      }
    })
  }

  _whenWritable() {
    const s = this.result
    if (s.base.writable) return this.onresolve(s)
    const check = () => {
      if (s.base.writable) {
        s.base.off('update', check)
        this.onresolve(s)
      }
    }
    s.base.on('update', check)
  }

  async _close() {
    if (this.candidate) await this.candidate.close()
    if (this.wakeup) this.wakeup.destroy()
    if (this.swarm) await this.swarm.destroy()
    if (this.store) await this.store.close()
    if (this.onreject) this.onreject(new Error('Pairing closed'))
  }

  finished() {
    return new Promise((resolve, reject) => {
      this.onresolve = resolve
      this.onreject = reject
    })
  }
}

function noop() {}

function updateUntil(s, fn, ms = 30000) {
  return new Promise((resolve, reject) => {
    if (fn()) return resolve()
    const t = setTimeout(() => { s.off('update', check); reject(new Error('timeout waiting for update')) }, ms)
    const check = () => { if (fn()) { clearTimeout(t); s.off('update', check); resolve() } }
    s.on('update', check)
  })
}

async function waitFor(fn, ms = 30000, step = 100) {
  const start = Date.now()
  while (!(await fn())) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for condition')
    await new Promise((r) => setTimeout(r, step))
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const t0 = Date.now()
  const tn = await createTestnet(5)
  const bootstrap = tn.bootstrap
  console.log('[1] testnet up', Date.now() - t0, 'ms')

  const a = new SwarmStore(new Corestore(ROOT + '/a'), { bootstrap, name: 'alice' })
  await a.ready()
  console.log('[2] A ready; key', b4a.toString(a.key, 'hex').slice(0, 16), 'writable', a.writable, 'encrypted', !!a.base.encryptionKey)

  await a.putMeta('project', 'private-payroll')
  await a.putNode({ id: 'contract/payroll', type: 'contract', label: 'Payroll', summary: 'scan v1', severity: 'info' })
  await a.putNode({ id: 'note/ttl', type: 'note', label: 'TTL note', summary: 'human wrote this', severity: 'warn' }, { source: 'human' })
  await a.putEdge({ from: 'contract/payroll', to: 'contract/treasury', type: 'calls' })
  console.log('[3] A wrote; nodes', (await a.nodes()).length, 'edges', (await a.edges()).length, 'meta', await a.meta())

  const inv = await a.createInvite()
  console.log('[4] invite', inv, '(', inv.length, 'chars )')

  const tPair = Date.now()
  const pairer = SwarmStore.pair(new Corestore(ROOT + '/b'), inv, { bootstrap, name: 'bob' })
  const b = await pairer.finished()
  await b.ready()
  console.log('[5] B paired+writable in', Date.now() - tPair, 'ms; key match', b4a.equals(a.key, b.key), 'writable', b.writable)

  await updateUntil(b, () => true, 1000).catch(noop)
  await waitFor(async () => (await b.nodes()).length === 2)
  console.log('[6] B replicated A data: nodes', (await b.nodes()).map((n) => n.id), 'meta', await b.meta())

  // B writes a human note + a scan update
  await b.putNode({ id: 'note/bob', type: 'note', label: 'Bob note', summary: 'added live', severity: 'info' }, { source: 'human' })
  await b.putNode({ id: 'contract/payroll', type: 'contract', label: 'Payroll', summary: 'scan v2 from bob', severity: 'warn' }, { at: 100 })
  await waitFor(async () => (await a.nodes()).length === 3)
  const payrollA = (await a.nodes()).find((n) => n.id === 'contract/payroll')
  console.log('[7] A sees B note + LWW update: nodes', (await a.nodes()).map((n) => n.id), 'payroll.summary =', payrollA.summary, 'at', payrollA.at)

  // scan attempts to overwrite a human note -> must be rejected on both peers
  await b.putNode({ id: 'note/ttl', type: 'note', label: 'TTL note', summary: 'SCAN OVERWROTE ME', severity: 'info' }, { at: 999, source: 'scan' })
  // stale scan (at lower than current) -> rejected
  await b.putNode({ id: 'contract/payroll', type: 'contract', label: 'Payroll', summary: 'stale scan', severity: 'info' }, { at: 5, source: 'scan' })
  // del + re-put ordering sanity
  await b.putMeta('peersSeen', 2)
  await waitFor(async () => (await a.meta()).peersSeen === 2)
  const nodesA = await a.nodes()
  const nodesB = await b.nodes()
  const noteA = nodesA.find((n) => n.id === 'note/ttl')
  const payA = nodesA.find((n) => n.id === 'contract/payroll')
  console.log('[8] note protected:', noteA.summary === 'human wrote this', '| stale scan rejected:', payA.summary === 'scan v2 from bob', '| A==B view:', JSON.stringify(nodesA) === JSON.stringify(nodesB))
  console.log('[9] peers A', a.peers, 'B', b.peers, '| members', a.base.system.members, b.base.system.members)

  // restart B from disk with just the key (the "normal constructor" path)
  await b.close()
  const b2 = new SwarmStore(new Corestore(ROOT + '/b'), { bootstrap, name: 'bob' }) // no key: autobase restores bootstrap from local core user data
  await b2.ready()
  console.log('[10] B reopened from disk (no key given): sameKey', b4a.equals(b2.key, a.key), 'writable', b2.writable, 'nodes', (await b2.nodes()).length, 'encryptionKey persisted', !!b2.base.encryptionKey)

  await b2.close()
  await a.close()
  await tn.destroy()
  console.log('[done] total', Date.now() - t0, 'ms')
}

main().catch((err) => {
  console.error('SPIKE FAILED', err)
  globalThis.Bare ? Bare.exit(1) : process.exit(1)
})
