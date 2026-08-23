---
name: hyper-api
description: Verified API reference for the Holepunch stack as installed in this repo (hyperswarm 4.17, corestore 7.11, hypercore 11.33, hyperbee 2.27, autobase 7.28, blind-pairing 2.3, b4a, z32, compact-encoding, hypercore-id-encoding, hypercore-crypto, ready-resource, graceful-goodbye, sub-encoder, protomux). Load it BEFORE writing or reviewing anything in src/sync/ (SwarmStore, apply(), invite/join/peers) or any code that touches Autobase/Hyperbee/Hyperswarm from Bare.
---

# hyper-api — grounded cheat-sheet (SwarmMemory, Bare runtime)

Every line below was checked against `node_modules/<pkg>/README.md` or source on disk (2026-08-22), or against
`holepunchto/autopass@main` (fetched). Tags: **[R]** = in README · **[S]** = only in source (index.js/lib) · **[A]** = pattern from autopass · **[I]** = inferred/design choice, not an API claim. Long dumps live in `references/<pkg>.md`.

## 1. How the pieces fit

`Corestore(dir)` is the factory/storage for every Hypercore (append-only signed log). `Autobase(store, key, {open, apply})`
turns N writer cores (one `base.local` per peer) into one deterministic **view**; `open(store)` builds the view from the
AutoStore (`store.get('view')` → Hypercore, wrap it in a `Hyperbee` = sorted KV on a core), `apply(nodes, view, host)` is the
only place the view may be mutated and the only place writers are added (`host.addWriter(key)`). `base.append(op)` writes an
op to the local core; it reaches the view only through `apply`. `Hyperswarm` finds peers by 32-byte topic (we use
`base.discoveryKey`) and hands you Noise-encrypted duplex sockets; `base.replicate(conn)` (or `store.replicate(conn)`)
multiplexes all cores over it. `blind-pairing` rides on that same swarm: the inviter (`Member`) publishes an invite
(`BlindPairing.createInvite(base.key)` → share `z32.encode(invite)`), the joiner (`Candidate`) sends its local writer key as
`userData`; the member opens/verifies it, appends an `add-writer` op, and `confirm({ key: base.key, encryptionKey })`; the
candidate then boots its own `Autobase(store, key, …)` and becomes writable once the add-writer op is applied.

## 2. Verified API cheat-sheet

