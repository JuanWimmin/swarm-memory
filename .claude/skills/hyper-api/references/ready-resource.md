# ready-resource 1.2.0 — verified API (README + index.js)

```js
const ReadyResource = require('ready-resource')   // extends EventEmitter ('events' → bare-events in Bare)
class Thing extends ReadyResource {
  async _open () {}    // called once by ready()
  async _close () {}   // called once by close(), after _open finished (if it was started)
}
const r = new Thing()
await r.ready()   // idempotent; on _open error it auto-closes and rethrows; sets r.opened = true; emits 'ready'
await r.close()   // idempotent; sets r.closed = true; emits 'close'
r.opening / r.closing  // the in-flight promises (null before)
r.opened / r.closed    // booleans
```
Corestore, Autobase, BlindPairing/Member/Candidate and the template `App` (app.js) extend it — so `await x.ready()` /
`await x.close()` are uniform, and calling close twice is safe. **Hypercore does NOT** (it `extends EventEmitter` and implements
its own `ready()/close()/opened/closed/opening/closing` with the same shape — still idempotent) and **Hyperswarm does NOT**
(`extends EventEmitter`; no `ready()`, only `listen()/destroy()`; `destroy()` is idempotent unless `{ force }`). Pattern: kick
`this.ready().catch(noop)` in the constructor if you want auto-open (autobase/autopass do).
