# hypercore 11.33.1 — verified API (subset relevant to SwarmMemory)

Source: `node_modules/hypercore/README.md` ([R]). You rarely construct one directly — get them from Corestore / AutoStore.

## Constructor [R]
`new Hypercore(storage, [key], { createIfMissing, overwrite, valueEncoding: 'json'|'utf-8'|'binary'|compactEncoding, keyPair,
encryption: { key }, writable, userData, manifest, preload, key, storage, timeout, onwait })`

## Props [R] (populated after `ready`)
`core.key` (Buffer) · `core.discoveryKey` · `core.id` (z32) · `core.keyPair` · `core.length` · `core.signedLength` ·
`core.contiguousLength` · `core.byteLength` · `core.fork` · `core.writable` · `core.readable` · `core.peers` (array) · `core.padding`

## Methods [R]
| call | returns / notes |
|---|---|
| `await core.ready()` | |
| `await core.append(block \| [blocks], { writable, maxLength, keyPair, signature })` | `{ length, byteLength }` |
| `await core.get(index, { wait: true, timeout: 0, valueEncoding, decrypt, raw })` | block; resolves `null` when `wait: false` and the block is not local [S `_get` → `return null`]; rejects on `timeout` / closed session |
| `await core.has(start, [end])` | boolean |
| `await core.update({ wait: false, force })` | boolean updated; use `core.findingPeers()` or `{ wait: true }` to block |
| `core.createReadStream({ start, end, live, snapshot })` | async iterable |
| `core.createByteStream(...)`, `core.createWriteStream()` | |
| `const range = core.download({ start, end, blocks, linear })` → `await range.done()` / `range.destroy()` | `{ start: 0, end: -1 }` = non-sparse |
| `await core.clear(start, [end])`, `await core.truncate(newLength)` | |
| `await core.treeHash([length])`, `await core.info({ storage })` | |
| `core.session({ weak, exclusive, checkout, atom, name })`, `core.snapshot()` | must close sessions |
| `core.replicate(isInitiator \| stream, opts)` | pipe to peer; Hyperswarm: pass the socket |
| `core.findingPeers()` → `done()` | hint for `update()` |
| `await core.setUserData(key, value)` / `await core.getUserData(key)` | local KV, not replicated; key string, value string/buffer |
| `core.setActive(bool)` | |
| `await core.close({ error })` | |
| statics: `Hypercore.key(manifest)`, `Hypercore.discoveryKey(key)`, `Hypercore.getProtocolMuxer(stream)`, `Hypercore.createProtocolStream(isInitiator, opts)`, `Hypercore.MAX_SUGGESTED_BLOCK_SIZE` | |

## Events [R]
`'ready'`, `'close'`, `'append'`, `'truncate' (ancestors, forkId)`, `'peer-add'`, `'peer-remove'`, `'upload'`, `'download'`,
`'remote-contiguous-length'`.

## Not in README
`core.on('update')`, `core.keys`, `core.put` — do not use.
