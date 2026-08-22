# hyperswarm 4.17.0 — verified API

Source: `node_modules/hyperswarm/README.md` ([R]); `index.js`, `lib/peer-discovery.js`, `lib/peer-info.js` ([S]).

## Constructor
```js
const swarm = new Hyperswarm({
  keyPair,        // [R] Noise keypair for listen/connect; default DHT.keyPair(seed); autopass uses await store.createKeyPair('hyperswarm')
  seed,           // [R] 32 bytes → deterministic keyPair
  maxPeers,       // [R]
  firewall: (remotePublicKey) => false, // [R] return true to reject
  dht,            // [R] existing hyperdht instance
  bootstrap,      // [S] forwarded to new DHT({ bootstrap }) — only for testnets (hyperdht/testnet.js)
  relayThrough, maxClientConnections, maxServerConnections, maxParallel // [S]
})
```

## Props [R unless noted]
`swarm.connections` (Set of sockets), `swarm.peers` (Map hex(noisePk) → PeerInfo), `swarm.connecting` (number), `swarm.dht`,
`swarm.keyPair` [S], `swarm.destroyed` [S], `swarm.listening` [S], `swarm.stats` [S].

## Methods
| call | tag | notes |
|---|---|---|
| `const discovery = swarm.join(topic, { server = true, client = true, limit = Infinity })` | R | `topic` must be a 32-byte Buffer (`base.discoveryKey`, `core.discoveryKey`) — throws `ERR_MISSING_TOPIC` if falsy [S]; returns PeerDiscovery session |
| `await discovery.flushed()` | R | announced on DHT (server mode) |
| `await discovery.refresh({ client, server })` | R | |
| `await discovery.destroy()` | R | stop discovering this topic |
| `await swarm.leave(topic)` | R | does not close connections |
| `swarm.joinPeer(noisePublicKey)` / `swarm.leavePeer(pk)` | R | direct connect to known peer |
| `swarm.status(topic)` | R | PeerDiscovery or undefined |
| `await swarm.listen()` | R | implicit after first join |
| `await swarm.flush()` | R | wait for pending DHT ops + pending connections (heavy) |
| `await swarm.destroy({ force })` | S (not in README) | closes server + dht; what autopass calls on teardown |
| `await swarm.suspend({ log })` / `await swarm.resume({ log })` | R | |
| `swarm.topics()` | S | |

## Events [R]
- `swarm.on('connection', (socket, peerInfo) => {})` — `socket` is a Noise-encrypted Duplex; pass it to `store.replicate(socket)` /
  `base.replicate(socket)`; `peerInfo.client` [S] tells you if we initiated.
- `swarm.on('update', () => {})` — connections/connecting changed (use to refresh a peers counter).
- `swarm.on('ban', (peerInfo, err) => {})`.

## PeerInfo [R]
`peerInfo.publicKey` (Noise pk), `peerInfo.topics` (only for client-mode connections), `peerInfo.prioritized`,
`peerInfo.ban(banStatus = false)`; [S] also `client`, `banned`, `attempts`, `relayAddresses`.

## Modes [R]
server = announce on DHT & accept; client = lookup & connect. Server-side connections are not tied to a topic. For a team
swarm join with both (default).

## Typical
```js
const swarm = new Hyperswarm({ keyPair: await store.createKeyPair('hyperswarm') })
swarm.on('connection', (conn) => base.replicate(conn))
const d = swarm.join(base.discoveryKey)
await d.flushed()        // optional: we are announced
// peers: swarm.connections.size ; swarm.peers.size
await swarm.destroy()
```