| Pkg | Create | Key calls (exact names) | Events / props |
|---|---|---|---|
| corestore [R] | `new Corestore(dir\|storage, { primaryKey, writable })` | `store.get({ name })` · `store.get(keyBufOrHexOrZ32)` · `store.replicate(conn\|isInitiator)` · `store.namespace(name)` · `store.session()` · `await store.createKeyPair(name)` · `await store.ready()` · `await store.close()` | ReadyResource (`opened/closed`) [S] |
| hypercore [R] | via corestore; `new Hypercore(dir, [key], opts)` | `await core.ready()` · `await core.append(block\|[blocks])` → `{length, byteLength}` · `await core.get(i, {wait, timeout})` · `await core.update({wait})` · `core.replicate(isInitiator\|stream)` · `core.session()` · `core.download({start,end})` · `await core.setUserData(k, v)` / `getUserData(k)` · `await core.close()` | `key discoveryKey id length signedLength writable peers` · `on('append'\|'peer-add'\|'peer-remove'\|'close')` |
| hyperbee [R] | `new Hyperbee(core, { keyEncoding:'utf-8'\|'binary'\|'json'\|codec, valueEncoding, extension })` (`extension:false` [S/A]) | `await db.put(k, v, {cas})` · `await db.get(k)` → `null \| {seq,key,value}` · `await db.del(k, {cas})` · `db.createReadStream({gt,gte,lt,lte}, {reverse,limit,keyEncoding})` · `db.peek(range)` · `db.batch()` → `batch.put/get/del`, `await batch.flush()`, `await batch.close()` · `db.createHistoryStream({live,reverse,gte,lt,limit})` · `db.createDiffStream(otherVersion)` · `db.watch(range)` (async-iter of `[current, previous]` snapshots; `watcher.close()`) · `await db.getAndWatch(k)` · `db.snapshot()` · `db.checkout(version)` · `db.sub(prefix)` · `await db.ready()` · `await db.close()` | `version key discoveryKey id core writable readable` |
| autobase [R] | `new Autobase(store, bootstrapKey\|null, { open(store,host), apply(nodes,view,host), close(view), valueEncoding, ackInterval, encryptionKey, encrypt, fastForward, wakeup, optimistic })` | `await base.ready()` · `await base.append(value)` · `await base.update()` · `base.replicate(isInitiator\|stream)` · `base.heads()` · `await base.ack()` · `await base.setUserData(k,v)` / `getUserData(k)` · `await base.close()` (**also closes the Corestore** [S]) · statics `Autobase.getLocalCore(store)` [R], `await Autobase.getLocalKey(store)` [S], `Autobase.isAutobase(core)` [R] | `key discoveryKey id[S] local[S] (local Hypercore → local.key) writable isIndexer view length signedLength encryptionKey activeWriters[S]` · `on('update'\|'writable'\|'unwritable'\|'error'\|'warning'\|'interrupt'\|'fast-forward'\|'is-indexer'\|'is-non-indexer')` |
| autobase apply [R/S] | `apply(nodes, view, host)` | node = `{ value, from: Hypercore (from.key), length, heads, indexed, optimistic }` [S apply-state.js] · `await host.addWriter(key, { indexer:true })` · `await host.removeWriter(key)` · `await host.ackWriter(key)` · `host.interrupt(reason)` · `host.removeable(key)` · `host.key/discoveryKey/id` [S] · AutoStore in `open`: `store.get('name' \| { name, valueEncoding })` (string = name here) | — |
| hyperswarm [R] | `new Hyperswarm({ keyPair, seed, maxPeers, firewall(remotePublicKey), dht, bootstrap[S] })` | `const d = swarm.join(topic32, { server:true, client:true, limit })` · `await d.flushed()` · `await d.refresh({client,server})` · `await d.destroy()` · `await swarm.leave(topic)` · `swarm.joinPeer(noisePk)` / `leavePeer` · `await swarm.flush()` · `await swarm.listen()` · `swarm.status(topic)` · `await swarm.destroy()` [S] · `await swarm.suspend()/resume()` | `on('connection', (socket, peerInfo))` · `on('update')` · `on('ban', peerInfo, err)` · `swarm.connections` (Set) · `swarm.peers` (Map hex→PeerInfo) · `swarm.connecting` · `swarm.dht` · `swarm.keyPair` [S] · `peerInfo.publicKey topics prioritized client[S] ban(bool)` |
| blind-pairing [S] | `new BlindPairing(swarm, { poll })` | `BlindPairing.createInvite(key, { data, expires })` → `{ id, invite(Buffer), seed, publicKey, discoveryKey, additional, expires }` · `BlindPairing.decodeInvite(buf)` → `{ id, seed, discoveryKey, expires, … }` · `BlindPairing.verifyReceipt(receipt, publicKey)` · `pairing.addMember({ discoveryKey, onadd(req) })` → Member (`await m.flushed()`, `await m.close()`) · `pairing.addCandidate({ invite, userData, onadd(auth) })` → Candidate (`c.pairing` promise, `c.paired`, `await c.close()`) · `await pairing.close()` / `suspend()` / `resume()` | MemberRequest `req`: `req.inviteId` · `req.open(invitePublicKey)` → userData · `req.userData` · `req.confirm({ key, encryptionKey, additional })` · `req.deny()` · `req.receipt` — auth = `{ key, encryptionKey, data }` |
| b4a [R] | — | `b4a.from(str\|arr, enc)` `toString(buf, enc)` `alloc(n)` `allocUnsafe(n)` `concat([...])` `equals(a,b)` `compare(a,b)` `isBuffer(x)` `byteLength(str)` `fill copy includes indexOf write` | — |
| z32 [R] | — | `z32.encode(strOrBuf)` → string · `z32.decode(str)` → Buffer (throws if invalid) | — |
| hypercore-id-encoding [R] | — | `encode(key32)` → z32 id · `decode(id\|hex\|'pear://…'\|Buffer)` → Buffer · `normalize(any)` · `isValid(any)` | — |
| hypercore-crypto [R] | — | `keyPair([seed])` `sign(msg, sk)` `verify(msg, sig, pk)` `randomBytes(n)` `discoveryKey(key)` `hash(bufOrArray)`[S] `namespace(name, count)` | — |
| compact-encoding [R] | — | `c.encode(enc, val)` → Buffer · `c.decode(enc, buf)` · encs: `c.json c.string c.uint c.buffer c.fixed32 c.bool c.any c.array(enc) c.from(codec)` | — |
| ready-resource [R] | `class X extends ReadyResource { async _open(){} async _close(){} }` | `await x.ready()` · `await x.close()` | `opened closed opening closing` · emits `'ready'`, `'close'` [S] |
| graceful-goodbye [R] | `goodbye(async () => {...}, position)` (Bare-aware via `bare-process` import map [S]) | `goodbye.exit()` · `goodbye.exiting` | — |
| sub-encoder [R] | `new SubEncoder([prefix, enc])` | `const sub = enc.sub('n')` → pass as `{ keyEncoding: sub }` to `put/get/createReadStream` · `enc.encode(k)` `decode(buf)` `encodeRange(r)` | — |
| protomux [R] | `Protomux.from(stream)` | `mux.createChannel({ protocol, id, messages:[{encoding,onmessage}], onopen, onclose })` · `ch.open()` · `ch.addMessage({encoding,onmessage})` · `m.send(x)` · `mux.pair({protocol,id}, cb)` | — |

