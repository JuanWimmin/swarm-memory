# hyperbee 2.27.3 — verified API

Source: `node_modules/hyperbee/README.md` ([R]); `index.js` ([S]). Append-only B-tree on a Hypercore; sorted iteration.

## Constructor [R]
```js
const db = new Hyperbee(core, {
  keyEncoding: 'binary',   // 'binary' (default) | 'utf-8' | 'ascii' | 'json' | abstract-encoding / compact-encoding
  valueEncoding: 'binary', // same choices
  extension: true          // [S] pass false to disable the lookup extension (autopass does this for autobase views)
})
```
Read/diff streams sort by the **encoded** key bytes.

## Props [R]
`db.core`, `db.version` (number of modifications), `db.id` (z32), `db.key`, `db.discoveryKey`, `db.writable`, `db.readable`.
Call `await db.ready()` before reading sync props.

## Write
| call | tag | notes |
|---|---|---|
| `await db.put(key, [value], { cas(prev, next) })` | R | `cas` returns true to write |
| `await db.del(key, { cas(prev) })` | R | |
| `const b = db.batch()` | R | atomic; `await b.put(k, v, opts)`, `await b.get(k)`, `await b.del(k, opts)`, `await b.flush()` (commit), `await b.close()` (abort) |

## Read
| call | tag | returns |
|---|---|---|
| `await db.get(key, { keyEncoding, valueEncoding })` | R (opts [S `_getEncoding`]) | `null` or `{ seq, key, value }` |
| `await db.getBySeq(seq)` | R | `{ key, value }` or null |
| `db.createReadStream([range], [opts])` | R | async-iterable of `{ seq, key, value }`; `range = { gt, gte, lt, lte }`; `opts = { reverse, limit, keyEncoding, valueEncoding }` (`keyEncoding` opt [S], used by sub-encoder) |
| `await db.peek([range], [opts])` | R | first entry of that stream |
| `db.createHistoryStream({ live, reverse, gte, gt, lte, lt, limit })` | R | entries + `type: 'put' \| 'del'`; negative bounds are relative to current version |
| `db.createDiffStream(otherVersion, opts)` | R | `{ left, right }` |
| `db.watch([range])` | R | async-iterable yielding `[current, previous]` snapshots; `await watcher.ready()`, `await watcher.close()`; **throws on subs/checkouts** ("Can only watch the main bee instance") [S] |
| `await db.getAndWatch(key, opts)` | R | `watcher.node`, `watcher.on('update')`, `await watcher.close()` |
| `db.checkout(version)` / `db.snapshot()` | R | read-only views |
| `db.sub('prefix', { sep, keyEncoding, valueEncoding })` | R | namespaced bee (keys `prefix + sep + key`); cannot watch |
| `await db.getHeader()` / `await Hyperbee.isHyperbee(core)` | R | |
| `db.update(opts)` | S | = `core.update(opts)` |
| `db.replicate(isInitiatorOrStream)` | R | |
| `await db.close()` | R | closes core too |

## Prefix scans without a `prefix` option
There is no `prefix` option. With `keyEncoding: 'utf-8'` use `{ gte: 'n!', lt: 'n"' }` (`'"'` is the char after `'!'`) [I], or
use `sub-encoder`:
```js
const SubEncoder = require('sub-encoder')
const enc = new SubEncoder()
const nodes = enc.sub('n')
await db.put('contract/payroll', {...}, { keyEncoding: nodes })
for await (const e of db.createReadStream({}, { keyEncoding: nodes })) {}
```

## SwarmMemory layout (TEAM_PLAN §4.3)
`n!<id>` → node JSON · `e!<from>!<type>!<to>` → edge JSON · `m!<k>` → meta. Write only from `apply()`.
