# sub-encoder 2.1.3 — verified API (README)

Key-encoding objects that prefix keys so one Hyperbee holds several namespaces (alternative to `db.sub()`, and the only one
that still allows `db.watch({ range })` scoping via ranges).

```js
const SubEncoder = require('sub-encoder')
const enc = new SubEncoder([prefix, encoding])  // optional initial prefix (string | Buffer)
const subA = enc.sub('sub-a')                     // nested: subA.sub('x')
const subB = enc.sub('sub-b', 'binary')           // custom key encoding per sub
await bee.put('a1', 'a1', { keyEncoding: subA })
await bee.get('a1', { keyEncoding: subA })
for await (const node of bee.createReadStream({ keyEncoding: subA })) {}          // everything in A
for await (const node of bee.createReadStream({ lt: 'b2' }, { keyEncoding: subB })) {} // ranges encoded too
enc.encode(key) / enc.decode(buf) / enc.encodeRange(range)
```
For SwarmMemory the keys `n!…`, `e!…`, `m!…` are already prefixed strings; plain `{ gte: 'n!', lt: 'n"' }` ranges with
`keyEncoding: 'utf-8'` are enough. Use sub-encoder only if you want clean `watch` ranges per namespace.
