# Sync spike (B1, TEAM_PLAN §3 / §5 B1 #3) — decision: **Plan B**

> Timebox result, 2026-08-22. Hand-rolled **Autobase 7 + Hyperbee view + blind-pairing**, using
> `autopass@3.4.1` only as the code reference. Prototype verified end-to-end on **Node 25** and on
> **Bare 1.29.4** (`node_modules/.bin/bare`) against the deps already installed in this repo.
> Reference prototype: [`docs/spike/planb-spike.js`](./spike/planb-spike.js) (not shipped; seed for `src/sync/`).

## 1. Decision: Plan B — why

- **Zero new deps.** Everything Plan B needs is already in `package.json`/lockfile and hoisted in
  `node_modules`: `autobase@7.28.1`, `corestore@7.11.0`, `hyperbee@2.27.3`, `hyperswarm@4.17.0`,
  `blind-pairing@2.3.1`, `ready-resource`, `b4a` (+ transitive `z32@1.1.0`, `protomux-wakeup@2.9.0`).
  Plan A would add **8 packages** not in our tree: `autopass blind-encryption-sodium blind-peer-encodings
  blind-peering hyperdb hyperdispatch protomux-rpc xor-distance` (rule 3: no new deps).
- **Our merge policy is not expressible in autopass.** `Autopass._apply` is hard-wired
  (`autopass/index.js:219-224`) and `@autopass/put` is a blind `view.insert` (`index.js:167-169`); the
  record schema is `{key:string, value:string, file:buffer}` (`autopass/schema.js:9-28`) — no `at`, no
  `type`. LWW-by-`at` + "never let a scan overwrite a `note`" would mean overriding the generated
  dispatch router and JSON-in-a-string records. Plan B's `apply()` is ~40 lines and does exactly the spec.
- **No prefix queries in the public API.** `pass.list()` ignores its argument and returns every record
  (`index.js:292-294`). Range queries exist only by reaching into `pass.base.view.find(...)` (hyperdb
  README lines 137-150). A plain Hyperbee gives us `createReadStream({gte:'n!', lt:'n"'})` directly
  for the frozen `n!`/`e!`/`m!` layout (hyperbee README lines 233-257).
- **Same native-addon surface either way, and it is already proven.** Both plans sit on Corestore 7 →
  `hypercore-storage` → `rocksdb-native`. Those addons (`rocksdb-native`, `sodium-native`, `udx-native`,
  `fs-native-extensions`) are **already bundled by the untouched OTA template** (`hello-pear-worker` depends
  on `corestore` + `hyperswarm`; `pear-runtime-updater` on `hyperdrive`), so `out/win32-x64/swarm-memory.exe`
  already ships them. Plan B adds **no** new native addon. Plan A's `hyperdb` requires `rocksdb-native`
  at top level (`hyperdb/index.js:6`) even when using `HyperDB.bee` — same addon, but more JS.
- **Measured**: pair + become-writer in ~130 ms on a local DHT testnet, full scenario (2 peers, LWW,
  note protection, reopen-from-disk) in ~600 ms on both Node and Bare (independent re-run under Bare
  1.29.4, 2026-08-22: pair 197 ms, total 744 ms, all assertions `true` — numbers vary run to run). Estimated `src/sync/` size:
  **~250 LOC** (prototype is 350 incl. test harness).

## 2. What autopass 3.4.1 actually is (facts, file:line)

