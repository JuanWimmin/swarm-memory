# hypercore-id-encoding 1.3.0 — verified API (README + index.js)

```js
const { encode, decode, normalize, isValid } = require('hypercore-id-encoding')
encode(key32)        // Buffer(32) → z32 string (52 chars); throws if not a 32-byte Buffer
decode(id)           // z32 (52 chars) | hex (64 chars) | 'pear://<id>[/...]' | Buffer(32) → Buffer(32); throws 'Invalid Hypercore key'
normalize(any)       // decode → encode: always a z32 id
isValid(any)         // boolean
```
Use for CLI input (`swarm-memory join <key-or-pear-link>`): `const key = decode(arg)`.
Not in README: `encode(hexString)`, `decode` of a 44-char base64 id.