## 3. Minimal end-to-end skeleton (SwarmMemory layout)

```js
// src/sync/swarm-store.js — CJS shown; ESM default imports work the same in Bare
const Corestore = require('corestore')            // [R]
const Autobase = require('autobase')              // [R]
const Hyperbee = require('hyperbee')              // [R]
const Hyperswarm = require('hyperswarm')          // [R]
const BlindPairing = require('blind-pairing')     // [S]
const ReadyResource = require('ready-resource')   // [R]
const z32 = require('z32')                        // [R]
const b4a = require('b4a')                        // [R]

const NOTE = 'note'
const end = (p) => p.slice(0, -1) + '"'           // [I] '!'=0x21, '"'=0x22 → [p, end(p)) covers every key with prefix p

function open (store) {                                            // [R] autobase open(store)
  return new Hyperbee(store.get('view'), {                         // [R] AutoStore.get(name); [S/A] extension:false
    extension: false, keyEncoding: 'utf-8', valueEncoding: 'json'
  })
}

async function apply (nodes, view, host) {                         // [R] only place the view changes
  for (const node of nodes) {                                      // [S] node = { value, from, length, heads }
    const op = node.value
    if (!op) continue                                              // [I] defensive (acks are null)
    if (op.op === 'add-writer') { await host.addWriter(b4a.from(op.key, 'hex'), { indexer: true }); continue } // [R]
    if (op.op === 'put-node') {                                    // [I] policy: LWW by `at`, notes never lose to non-notes
      const k = 'n!' + op.node.id
      const prev = await view.get(k)                               // [R] null | { seq, key, value }
      if (prev && prev.value.type === NOTE && op.node.type !== NOTE) continue
      if (prev && prev.value.at > op.at) continue
      await view.put(k, { ...op.node, at: op.at, by: b4a.toString(node.from.key, 'hex') }) // [R] put; [S] from.key
      continue
    }
    if (op.op === 'put-edge') {
      const k = `e!${op.edge.from}!${op.edge.type}!${op.edge.to}`
      const prev = await view.get(k)
      if (prev && prev.value.at > op.at) continue
      await view.put(k, { ...op.edge, at: op.at })
      continue
    }
    if (op.op === 'del-node') {                                    // [I] same protections as put-node
      const k = 'n!' + op.id
      const prev = await view.get(k)
      if (!prev || (prev.value.type === NOTE && !op.force) || prev.value.at > op.at) continue
      await view.del(k)                                            // [R]
    }
  }
}

class SwarmStore extends ReadyResource {                           // [R] ready-resource
  constructor (store, { key = null, encryptionKey = null, swarm = null } = {}) {
    super()
    this.store = store                                             // one Corestore per dir — never open two on the same dir [I]
    this.base = new Autobase(store, key, { open, apply, valueEncoding: 'json', ackInterval: 1000, encryptionKey }) // [R]
    this.swarm = swarm; this.pairing = null; this.member = null
    this.base.on('update', () => this.emit('update'))              // [R] fires after apply → refresh TUI
  }
  get key () { return this.base.key }                              // [R]
  get writerKey () { return this.base.local.key }                  // [S/A] local writer Hypercore
  get view () { return this.base.view }                            // [R]
  get peerCount () { return this.swarm ? this.swarm.connections.size : 0 } // [R] connections is a Set

  async _open () {
    await this.base.ready()                                        // [R]
    if (!this.swarm) {                                             // [A] autopass attaches the handler ONLY on a swarm it created itself;
      this.swarm = new Hyperswarm({ keyPair: await this.store.createKeyPair('hyperswarm') }) // [R][A]
      this.swarm.on('connection', (conn) => this.base.replicate(conn))  // [R] (store.replicate(conn) also valid)
    }                                                              // a swarm handed in by pair() already has store.replicate(conn) wired — never replicate one socket twice
    this.pairing = new BlindPairing(this.swarm)                    // [S]
    this.member = this.pairing.addMember({                         // [S][A]
      discoveryKey: this.base.discoveryKey,
      onadd: (req) => this._onPairRequest(req)
    })
    this.swarm.join(this.base.discoveryKey)                        // [R] default { server:true, client:true }
  }
  async _close () {
    if (this.member) await this.member.close()                     // [S]
    if (this.pairing) await this.pairing.close()                   // [S]
    if (this.swarm) await this.swarm.destroy()                     // [S]
    await this.base.close()                                        // [R]; [S] closes this.store as well
  }

  // writes — all go through append → apply
  putNode (node, at) { return this.base.append({ op: 'put-node', node, at }) }   // [R]
  putEdge (edge, at) { return this.base.append({ op: 'put-edge', edge, at }) }
  delNode (id, at, force = false) { return this.base.append({ op: 'del-node', id, at, force }) }
  addWriter (keyHex) { return this.base.append({ op: 'add-writer', key: keyHex }) }

  // reads — GraphSource { nodes(), edges(), meta() }
  async nodes () { const o = []; for await (const e of this.view.createReadStream({ gte: 'n!', lt: end('n!') })) o.push(e.value); return o } // [R]
  async edges () { const o = []; for await (const e of this.view.createReadStream({ gte: 'e!', lt: end('e!') })) o.push(e.value); return o }
  async meta () { const m = {}; for await (const e of this.view.createReadStream({ gte: 'm!', lt: end('m!') })) m[e.key.slice(2)] = e.value; return m }

  // invite (member side)
  async createInvite () {
    const { invite, publicKey } = BlindPairing.createInvite(this.base.key)      // [S] invite is a Buffer
    await this.base.setUserData('invite-pk', publicKey)            // [R] local-only storage of the invite public key [I]
    if (this.member) await this.member.flushed()                   // [S][A]
    return z32.encode(invite)                                      // [R][A] share this string
  }
  async _onPairRequest (req) {                                     // req = MemberRequest [S]
    const pk = await this.base.getUserData('invite-pk')            // [R] (value comes back as a buffer in practice [I])
    if (!pk) return
    req.open(b4a.isBuffer(pk) ? pk : b4a.from(pk))                 // [S] decrypts + verifies; throws if wrong invite
    const writerKey = req.userData                                 // [S] we send the candidate's local key as userData
    await this.addWriter(b4a.toString(writerKey, 'hex'))
    req.confirm({ key: this.base.key, encryptionKey: this.base.encryptionKey }) // [S][A]
  }

  // join (candidate side) — mirrors Autopass.pair()
  static async pair (store, code) {
    await store.ready()                                            // [S] corestore is a ReadyResource
    const swarm = new Hyperswarm({ keyPair: await store.createKeyPair('hyperswarm') })  // [R][A]
    swarm.on('connection', (conn) => store.replicate(conn))        // [R]
    const pairing = new BlindPairing(swarm)                        // [S]
    const localKey = await Autobase.getLocalKey(store)             // [S] (autopass: getLocalCore → ready → .key → close)
    const sm = await new Promise((resolve, reject) => {
      const candidate = pairing.addCandidate({                     // [S][A]
        invite: z32.decode(code), userData: localKey,
        onadd: async ({ key, encryptionKey }) => {                 // [S] auth = { key, encryptionKey, data }
          const s = new SwarmStore(store, { key, encryptionKey, swarm })
          candidate.close().catch(() => {})
          resolve(s)
        }
      })
      candidate.pairing.then((paired) => { if (!paired) reject(new Error('pairing closed')) }, reject) // [S] resolves null if closed unpaired
    })
    await sm.ready()
    if (!sm.base.writable) await new Promise((res) => {            // [A] wait for our add-writer op to be applied
      const check = () => { if (sm.base.writable) { sm.base.off('update', check); res() } }
      sm.base.on('update', check)
    })
    return sm
  }
}
module.exports = SwarmStore
```

