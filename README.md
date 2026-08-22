# SwarmMemory 🍐⭐

> **The living memory of a smart-contract project, shared between your team's peers with no server —
> installed and updated peer-to-peer through Pear.**
>
> Aleph Hackathon 2026 · Pears Track

The context of a Soroban/Stellar project — which contract calls which, where the TTL and auth risks
are, what drifted on-chain, the note someone wrote at 3 AM — lives in people's heads and in silos.
SwarmMemory turns that context into a **knowledge graph the whole team writes to**, replicated
directly between peers over Hyperswarm. No server, no account, no config: one invite code and a new
teammate has the whole project's memory in their terminal.

```sh
pear install pear://amu47syduoenxojzur88fi5sq3ohqtwg6fms4bfuonag3h1d9r1o
swarm-memory                 # the project's context, in your terminal
swarm-memory invite          # → an invite code for a teammate
swarm-memory join <code>     # they get the graph, live, from the swarm
```

Updates arrive by themselves: the binary is evergreen, it watches its own `pear://` link and applies
new releases over the swarm.

---

## Install

```sh
pear install pear://amu47syduoenxojzur88fi5sq3ohqtwg6fms4bfuonag3h1d9r1o
```

That is the whole installation — Pear fetches the binary for your platform from peers and puts it on
your PATH. If you don't have the Pear CLI yet: `npm i -g pear`.

**Platforms in the release drive:** `win32-x64`, `win32-arm64`, `darwin-x64`, `darwin-arm64`,
`linux-x64`, `linux-arm64` — all six built by GitHub Actions (`.github/workflows/build.yaml`) with
[`bare-build`](https://github.com/holepunchto/bare-build) and merged into one deployment with
`pear-build`.

> On macOS/Linux, if an updated binary comes back non-executable: `chmod +x $(which swarm-memory)`.
> (Known Windows-staging quirk, see `docs/DEPLOY.md` §8.)

## Template: `hello-pear-bare`, branch [`main`](https://github.com/holepunchto/hello-pear-bare/tree/main)

We started from **`holepunchto/hello-pear-bare`, branch `main`** — the variant that runs
`pear-runtime` (the OTA updater) inside a **Bare worker thread**. That is the right process shape
here: SwarmMemory is a long-lived TUI holding swarm connections, so update checks and the P2P stack
stay off the main thread and the terminal never blocks on them.

`app.js` and `workers/main.js` are the template's updater and are deliberately **untouched** — the
repo even enforces it with a `PreToolUse` hook (`.claude/hooks/guard-updater.js`).

## How it works

```
swarm-memory (Bare CLI, standalone binary — no Node.js on the user's machine)
│
├── bin.mjs                  CLI entrypoint (paparam)
├── app.js + workers/main.js OTA updater from the template — untouched
│
├── src/sync/                the P2P layer
│   ├── store.js             SwarmStore: Corestore + Autobase (view = Hyperbee) + Hyperswarm
│   ├── apply.js             merge policy — last-writer-wins by lamport stamp, EXCEPT human notes,
│   │                        which an automatic scan never overwrites
│   ├── pairer.js            join by invite code (blind-pairing), no server, no account
│   └── index.js             openStore(dir, { invite })
│
├── src/vault/ src/core/ src/render/   read a .stellar-memory vault, model the graph, paint the TUI
└── web/template.html        self-contained HTML graph viewer (opens offline, file://)
```

Every peer is a **writer**: your scans and notes go into your own append-only core, Autobase
linearizes all the cores into one deterministic view, and the view is a Hyperbee laid out as

```
n!<id>                  a node   (contract, function, storage, event, error, deployment, note, task)
e!<from>!<type>!<to>     an edge  (calls, reads, emits, raises, notes, deployed_as)
m!<key>                  project metadata
```

Merging is where the product opinion lives: automatic scans are last-writer-wins, but a node a human
wrote (`type: "note"`) is **never** clobbered by a scanner. Machines may refresh facts; they may not
erase what a person decided to say.

## Development

Requires Node.js (for tooling) and the Pear CLI.

```sh
npm install
npm start                 # bare bin.mjs --no-updates
npm start -- --updates    # exercise the OTA path locally
npm test                  # brittle-bare — the sync suite runs on a local DHT testnet
npm run make              # standalone binary for this host → out/<platform>-<arch>/
npm run lint              # prettier + lunte
```

The test suite covers the P2P layer end to end on the real runtime: two peers pair through an invite
code, replicate, converge, and the merge policy is asserted (stale scans rejected, human notes
protected, restart-safe lamport clock). **37/37 asserts green on both Node and Bare.**

## Release & OTA

Documented command by command in [`docs/DEPLOY.md`](docs/DEPLOY.md), with a deploy log. Short version:

```sh
npm version patch                                   # installed copies compare semver
gh workflow run build.yaml                          # 6 platforms → by-arch artifact
pear stage  pear://<key> ./deployment                # publish the release into the drive
pear seed   pear://<key>                             # keep it available to peers
```

An installed copy watches the `upgrade` link in its own `package.json`, downloads the new version
over the swarm and applies it — `[updater] getting new update` → `update complete... applying` →
`applied update`. Seeding is documented in [`docs/SEEDER.md`](docs/SEEDER.md).

## Code reuse disclosure

The track allows reusing existing code and judges only what was built during the hackathon.

- **Reused (pre-hackathon, same team, Apache-2.0):** the `.stellar-memory` vault format, the graph
  model (node/edge types) and the analysis behind the demo dataset come from our earlier
  `stellar-memory` project. The Rust scanner is **not** part of this entry; the CLI reads vaults that
  were already scanned.
- **Built this weekend (what we're submitting):** the whole Pear/Bare application — the CLI, the
  P2P layer (`src/sync`), the TUI and the HTML viewer, the multi-platform build and CI, and the
  entire Pear deployment: the app, the `pear://` link and every release are new, as the track
  requires.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Built on
[Pear](https://docs.pears.com), [Bare](https://github.com/holepunchto/bare) and the Holepunch stack.
