# blind-pairing 2.3.1 (+ blind-pairing-core 2.10.1) — verified API

Sources: `node_modules/blind-pairing/README.md` (thin usage only) + `index.js` ([S]); `node_modules/blind-pairing-core/README.md`
([RC]) + `index.js` ([SC]). Everything the swarm transport does is only in source.

## What an invite is [SC]
`createInvite(key, opts)` where `key` is the Autobase (or Hypercore) key:
```js
const { id, invite, seed, publicKey, discoveryKey, additional, expires, sensitive, testInvitation } =
  BlindPairing.createInvite(base.key, { data /* Buffer signed into the invite */, expires: 0, seed, sensitive, discoveryKey })
```
- `invite` = **Buffer** (compact-encoded `{ seed, discoveryKey, expires, sensitive, testInvitation, additionalNodes }`). Share it
  as `z32.encode(invite)` (autopass does exactly that).
- `publicKey` = invitation signing key derived from `seed`; the **member keeps it** to `open()` requests later (autopass stores
  `{ id, invite, publicKey, expires, additional }` in its view via an op so any writer can confirm).
- `id` = invite id (hash of publicKey); compare against `req.inviteId`.
- `BlindPairing.decodeInvite(inviteBuf)` → `{ id, seed, discoveryKey, expires, sensitive, testInvitation, additionalNodes }` [SC].
- `BlindPairing.verifyReceipt(receipt, publicKey)` → userData or null [SC].
- `BlindPairing.createRequest(invite, userData)` → CandidateRequest [S]; `BlindPairing.Invite` = encoding [S].

## Flow [RC]
1. Member creates invite, shares `{ discoveryKey, seed }` (inside `invite`), keeps `publicKey`.
2. Candidate builds a request with `userData` (we send our 32-byte local writer key), signed by the invite keypair, encrypted.
3. Member decrypts/verifies with `publicKey` (`req.open(publicKey)`), inspects `userData`, then `confirm({ key, encryptionKey })` or `deny()`.
4. Candidate verifies `key` matches `discoveryKey` and gets `auth = { key, encryptionKey, data }`.

## Transport class [S index.js]
```js
const pairing = new BlindPairing(swarm, { poll = 7 * 60 * 1000, onincoming })
pairing.addMember({ discoveryKey, announce = true, onadd: async (req) => {} })   // → Member
pairing.addCandidate({ invite, userData, discoveryKey, onadd: async (auth) => {} }) // → Candidate
await pairing.suspend(); pairing.resume(); await pairing.refresh(); await pairing.close()
```
- BlindPairing hooks `swarm.on('connection')` and a protomux channel `'blind-pairing'`, and itself calls
  `swarm.join(discoveryKey, { server, client })` for the topic (so you can also `swarm.join(base.discoveryKey)` yourself; autopass does both).
- It also uses DHT mutable records (`dht.mutablePut/Get`, `announce/lookup`) keyed off the invite token, so member and candidate
  need not be online at the same instant; a `Member` polls every `poll` ms (randomized) [S].

### Member (ReadyResource) [S]
- ctor opts: `discoveryKey` (required, = `base.discoveryKey`), `onadd(req)`, `announce`.
- `await member.flushed()` — underlying discovery announced. `member.announce()`, `await member.refresh()`, `await member.close()`.
- `onadd(req)` receives a **MemberRequest** [SC]: `req.inviteId`, `req.discoveryKey`, `req.open(invitePublicKey)` → `userData`
  (throws `'Failed to open invite with provided key'` if wrong invite), `req.userData`, `req.id`, `req.receipt`,
  `req.confirm({ key, encryptionKey, additional })`, `req.deny({ status })`, `req.response` (set after confirm/deny). The member
  transport sends `req.response` back automatically when `onadd` resolves; if you do not confirm/deny nothing is sent.

### Candidate (ReadyResource) [S]
- ctor via `addCandidate({ invite: Buffer, userData: Buffer, onadd })` (or pass a CandidateRequest first arg).
- `candidate.pairing` — promise (`_run()`) that resolves to the auth once paired, or to `null` if the candidate is closed first;
  it **never rejects** (every internal error is swallowed in `_poll`) [S] — so `if (!(await c.pairing)) /* closed unpaired */`;
  `candidate.paired` — `null` or `{ key, encryptionKey, data }`; `candidate.token`, `candidate.request` (the CandidateRequest,
  an EventEmitter); `await candidate.close()`.
- `onadd(auth)` is called once with `{ key, encryptionKey, data }` [SC `_openResponse`]; `data` = `additional.data` if the invite
  carried `data` (autopass: `{ readOnly }` metadata).
- Rejections: status 1 `PAIRING_REJECTED`, 2 `INVITE_USED`, 3 `INVITE_EXPIRED` [SC] — they are NOT thrown to you:
  `CandidateRequest.handleResponse` catches them, emits `'rejected'` (err) on `candidate.request` and returns `null`; `onadd` is
  not called and the candidate keeps polling until you `close()` it [S/SC].

## README usage (verbatim shape) [R]
```js
const { invite, publicKey, discoveryKey } = BlindPairing.createInvite(autobaseKey)
const a = new BlindPairing(swarmA, { poll: 5000 })
const m = a.addMember({ discoveryKey, async onadd (candidate) {
  candidate.open(publicKey); candidate.confirm({ key: autobaseKey }) } })
await m.flushed()
const b = new BlindPairing(swarmB, { poll: 5000 })
const c = b.addCandidate({ invite, userData, async onadd (result) { /* result.key */ } })
await c.pairing
await a.close(); await b.close(); await swarmA.destroy(); await swarmB.destroy()
```

## Not in source
`BlindPairing.pair()`, `pairing.createInvite()` (instance), `candidate.accept()`, `member.confirm()`, `pairing.on('pair')`.
