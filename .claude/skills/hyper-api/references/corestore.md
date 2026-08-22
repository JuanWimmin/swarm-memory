# corestore 7.11.0 — verified API

Source: `node_modules/corestore/README.md` ([R]); `index.js` ([S]). Hypercore factory: key derivation by name, sessions,
RocksDB-backed storage, namespaces. `class Corestore extends ReadyResource` [S].

## Constructor [R]
```js
const store = new Corestore(storage, { primaryKey: null, writable: true })
// storage: a directory path string or a hypercore-storage instance
```

## Methods
| call | tag | notes |
|---|---|---|
| `store.get({ name: 'x', ...hypercoreOpts })` | R | derive a writable core by name |
| `store.get(keyBuffer \| 'hex' \| 'z32')` / `store.get({ key })` | R | load by key (read-only unless we own it); a **string arg is a key, not a name** [S] |
| `store.get({ name, valueEncoding, encryption, keyPair, active, exclusive, wait, timeout })` | S | forwarded to Hypercore |
| `const stream = store.replicate(isInitiator \| stream, opts)` | R | replicates all loaded cores; pass the hyperswarm socket |
| `store.session(opts)` | R | new Corestore session (closing it closes its cores) |
| `store.namespace(name)` | R | namespaced session; chainable; same dir, different derived keys |
| `store.list(namespace)` | R | stream of discovery keys |
| `store.watch(fn)` / `store.unwatch(fn)` | R | new cores opened |
| `await store.createKeyPair(name, ns)` | R | deterministic keypair from primary key (autopass: `'hyperswarm'`) |
| `await store.suspend()` / `await store.resume()` | R | |
| `await store.ready()` | S (ReadyResource) | autopass awaits it before `createKeyPair` |
| `await store.close()` | R | |
| `store.notifyGroup(topic)` | R (experimental) | |

## Replication via Hyperswarm [R]
```js
const swarm = new Hyperswarm()
swarm.join(topic)
swarm.on('connection', (connection) => store.replicate(connection))
```
Corestore replication is all-to-all for loaded cores; the remote must already know the key (capability) — keys are never
exchanged by corestore itself.

## Gotchas
- One Corestore per directory per process (RocksDB). Create it once and pass it to Autobase / SwarmStore.
- `Autobase#close()` calls `store.close()` on the store you gave it [S autobase/index.js _close].
- Inside autobase `open(store)` the argument is an **AutoStore**, where `store.get('view')` (string) means *name* [S autobase/lib/store.js].