| Question | Answer |
|---|---|
| Constructor | `new Autopass(corestore, { key, encryptionKey, swarm, wakeup, bootstrap, replicate, relayThrough, blindEncryption })` — `index.js:144-193`, boots `new Autobase(store, key, { encrypt:true, encryptionKey, open(){ HyperDB.bee(store.get('view'), db, {extension:false, autoUpdate:true}) }, apply })` — `index.js:196-217` |
| KV API | `add(key, value, file)` → op `@autopass/put` (`:375-380`); `get(key)` → `{value,file}` (`:296-302`); `remove(key)` (`:382-384`); `list()` = all records, **no prefix/range** (`:292-294`) |
| Invites | `createInvite({readOnly})` = `BlindPairing.createInvite(base.key, {data})`, record appended as `@autopass/add-invite` and returned `z32.encode(invite)` (`:260-282`); `deleteInvite()` (`:284-290`) |
| Pairing | `Autopass.pair(store, invite, opts)` → `AutopassPairer` (`:22-141`): `BlindPairing(swarm).addCandidate({invite: z32.decode(inv), userData, onadd(result){ new Autopass(store, {key: result.key, encryptionKey: result.encryptionKey, swarm, wakeup}) }})` (`:65-93`); `finished()` (`:135-140`) resolves once `base.writable` via `_whenWritable` (`:100-109`) |
| Member side | `pairing.addMember({discoveryKey: base.discoveryKey, onadd(candidate){ lookup invite by candidate.inviteId; candidate.open(inv.publicKey); addWriter(userData.key); candidate.confirm({key, encryptionKey}) }})` — `:343-364` |
| Writers | `addWriter({key,name,readOnly})` op → `host.addWriter(key)` (indexer by default) (`:162-165`, `:312-317`); `removeWriter`, `listWriters`, `getWriter`, `writerKey = base.local.key` (`:240-242`) |
| Events | `on('update')` forwarded from `base.on('update')` (`:214-216`) |
| Encryption | Autobase `encrypt:true` → encryptionKey auto-generated, handed to joiners in the pairing `confirm` (`:200-203`, `:356-360`) |
| Apply/merge policy | **Fixed**. `_apply` dispatches every node through the generated router (`:219-224`); `put` = unconditional insert. Override requires re-registering the handler on the generated `Router` (`spec/hyperdispatch/index.js:23-31`) — hack |
| Storage engine | `HyperDB.bee(...)` (Hyperbee-backed, P2P) — **not** rocks — `index.js:205`. But `hyperdb/index.js:6` still `require('./lib/engine/rocks.js')` → `rocksdb-native` loads |
| Bare compat | Uses `imports` maps everywhere: `autopass/package.json` `fs→bare-fs, process→bare-process`; same pattern in `hypercore-storage` (fs/os/path), `hyperdb` (fs/path), `hyperbee`/`hyperswarm` (process), `hypercore`/`corestore`/`autobase`/`ready-resource`/`blind-pairing-core` (events→bare-events), `rocksdb-native` (crypto→bare-crypto). `grep` over autopass + first-level deps: **no** `process.env`, **no** `node:` imports |
| Native addons in its tree | `rocksdb-native 3.17.4`, `sodium-native 5.1.0`, `udx-native 1.21.1`, `quickbit-native 2.4.8`, `simdle-native 1.3.9`, `fs-native-extensions 1.5.0` (+ `bare-fs/-path/-url/-type/-inspect`). **All Holepunch**, all CMake + shipped `prebuilds/` for 13 targets (darwin/linux/win32 x64+arm64, android, ios). **No `binding.gyp`, nothing outside the bare/holepunch ecosystem.** |

## 3. `src/sync/` — module API we expose (B1)

```js
// src/sync/index.js  (CJS; runs on Bare; deps: corestore autobase hyperbee hyperswarm blind-pairing
//                      protomux-wakeup ready-resource z32 b4a — all already installed)
const SwarmStore = require('./store')   // class below
module.exports = { SwarmStore }
```

```js
class SwarmStore extends ReadyResource {
  // open existing/new base in <dir>; if `invite` → pair first (returns when writable)
  static async open(dir, { key = null, invite = null, name = 'anon', bootstrap = null } = {})
  static pair(dir, inviteCode, opts)          // low-level: returns pairer; await pairer.finished()

  await ready() / await close()
  key            // Buffer — autobase key (id = z32 for display)
  writable       // base.writable
  peers          // swarm.connections.size
  on('update')   // after every apply (forwarded from base)

  // writes (ops appended to our local writer core; `at` = lamport clock, monotonically bumped)
  putNode(node, { at, source = 'scan' })      // source: 'scan' | 'human'
  putEdge(edge, { at, source })
  delNode(id,   { at, source })
  putMeta(key, value, { at })

  // GraphSource contract (TEAM_PLAN §4.3 layout):  n!<id>  e!<from>!<type>!<to>  m!<k>
  async nodes()  // [{ id, type, label, summary, severity, data, at, by, source }]
  async edges()  // [{ from, to, type, at, by, source }]
  async meta()   // { project, ... }   (+ the CLI adds generatedAt/source/peers)

  async createInvite()  // z32 string (~106 chars); stored in view as i!<id> so ANY online member can admit
}
```

