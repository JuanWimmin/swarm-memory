# graceful-goodbye 1.3.3 — verified API (README + index.js)

```js
const goodbye = require('graceful-goodbye')
const unregister = goodbye(async () => { await sm.close() }, /* position = */ 0)
goodbye.exit()      // trigger the handlers programmatically (like a signal)
goodbye.exiting     // boolean
```
- Runs on SIGTERM/SIGINT and when the event loop is about to end; NOT on `process.exit()` or uncaught errors.
- Handlers run grouped by ascending `position`; all are deregistered once exiting starts (second Ctrl+C exits immediately).
- If it is the only signal handler it exits with code 130 after handlers finish.
- Bare: `package.json` maps `"process"` → `bare-process` via the `imports` field (index.js does `require('process')`), so it
  works in Bare. The template instead wires `process.on('SIGINT', () => app.exit(130))` with `bare-process` directly (bin.mjs) —
  either is fine; don't register both for the same resource.