Usage: `const sm = new SwarmStore(new Corestore(dir)); await sm.ready(); console.log(z32.encode(sm.key))`. On restart use the
same call **without** `key`: with `bootstrap === null` Autobase opens the named `local` core and reloads `key` (and
`encryptionKey`) from its user data (`'referrer'`, `'autobase/encryption'`) [S lib/boot.js] — this is why autopass says
"when paired you can simply start the instance again with the normal constructor" [A]. Pass `key` only the first time you
join someone else's base (pairing does it). `ackInterval` default is 10 000 ms [S] (README example uses 1000).

## 4. Bare-specific gotchas

- Bare DOES expose a `Buffer` global (bare-buffer; verified `typeof Buffer === 'function'` under `node_modules/.bin/bare` 1.29.4), but
  holepunch APIs may hand you plain `Uint8Array`s — use `b4a` (`b4a.from/toString/alloc/equals`) everywhere, as every holepunch module does.
- Direct deps in `package.json` are only: autobase, b4a, blind-pairing, corestore, graceful-goodbye, hyperbee, hyperswarm, ready-resource
  (+ bare-*/paparam/pear-runtime/picocolors). `z32`, `hypercore-id-encoding`, `compact-encoding`, `hypercore-crypto`, `sub-encoder`, `protomux`,
  `protomux-wakeup` are **transitive only** — `require`-ing them from `src/` needs B1 to add them to `package.json` (CLAUDE.md rule 3).
