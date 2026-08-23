# protomux 3.11.0 — verified API (README)

Multiplex message-oriented protocols over one framed stream (the Hyperswarm connection is already a framed Noise stream;
Hypercore replication and blind-pairing both ride on a Protomux over it).

```js
const Protomux = require('protomux')
const c = require('compact-encoding')
const mux = Protomux.from(socket)            // reuse existing muxer on the stream or create one (blind-pairing caches it in stream.userData)
const ch = mux.createChannel({
  protocol: 'swarm-memory/presence', id: optionalBuffer, handshake: encoding,
  messages: [{ encoding: c.json, onmessage (m) {} }],   // or ch.addMessage({ encoding, onmessage })
  async onopen (handshake) {}, async onclose () {}, async ondestroy () {}
})
if (ch !== null) { ch.open([handshake]); ch.messages[0].send({ hello: 1 }) }   // createChannel returns null for duplicates
mux.pair({ protocol, id }, cb)   // cb when the remote requests this protocol (create the channel inside)
mux.unpair({ protocol, id }); mux.opened({ protocol, id }); mux.cork()/uncork(); ch.cork()/uncork(); ch.close(); mux.isIdle()
for (const channel of mux) {}
```
Only needed if you add a custom side-channel (e.g. presence/nicknames). Replication + pairing already handle their own
channels. `Hypercore.getProtocolMuxer(stream)` returns the same muxer Hypercore uses.
Not in README: `mux.send()`, `mux.on('message')`, `new Protomux(socket).channel(...)`.
