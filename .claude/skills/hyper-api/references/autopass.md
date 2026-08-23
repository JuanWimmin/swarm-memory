# autopass 3.4.1 — the reference pattern (NOT installed; fetched from github.com/holepunchto/autopass@main)

Deps it uses that we do NOT have in `node_modules`: `hyperdb`, `hyperdispatch`, `blind-peering`, `blind-encryption-sodium`
(verified 2026-08-22). `hyperschema` and `protomux-wakeup` ARE present, but only as transitive deps (not in our `package.json`).
Do not `require('autopass')`; copy the shape.

## Shape (index.js, paraphrased with exact calls)
```js
class Autopass extends ReadyResource {
  constructor (corestore, { swarm, key, encryptionKey, wakeup, bootstrap, replicate } = {}) {
    this.base = new Autobase(this.store, key, {
      wakeup, encrypt: true, encryptionKey,
      open (store) { return HyperDB.bee(store.get('view'), db, { extension: false, autoUpdate: true }) },
      apply: this._apply.bind(this)        // router.dispatch(node.value, { view, base: host }) per node, then view.flush()
    })
    this.base.on('update', () => { if (!this.base._interrupting) this.emit('update') })
  }
  get writerKey () { return this.base.local.key }
  get key () { return this.base.key }
  get discoveryKey () { return this.base.discoveryKey }
  get encryptionKey () { return this.base.encryptionKey }
  get writable () { return this.base.writable }

  async _open () { await this.base.ready(); if (this.replicate) await this._replicate() }
  async _close () { if (this.swarm) { await this.member.close(); await this.pairing.close(); await this.swarm.destroy() } await this.base.close() }

  async _replicate () {
    if (this.swarm === null) {
      this.swarm = new Hyperswarm({ keyPair: await this.store.createKeyPair('hyperswarm'), bootstrap, relayThrough })
      this.swarm.on('connection', (connection, peerInfo) => { this.base.replicate(connection) })
    }
    this.pairing = new BlindPairing(this.swarm)
    this.member = this.pairing.addMember({
      discoveryKey: this.base.discoveryKey,
      onadd: async (candidate) => {
        const inv = await this.base.view.findOne('@autopass/invite', {})      // invite record stored IN THE VIEW via an op
        if (inv === null || !b4a.equals(inv.id, candidate.inviteId)) return
        candidate.open(inv.publicKey)
        const { key, name } = c.decode(INVITEE, candidate.userData)           // userData = { key: localWriterKey, name }
        await this.addWriter({ key, name, readOnly: inv.readOnly })          // appends '@autopass/add-writer' op → host.addWriter in apply
        candidate.confirm({ key: this.base.key, encryptionKey: this.base.encryptionKey, additional: inv.additional })
        await this.deleteInvite()
      }
    })
    this.swarm.join(this.base.discoveryKey)
  }

  async createInvite ({ readOnly } = {}) {
    const { id, invite, publicKey, expires, additional } = BlindPairing.createInvite(this.base.key, { data: c.encode(PUBLIC_INVITE_METADATA, { readOnly }) })
    await this.base.append(encode('@autopass/add-invite', { id, invite, publicKey, expires, readOnly, additional }))
    if (this.member) await this.member.flushed()
    return z32.encode(invite)
  }
}

class AutopassPairer extends ReadyResource {            // Autopass.pair(store, inviteZ32)
  async _open () {
    await this.store.ready()
    this.swarm = new Hyperswarm({ keyPair: await this.store.createKeyPair('hyperswarm'), bootstrap })
    this.wakeup = new Wakeup()                            // protomux-wakeup (optional for us)
    this.swarm.on('connection', (connection) => { store.replicate(connection); this.wakeup.addStream(connection) })
    this.pairing = new BlindPairing(this.swarm)
    const core = Autobase.getLocalCore(this.store); await core.ready(); const key = core.key; await core.close()
    this.candidate = this.pairing.addCandidate({
      invite: z32.decode(this.invite),
      userData: c.encode(INVITEE, { key, name }),
      onadd: async (result) => {
        this.pass = new Autopass(this.store, { swarm: this.swarm, key: result.key, wakeup: this.wakeup, encryptionKey: result.encryptionKey })
        await this.pass.deleteInvite()
        // resolve when this.pass.base.writable (listen to base 'update'), or immediately if invite was readOnly
        this.candidate.close().catch(noop)
      }
    })
  }
  finished () { return new Promise((resolve, reject) => { this.onresolve = resolve; this.onreject = reject }) }
}
```

## Takeaways for SwarmStore
- Invite public key must be available to whoever runs the Member: autopass replicates it through the view (an op). Our skeleton
  keeps it local via `base.setUserData('invite-pk', publicKey)` (single inviter machine) — switch to an op (`m!invite`) if any
  writer must be able to confirm (requires team OK: new op type).
- Writer add = an op applied by everyone → `host.addWriter(key)`; candidate waits for `base.writable` via `'update'` events.
- After pairing, restart with the plain constructor (no key): Autobase reloads from the local core's user data.
- `HyperDB.bee(..., { extension: false })` ⇒ for plain Hyperbee pass `{ extension: false }` too.
