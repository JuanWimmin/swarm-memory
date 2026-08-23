# hypercore-crypto 3.7.0 — verified API (README [R] + index.js [S])

```js
const crypto = require('hypercore-crypto')
crypto.keyPair([seed32])               // [R] ed25519 { publicKey, secretKey }; seed arg [S]
crypto.sign(message, secretKey)         // [R] → signature
crypto.verify(message, signature, publicKey) // [R] → boolean
crypto.randomBytes(n)                   // [R] → Buffer
crypto.discoveryKey(publicKey32)        // [R] → 32-byte hash usable as swarm topic (throws if not 32 bytes [S])
crypto.hash(bufferOrArrayOfBuffers, [out]) // [S] blake2b generic hash (32 bytes)
crypto.namespace(name, count)           // [R] → array of `count` 32-byte namespaces
crypto.data(buf), crypto.parent(a, b), crypto.tree(peaks) // [R] merkle helpers
crypto.validateKeyPair(kp), crypto.encryptionKeyPair(seed), crypto.encrypt/decrypt // [S] (sealed boxes)
```
Blind-pairing derives all its tokens with `crypto.hash([NS, ...])` and `crypto.keyPair(seed)`; you normally do not need
this module directly — Corestore (`createKeyPair`) and Hypercore give you keys.
