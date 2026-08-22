// SwarmStore — the team's shared knowledge graph as a multi-writer Autobase whose view is a
// Hyperbee, replicated over Hyperswarm, joined by invite (blind-pairing).
//
// Implements the frozen GraphSource contract (TEAM_PLAN.md §4.4): { nodes(), edges(), meta() }.
// Runs on Bare: no fs/path/process/Buffer — Corestore owns storage, b4a owns bytes.

const Autobase = require('autobase')
const Hyperbee = require('hyperbee')
const Hyperswarm = require('hyperswarm')
const BlindPairing = require('blind-pairing')
const ReadyResource = require('ready-resource')
const z32 = require('z32')
const b4a = require('b4a')

const { apply, validId, validNode, validEdge, rangeEnd } = require('./apply.js')

function noop() {}

/** Build the Autobase view: a Hyperbee on the AutoStore core named 'view'. */
function open(store) {
  return new Hyperbee(store.get('view'), {
    extension: false,
    keyEncoding: 'utf-8',
    valueEncoding: 'json'
  })
}

class SwarmStore extends ReadyResource {
  /**
   * @param {import('corestore')} store
   * @param {object} [opts]
   * @param {Buffer} [opts.key] autobase key (null → new base, or restored from disk)
   * @param {Buffer} [opts.encryptionKey] handed over by the inviter when pairing
   * @param {import('hyperswarm')} [opts.swarm] reuse a swarm (the pairer passes its own)
   * @param {object} [opts.wakeup] shared protomux-wakeup instance
   * @param {Array} [opts.bootstrap] DHT bootstrap nodes (tests use a local testnet)
   * @param {string} [opts.name] human label stored with invites/writers
   */
  constructor(store, opts = {}) {
    super()

    this.store = store
    this.swarm = opts.swarm || null
    this.ownsSwarm = !opts.swarm
    this.wakeup = opts.wakeup || null
    this.bootstrap = opts.bootstrap || null
    this.name = opts.name || 'anon'

    this.pairing = null
    this.member = null
    this.clock = 0

    this.base = new Autobase(store, opts.key || null, {
      valueEncoding: 'json',
      encrypt: true,
      encryptionKey: opts.encryptionKey,
      wakeup: this.wakeup || undefined,
      open,
      apply
    })

    this.base.on('update', () => this.emit('update'))
    this.base.on('error', (err) => this.emit('error', err))
  }

  /** Autobase key (32 bytes). */
  get key() {
    return this.base.key
  }

  /** z32 id of the base — what humans see. */
  get id() {
    return this.base.key ? z32.encode(this.base.key) : null
  }

  /** True once this peer has been added as a writer. */
  get writable() {
    return this.base.writable
  }

  /** The Hyperbee view. */
  get view() {
    return this.base.view
  }

  /** Number of currently connected swarm peers. */
  get peers() {
    return this.swarm ? this.swarm.connections.size : 0
  }

  async _open() {
    await this.base.ready()

    if (this.swarm === null) {
      this.swarm = new Hyperswarm({
        keyPair: await this.store.createKeyPair('hyperswarm'),
        bootstrap: this.bootstrap
      })
      this.swarm.on('connection', (conn) => this.base.replicate(conn))
    }

    // admit joiners that present a valid invite
    this.pairing = new BlindPairing(this.swarm)
    this.member = this.pairing.addMember({
      discoveryKey: this.base.discoveryKey,
      onadd: (candidate) => this._onpair(candidate).catch((err) => this.emit('warning', err))
    })

    this.swarm.join(this.base.discoveryKey)
    await this._restoreClock()
  }

  async _close() {
    if (this.member) await this.member.close().catch(noop)
    if (this.pairing) await this.pairing.close().catch(noop)
    if (this.swarm && this.ownsSwarm) await this.swarm.destroy().catch(noop)
    await this.base.close() // also closes the corestore
  }

  async _onpair(candidate) {
    const id = b4a.toString(candidate.inviteId, 'hex')
    const invite = await this.base.view.get('i!' + id)
    if (!invite) return // not one of ours (or already used)

    candidate.open(b4a.from(invite.value.publicKey, 'hex'))

    let userData = {}
    try {
      userData = JSON.parse(b4a.toString(candidate.userData))
    } catch {
      return candidate.deny()
    }
    if (typeof userData.key !== 'string' || userData.key.length !== 64) return candidate.deny()

    await this.base.append({ op: 'add-writer', key: userData.key, name: userData.name || 'anon' })
    candidate.confirm({ key: this.base.key, encryptionKey: this.base.encryptionKey })
    await this.base.append({ op: 'del-invite', id }) // single use
  }

