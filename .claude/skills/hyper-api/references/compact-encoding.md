# compact-encoding 3.2.0 — verified API (README)

```js
const c = require('compact-encoding')
const buf = c.encode(c.json, { a: 1 })      // helper: encode to a new Buffer
const val = c.decode(c.json, buf)           // helper: decode from a Buffer
// low level: const state = c.state(); enc.preencode(state, v); state.buffer = b4a.allocUnsafe(state.end); enc.encode(state, v); state.start = 0; enc.decode(state)
```

Encoder objects have `preencode(state, v)`, `encode(state, v)`, `decode(state)`; `state = { start, end, buffer }`.

Bundled encodings (most useful): `c.raw`, `c.uint`, `c.uint8/16/24/32/64`, `c.int`, `c.bool`, `c.string`/`c.utf8`,
`c.string.fixed(n)`, `c.ascii`, `c.hex`, `c.base64`, `c.buffer` (length-prefixed; decodes empty as `null`), `c.raw.buffer`,
`c.fixed32`, `c.fixed64`, `c.fixed(n)`, `c.array(enc)`, `c.json`, `c.ndjson`, `c.any` (self-describing JSON+buffers),
`c.date`, `c.float64`, `c.bigint`, `c.port`, `c.ipv4`, `c.ip`, `c.none`, `c.from(codec)` (wrap a codecs/abstract-encoding).

Where it shows up: `valueEncoding` of Hypercore/Hyperbee/Autobase accepts a compact-encoding instance; protomux message
`encoding`; blind-pairing encodes invites with it (`BlindPairing.Invite`). In SwarmMemory `valueEncoding: 'json'` strings
are enough — no schema needed.
Not in README: `c.encode(value)` without an encoding, `c.object(...)`, `c.struct(...)` (those are hyperschema).
