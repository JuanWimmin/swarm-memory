# autobase 7.28.1 — verified API

Source of truth: `node_modules/autobase/README.md` ([R]) and `node_modules/autobase/index.js` + `lib/` ([S]).

## Constructor [R]

```js
const base = new Autobase(store, bootstrap, opts)
```
- `store`: a Corestore (or namespace/session of one).
- `bootstrap`: `base.key` of an existing base, or `null`/omit. With `null`, boot opens the named core `'local'` and, if it has
  user data `'referrer'`, reloads that base key + `'autobase/encryption'` [S lib/boot.js]. Passing an object as 2nd arg is treated
  as `opts` [S].
- `opts` [R]:
  ```js
  {
    open: (store, host) => view,          // build the view from the AutoStore (string name or { name, valueEncoding })
    apply: async (nodes, view, host) => {}, // deterministic; only mutate `view`
    close: async (view) => {},            // close the view
    valueEncoding,                        // 'json' | 'binary' | 'utf-8' | compact-encoding; default 'binary' [S]
    ackInterval: 1000,                    // auto-ack (appends null nodes to merge forks); default 10_000 ms [S]
    optimistic: false,                    // allow non-writers to append { optimistic: true } blocks (must ackWriter in apply)
    encryptionKey: Promise<Buffer>|Buffer, encrypt: false, encrypted: false,
    fastForward: true,                    // or { key: base.core.key }
    wakeup: new ProtomuxWakeup(),         // default is created internally [S]
    bigBatches: false
  }
  ```

## Instance properties
| prop | tag | meaning |
|---|---|---|
| `base.key` | R | primary key (Buffer 32) — share this to let peers load the base |
| `base.discoveryKey` | R | swarm topic |
| `base.id` | S | z32 id of the bootstrap core |
| `base.local` | S (used in README example `local.local.key`) | the local writer Hypercore; `base.local.key` is the key to hand to `host.addWriter` |
| `base.writable` | R | local core is an accepted writer |
| `base.isIndexer` | R | |
| `base.view` | R | whatever `open()` returned |
| `base.length`, `base.signedLength` | R | system core lengths (not view length) |
| `base.encryptionKey` | S | resolved encryption key (null if unencrypted) |
| `base.activeWriters` | S lib/active-writers.js | `size`, iterable (writer objects with `.core.key`), `get(key)`, `has(key)` |
| `base.paused` | R | |
| `base.core` | S | the `_system` view core |

## Methods
| call | tag | notes |
|---|---|---|
| `await base.ready()` | R (ReadyResource) | |
| `await base.append(value, { optimistic })` | R | value encoded with `valueEncoding`; arrays append a batch; returns new local length [S]; throws `'Not writable'` if not a writer [S] |
| `await base.update()` | R | fetch available data, run linearizer/apply |
| `await base.ack(bg = false)` | R | indexers only |
| `base.replicate(isInitiator \| stream, opts)` | R | = `store.replicate(...)` + wakeup stream [S]; README example uses `store.replicate(connection)` |
| `base.heads()` | R | `[{ key, length }]` |
| `await base.pause()` / `resume()` | R | |
| `await base.setUserData(k, v)` / `await base.getUserData(k)` | R | `k` string, `v` string or buffer; stored on the local/bootstrap core, **not replicated** |
| `await base.hash()` | R | |
| `base.setBigBatches(bool)` | R | |
| `base.views()` | S | |
| `await base.close()` | R | **also closes the Corestore passed in** (`await this.store.close()`) [S] |
| `Autobase.getLocalCore(store, handlers, encryptionKey)` | R | local core session (name `'local'`); autopass does `core.ready(); key = core.key; core.close()` |
| `await Autobase.getLocalKey(store, opts)` | S | same, returns the key directly |
| `Autobase.getUserData(core)` → `{ referrer, view }` | R | |
| `await Autobase.isAutobase(core, opts)` | R | |

## Events [R]
`'update'` (after apply), `'writable'`, `'unwritable'`, `'is-indexer'`, `'is-non-indexer'`, `'interrupt' (reason)`,
`'fast-forward' (to, from)`, `'warning'`, `'error'`.

## apply(nodes, view, host)
- `nodes[i]` = `{ indexed, optimistic, from: <Hypercore>, length, value, heads }` [S lib/apply-state.js]. So `node.value` (decoded
  with valueEncoding), `node.from.key` (writer key Buffer), `node.length` (seq in that writer). `null` ack nodes are not meaningful
  values — guard `if (!value) continue`.
- `host` (AutobaseHostCalls) [R]: `await host.addWriter(key, { indexer = true })`, `await host.removeWriter(key)` (throws if
  not removeable), `await host.ackWriter(key)`, `host.interrupt(reason)`, `host.removeable(key)`; plus `host.key`,
  `host.discoveryKey`, `host.id` [S lib/apply-calls.js].
- Rules [R]: view must be derived only from `store` in `open`; in `apply` only mutate `view`; no external state (undo/redo on
  reorder).

## open(store, host)
AutoStore [R]: `store.get(name)` or `store.get({ name, valueEncoding })` → Hypercore session. String argument IS the name
(unlike a real Corestore where a string is a key). Typical Hyperbee view (docs pattern + autopass):
```js
open (store) {
  return new Hyperbee(store.get('view'), { extension: false, keyEncoding: 'utf-8', valueEncoding: 'json' })
}
```
`extension: false` is what autopass passes (`HyperDB.bee(store.get('view'), db, { extension: false, autoUpdate: true })`); the
Hyperbee ctor honours `opts.extension !== false` [S hyperbee/index.js:413].

## Replication snippet [R]
```js
const swarm = new Hyperswarm()
swarm.join(base.discoveryKey)
swarm.on('connection', (connection) => store.replicate(connection)) // or base.replicate(connection)
```