  /** Restart-safe lamport clock: never hand out a stamp below what the view already holds. */
  async _restoreClock() {
    let max = 0
    for (const prefix of ['n!', 'e!', 'm!']) {
      for await (const entry of this.base.view.createReadStream({ gte: prefix, lt: rangeEnd(prefix) })) {
        const at = entry.value && typeof entry.value.at === 'number' ? entry.value.at : 0
        if (at > max) max = at
      }
    }
    if (max > this.clock) this.clock = max
  }

  /** Next lamport stamp. */
  tick() {
    return ++this.clock
  }

  /** Pull in whatever peers have appended since the last update. */
  async update() {
    await this.base.update()
  }

  /**
   * Call fn on every view update. Returns an unsubscribe function.
   * @param {Function} fn
   */
  watch(fn) {
    this.on('update', fn)
    return () => this.off('update', fn)
  }

  // ---------------------------------------------------------------- writes

  /**
   * @param {object} node { id, type, label, summary, severity, data }
   * @param {object} [opts] { source: 'scan'|'human', at }
   */
  async putNode(node, opts = {}) {
    if (!validNode(node)) throw new Error('invalid node: needs a string id without "!" and a type')
    if (!this.opened) await this.ready()
    const source = opts.source || 'scan'
    const at = opts.at === undefined ? this.tick() : opts.at
    if (at > this.clock) this.clock = at
    return this.base.append({ op: 'put-node', node, at, by: this.name, source })
  }

  /** @param {object} edge { from, to, type } */
  async putEdge(edge, opts = {}) {
    if (!validEdge(edge)) throw new Error('invalid edge: from/to/type must be strings without "!"')
    if (!this.opened) await this.ready()
    const source = opts.source || 'scan'
    const at = opts.at === undefined ? this.tick() : opts.at
    if (at > this.clock) this.clock = at
    return this.base.append({ op: 'put-edge', edge, at, by: this.name, source })
  }

  async delNode(id, opts = {}) {
    if (!validId(id)) throw new Error('invalid node id')
    if (!this.opened) await this.ready()
    const source = opts.source || 'scan'
    const at = opts.at === undefined ? this.tick() : opts.at
    if (at > this.clock) this.clock = at
    return this.base.append({ op: 'del-node', id, at, by: this.name, source })
  }

  async delEdge(edge, opts = {}) {
    if (!validEdge(edge)) throw new Error('invalid edge')
    if (!this.opened) await this.ready()
    const source = opts.source || 'scan'
    const at = opts.at === undefined ? this.tick() : opts.at
    if (at > this.clock) this.clock = at
    return this.base.append({ op: 'del-edge', edge, at, by: this.name, source })
  }

  async putMeta(key, value, opts = {}) {
    if (!validId(key)) throw new Error('invalid meta key')
    if (!this.opened) await this.ready()
    const at = opts.at === undefined ? this.tick() : opts.at
    if (at > this.clock) this.clock = at
    return this.base.append({ op: 'put-meta', key, value, at })
  }

  // ---------------------------------------------------------------- GraphSource

  async _collect(prefix) {
    if (!this.opened) await this.ready()
    const out = []
    for await (const entry of this.base.view.createReadStream({ gte: prefix, lt: rangeEnd(prefix) })) {
      out.push(entry.value)
    }
    return out
  }

  /** @returns {Promise<Array<object>>} graph nodes (graph.json §4.1 shape + at/by/source) */
  nodes() {
    return this._collect('n!')
  }

  /** @returns {Promise<Array<object>>} graph edges */
  edges() {
    return this._collect('e!')
  }

  /** @returns {Promise<object>} metadata map, e.g. { project: 'private-payroll' } */
  async meta() {
    if (!this.opened) await this.ready()
    const out = {}
    for await (const entry of this.base.view.createReadStream({ gte: 'm!', lt: rangeEnd('m!') })) {
      out[entry.key.slice(2)] = entry.value ? entry.value.value : undefined
    }
    return out
  }

  // ---------------------------------------------------------------- invites

  /**
   * Create a single-use invitation code. The inviting process must stay online for a joiner
   * to be admitted (pairing happens live, member side).
   * @returns {Promise<string>} z32 invite code
   */
  async createInvite() {
    if (!this.opened) await this.ready()
    if (!this.base.writable) throw new Error('cannot invite: this peer is not a writer yet')

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

  /**
   * Join someone else's store with an invite code.
   * @returns {import('./pairer.js')} pairer — await pairer.finished() for a ready SwarmStore
   */
  static pair(store, inviteCode, opts) {
    const SwarmPairer = require('./pairer.js')
    return new SwarmPairer(store, inviteCode, opts)
  }
}

module.exports = SwarmStore