- No `fs`/`path`/`os`/`process` builtins: `bare-fs`, `bare-path`, `bare-os`, `bare-process`; no `process.env`, `__dirname` —
  use `Bare.argv`, `Bare.exit`, `os.tmpdir()`, `persistent()` from `bare-storage` (see `bin.mjs`).
- Holepunch packages map Node builtins themselves via `package.json` `"imports": { "events": { "bare": "bare-events" } }`
  (ready-resource, graceful-goodbye do this) — our own code has no such map, so import `bare-events`/`bare-*` explicitly;
  never `require('events'|'stream'|'net'|'crypto')` in `src/`.
- Hyperswarm defaults to the public DHT bootstrap (`Pear.config.dht.bootstrap` in Pear, hardcoded nodes elsewhere) — pass
  `{ bootstrap: [...] }` only for `hyperdht/testnet` in tests.
- Close order: `member.close()` → `pairing.close()` → `swarm.destroy()` → `base.close()`; `base.close()` closes the Corestore.
  Closing twice is a no-op (ReadyResource). Wire SIGINT via `bare-process` `process.on('SIGINT')` (template pattern) or `graceful-goodbye`.
- Hyperbee range on `keyEncoding:'utf-8'`: `{ gte: 'n!', lt: 'n"' }` — there is **no** `prefix` option; or use `sub-encoder`.
- `view.get()` inside `apply` returns the view *as of this apply*; never read/write external state in `apply` (undo/redo).
- `store.get('string')` = open by KEY; `store.get({ name })` = by name. Inside `open(store)` (AutoStore) the string IS the name.
- `corestore` 7 stores in RocksDB: one process per directory; don't open two Corestores on the same dir.

## 5. Things that DO NOT exist (not in README or source — do not write them)

- `base.addWriter()` / `base.removeWriter()` on the Autobase instance → only `host.addWriter()` inside `apply` (append an op).
- `base.view.put()` from outside `apply` (view is read-only for you; writes must be ops) · `base.get()` / `base.put()`.
- `new Autobase({ store, … })` object-form ctor · `base.localWriter.key` (private; use `base.local.key`) · `base.writers` (use `base.activeWriters` [S]).
- `swarm.announce()` / `swarm.lookup()` (v2) · `swarm.on('peer')` · `swarm.join(topicString)` (topic must be a 32-byte buffer) · `swarm.connect(pk)` (use `joinPeer`).
- `db.createReadStream({ prefix })` · `db.list()` / `db.entries()` / `db.keys()` / `db.getAll()` · `db.put` returning the entry (it returns nothing useful) · `db.watch()` on a `sub`/checkout (throws: "Can only watch the main bee instance").
- `store.get('view-name')` expecting a NAME on a real Corestore (string = key) · `store.createCore()` · `store.namespace()` returning a different storage dir (same dir, different key derivation).
- `BlindPairing.pair()` · `pairing.invite()` / `pairing.createInvite()` as instance methods (static `BlindPairing.createInvite`) · `candidate.accept()` · `member.confirm()` (confirm is on the `req` passed to `onadd`) · invite as a plain string (it's a Buffer → `z32.encode`).
- `Hypercore#append` returning the block index alone (returns `{ length, byteLength }`) · `core.on('update')` (use `'append'`) · `core.keys`.
- `require('autopass')` in this repo — it is NOT installed (uses hyperdb/hyperdispatch/hyperschema); copy its pattern, not its import.
- `z32.encode(buf).toString('hex')` confusions: z32 gives a 52-char string for 32 bytes; `hypercore-id-encoding.decode` accepts z32, hex and `pear://` links.