### Boot (verified — `docs/spike/planb-spike.js:85-97`)

```js
this.base = new Autobase(store, key /* null for new, or existing key */, {
  valueEncoding: 'json',
  encrypt: true, encryptionKey,                  // autobase README: encrypt / encryptionKey
  wakeup,                                        // reuse the pairer's ProtomuxWakeup (autopass pattern)
  open(store) { return new Hyperbee(store.get('view'), { keyEncoding: 'utf-8', valueEncoding: 'json' }) },
  apply
})
this.base.on('update', () => this.emit('update'))
// replication (autopass index.js:334-341 / 364):
swarm = new Hyperswarm({ keyPair: await store.createKeyPair('hyperswarm'), bootstrap })
swarm.on('connection', (conn) => base.replicate(conn))
swarm.join(base.discoveryKey)
```

Reopen later with `key = null`: Autobase restores the bootstrap from the local core's user data
(autopass README "When paired you can simply start the instance again with the normal constructor";
verified: spike step [10] `sameKey true`).

### Ops + apply policy (verified — `planb-spike.js:19-71`)

```js
// ops (JSON): {op:'put-node', node, at, by, source} | {op:'put-edge', edge, at, by, source}
//             {op:'del-node', id, at, by, source}  | {op:'put-meta', key, value, at}
//             {op:'add-writer', key(hex), name}    | {op:'add-invite', id, invite, publicKey, expires} | {op:'del-invite', id}
function shouldOverwrite(prev, op) {
  if (!prev) return true
  if (prev.type === 'note' && op.source === 'scan') return false   // humans win over scanners, always
  return op.at >= prev.at                                          // LWW by lamport `at` (tie → later in linearized order)
}
async function apply(nodes, view, host) {
  for (const { value: v } of nodes) {
    switch (v.op) {
      case 'add-writer': await host.addWriter(b4a.from(v.key, 'hex'), { indexer: true }); break
      case 'put-node': { const k = 'n!' + v.node.id; const prev = await view.get(k)
        if (shouldOverwrite(prev && prev.value, v)) await view.put(k, { ...v.node, at: v.at, by: v.by, source: v.source }); break }
      case 'put-edge': { const e = v.edge; const k = `e!${e.from}!${e.type}!${e.to}`; const prev = await view.get(k)
        if (shouldOverwrite(prev && prev.value, v)) await view.put(k, { ...e, at: v.at, by: v.by, source: v.source }); break }
      case 'del-node': { const k = 'n!' + v.id; const prev = await view.get(k)
        if (shouldOverwrite(prev && prev.value, v)) await view.del(k); break }
      case 'put-meta':   await view.put('m!' + v.key, { value: v.value, at: v.at }); break
      case 'add-invite': await view.put('i!' + v.id, { invite: v.invite, publicKey: v.publicKey, expires: v.expires }); break
      case 'del-invite': await view.del('i!' + v.id); break
      default: break // unknown op from a newer peer → ignore (forward compatible, no host.interrupt)
    }
  }
}
```

Deterministic by construction (only reads/writes `view`), so Autobase undo/reapply on reorder is safe
(autobase README "IMPORTANT" note). Spike assertions: `note protected: true`, `stale scan rejected: true`,
`A==B view: true`.

### Invite / join (verified — member `planb-spike.js:104-136`, invite `:139-150`, pairer `:187-270`)

