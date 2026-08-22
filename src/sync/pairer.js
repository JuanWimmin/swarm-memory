// SwarmPairer — joins an existing SwarmStore with an invite code (blind-pairing candidate side).
// Pattern follows autopass; every call is verified against the installed modules.

const Autobase = require('autobase')
const Hyperswarm = require('hyperswarm')
const BlindPairing = require('blind-pairing')
const Wakeup = require('protomux-wakeup')
const ReadyResource = require('ready-resource')
const z32 = require('z32')
const b4a = require('b4a')

function noop() {}

class SwarmPairer extends ReadyResource {
  /**
   * @param {import('corestore')} store fresh corestore for this peer
   * @param {string} inviteCode z32 invite from `swarm-memory invite`
   * @param {object} [opts] { name, bootstrap, timeout }
   */
  constructor(store, inviteCode, opts = {}) {
    super()

    this.store = store
    this.inviteCode = inviteCode
    this.bootstrap = opts.bootstrap || null
    this.name = opts.name || 'anon'
    this.timeout = opts.timeout || 0

    this.swarm = null
    this.wakeup = null
    this.pairing = null
    this.candidate = null
    this.result = null

    this.onresolve = null
    this.onreject = null
    this._timer = null

    this.ready().catch((err) => this.emit('error', err))
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

    // our local writer key travels with the pairing request, so the inviter can add us
    const core = Autobase.getLocalCore(this.store)
    await core.ready()
    const key = b4a.toString(core.key, 'hex')
    await core.close()

    this.pairing = new BlindPairing(this.swarm)
    this.candidate = this.pairing.addCandidate({
      invite: z32.decode(this.inviteCode),
      userData: b4a.from(JSON.stringify({ key, name: this.name })),
      onadd: async (auth) => {
        if (this.result === null) {
          const SwarmStore = require('./store.js')
          this.result = new SwarmStore(this.store, {
            swarm: this.swarm,
            wakeup: this.wakeup,
            key: auth.key,
            encryptionKey: auth.encryptionKey,
            bootstrap: this.bootstrap,
            name: this.name
          })
          this.result.ownsSwarm = true // the store takes the swarm over from here
          await this.result.ready()
        }
        this.swarm = null // ownership moved to the store
        this.store = null
        if (this.onresolve) this._whenWritable()
        this.candidate.close().catch(noop)
      }
    })
  }

  _whenWritable() {
    const store = this.result
    if (store.base.writable) return this._settle(store)

    const check = () => {
      if (store.base.writable) {
        store.base.off('update', check)
        this._settle(store)
      }
    }
    store.base.on('update', check)
  }

  _settle(store) {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    const resolve = this.onresolve
    this.onresolve = null
    this.onreject = null
    if (resolve) resolve(store)
  }

  async _close() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    if (this.candidate) await this.candidate.close().catch(noop)
    if (this.pairing) await this.pairing.close().catch(noop)
    if (this.wakeup) this.wakeup.destroy()
    if (this.swarm) await this.swarm.destroy().catch(noop)
    if (this.store) await this.store.close().catch(noop)
    if (this.onreject) this.onreject(new Error('pairing closed'))
  }

  /**
   * @returns {Promise<import('./store.js')>} the joined store, once this peer can write
   */
  finished() {
    return new Promise((resolve, reject) => {
      this.onresolve = resolve
      this.onreject = reject
      if (this.timeout > 0) {
        this._timer = setTimeout(() => {
          this._timer = null
          const rej = this.onreject
          this.onreject = null
          this.onresolve = null
          this.close().catch(noop)
          if (rej) rej(new Error('pairing timed out after ' + this.timeout + 'ms'))
        }, this.timeout)
      }
      if (this.result && this.result.base.writable) this._settle(this.result)
    })
  }
}

module.exports = SwarmPairer