```js
// inviter (any writer):
const { id, invite, publicKey, expires } = BlindPairing.createInvite(base.key)   // blind-pairing-core index.js:325-362
await base.append({ op: 'add-invite', id: hex(id), invite: hex(invite), publicKey: hex(publicKey), expires })
return z32.encode(invite)                                                         // 106 chars
// member (runs in every live SwarmStore):
pairing = new BlindPairing(swarm)
member = pairing.addMember({ discoveryKey: base.discoveryKey, async onadd (candidate) {
  const inv = await base.view.get('i!' + hex(candidate.inviteId)); if (!inv) return
  candidate.open(b4a.from(inv.value.publicKey, 'hex'))
  const { key, name } = JSON.parse(b4a.toString(candidate.userData))
  await base.append({ op: 'add-writer', key, name })
  candidate.confirm({ key: base.key, encryptionKey: base.encryptionKey })
  await base.append({ op: 'del-invite', id: hex(candidate.inviteId) })            // single-use
}})
// joiner:
const core = Autobase.getLocalCore(store); await core.ready(); const key = hex(core.key); await core.close()
pairing.addCandidate({ invite: z32.decode(code), userData: b4a.from(JSON.stringify({ key, name })),
  async onadd (result) { /* new SwarmStore(store, { swarm, wakeup, key: result.key, encryptionKey: result.encryptionKey }) */ } })
// resolve when base.writable (autopass index.js:100-109)
```

**CLI consequence:** pairing needs a *live* member. `swarm-memory invite` must keep running
("waiting for peer… Ctrl+C") or any running `resume --watch`/`peers` process admits the joiner.
`swarm-memory join <code>` blocks until writable, then exits (store reopens with `key=null`).

## 4. Risk register + fallback

| Risk | Mitigation |
|---|---|
| Public-DHT pairing slower than testnet (blind-pairing polls mutable records; direct channel when connected) | Tested 130 ms on testnet only. Expect seconds on the real DHT; `join` prints progress. Both machines on the same hotspot for the video. |
| Autobase fights at 2 AM (reorder/ack edge cases) | Default `ackInterval` 10 s (autobase index.js:43) — keep defaults as autopass does. **Fallback = single-writer replica** (below), GraphSource contract unchanged. |
| Native addons in `bare-build` | Already exercised: the template's updater bundles the same `rocksdb-native`/`udx-native`/`sodium-native`; `out/win32-x64/swarm-memory.exe` exists. Re-run `npm run make` + `pear install` after `src/sync` lands (ritual). |
| `z32` / `protomux-wakeup` are transitive | Hoisted today; add them explicitly to `package.json` deps (same versions already in lockfile → no new tree) when B1 touches package.json. |
| Key-name collisions in `e!<from>!<type>!<to>` | ids are `<type>/<slug>` (no `!`) per §4.1 — validate in `putEdge`. |

### Fallback: single-writer Hyperbee replica (read-only peers) — verified APIs only

```js
// writer
const store = new Corestore(dir); const bee = new Hyperbee(store.get({ name: 'graph' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
await bee.ready(); swarm.on('connection', (c) => store.replicate(c)); swarm.join(bee.discoveryKey)
await bee.put('n!contract/payroll', node)           // same n!/e!/m! layout, same GraphSource reader
// reader (joins with bee.key instead of an invite)
const bee = new Hyperbee(store.get(key), { keyEncoding: 'utf-8', valueEncoding: 'json' })   // corestore README: store.get(key)
swarm.on('connection', (c) => store.replicate(c)); swarm.join(bee.discoveryKey); await bee.core.update()  // hypercore README: core.update()
for await (const e of bee.createReadStream({ gte: 'n!', lt: 'n"' })) …
```

## 5. How the spike was run (reproducible)

```sh
# Node (autopass tree, scratchpad):  node planb-spike.js
# Bare (this repo's exact deps):     <scratch>/bare-spike/node_modules = junction -> C:/SwarmMemory/node_modules
C:/SwarmMemory/node_modules/.bin/bare planb-spike.js
# [5] B paired+writable in 127 ms; key match true writable true
# [8] note protected: true | stale scan rejected: true | A==B view: true
# [10] B reopened from disk (no key given): sameKey true writable true nodes 3 encryptionKey persisted true
# [done] total 600 ms
# reviewer re-run (Bare 1.29.4, same command): [4] invite 106 chars · [5] 197 ms · [8] all true · [10] all true · [done] 744 ms
```
