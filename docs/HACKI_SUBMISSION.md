# Hacki submission — copy/paste

The Hacki form takes pasted formatting, so paste the two blocks below straight in.
Facts verified against the live release on 2026-08-23 (v0.1.12).

---

## One-line description

> A CLI that keeps a Soroban project's knowledge graph — contracts, risks, on-chain drift, human
> notes — in sync across your team with no server, installed and updated peer-to-peer through Pear.

---

## Details

### What it is

The context of a smart-contract project lives in people's heads and in silos: which contract calls
which, where the TTL and auth risks are, what drifted on-chain, the note someone wrote at 3 AM.
Every new person on the team pays for that again.

SwarmMemory keeps it as a **knowledge graph every peer writes to and every peer holds a full copy
of**. No server, no account, no config: a teammate joins with one invite code and has the whole
project's memory in their terminal. The binary is evergreen — it watches its own `pear://` link and
applies new releases over the same swarm it uses for data.

### Try it

```
pear install pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy
```

That is the whole installation — Pear fetches the binary for your platform from peers and puts
`swarm-memory` on your PATH. Measured at **5–8 seconds** on clean GitHub-hosted runners. No Node.js
on the user's machine.

```
swarm-memory publish --demo     # load the bundled demo project (real Soroban contracts)
swarm-memory resume             # the project's context, in your terminal
swarm-memory invite             # → an invite code, and a live view that repaints
swarm-memory join <code>        # a teammate replicates the graph, no server involved
swarm-memory note "set_pay_token has no require_auth" --about function/payroll.set_pay_token
swarm-memory graph --html map.html   # self-contained viewer, opens offline
```

### Why this is not a shared markdown file

- **Every peer is a writer.** Each machine appends to its own Hypercore. Nobody has to be online for
  you to write, and there is no primary copy to lose.
- **Autobase linearizes the writers into one view.** The cores are merged into a single
  deterministic order and folded into a Hyperbee. Two peers holding the same cores compute
  byte-identical state — the merge is a pure function, not a sync-conflict dialog.
- **Pairing is one invite code over the DHT** (`blind-pairing`), with Hyperswarm finding the peers.
  Nothing to deploy, nothing to log into.
- **The merge policy is the product opinion.** Automatic writes are last-writer-wins by a lamport
  stamp, but a node of type `note` — the human half — is **never** overwritten or deleted by a write
  whose source is `scan`. A scanner may refresh facts; it may not erase what a person decided to say.

Measured between two real peers over the public DHT: pairing and 45 nodes replicated in **5.4 s**, and
a note written on one peer repainting the other's live view in **2 s**.

### Pears track requirements

| Requirement | Status |
| --- | --- |
| Installable with `pear install pear://<key>` | Yes — `pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy`, verified repeatedly from clean GitHub runners (5–8 s) |
| Working P2P OTA updates | Yes — a running v0.1.5 copy picked up v0.1.7 off the swarm by itself: `[updater] getting new update` → `update complete... applying` → `applied update`, and `--version` confirmed it afterwards |
| Seeded through judging | Yes — the release machine seeds in a restart loop, plus keyless reseeders on GitHub Actions |
| Template branch / variant | `holepunchto/hello-pear-bare`, branch **`main`** — the OTA updater runs in a Bare **worker thread**, which is the right process shape for a long-lived TUI holding swarm connections: update checks download in the worker while the main thread keeps replicating and drawing |
| Platforms | win32-x64, win32-arm64, darwin-x64, darwin-arm64, linux-x64, linux-arm64 — all six built in CI with `bare-build` and merged into one `by-arch` deployment by `pear-build` |

`app.js`, `workers/main.js` and the `upgrade` field are the template's updater and are deliberately
untouched; a repo hook enforces it.

### Built this weekend vs reused

The track allows reusing code and judges only hackathon work.

- **Reused** (pre-hackathon, same team, Apache-2.0): the `.stellar-memory` vault format, the graph
  model, and the analysis behind the demo dataset, from our earlier `stellar-memory` project. The
  Rust scanner is **not** part of this entry — the CLI reads vaults that were already scanned.
- **Built this weekend:** the whole Pear/Bare application — the P2P layer (Corestore + Autobase +
  Hyperswarm + blind-pairing, with the merge policy), the CLI and its terminal view, the
  self-contained HTML viewer, the multi-platform build and CI, and the entire Pear deployment: the
  app, the `pear://` link and every release are new, as the track requires.

### Architecture

```
bin.mjs                     CLI entrypoint (paparam)
app.js + workers/main.js    OTA updater from the template — untouched

src/sync/                   the P2P layer
  store.js                  SwarmStore: Corestore + Autobase (view = Hyperbee) + Hyperswarm
  apply.js                  the merge policy — deterministic, replay-safe
  pairer.js                 join by invite code (blind-pairing)
src/vault/                  read a scanned .stellar-memory project
src/core/ src/render/       graph model · the terminal view · the HTML viewer
```

The Hyperbee view is laid out as `n!<id>` for nodes, `e!<from>!<type>!<to>` for edges and `m!<key>`
for metadata, so a lookup is a `get` and "everything out of X" is one range read. A local vault and
the P2P view implement the same frozen interface — `{ nodes(), edges(), meta() }` — so the same
rendering code reads either one.

Bare is not Node.js: no `require('fs')`, no `process.env`, no `Buffer`. The app uses `bare-fs`,
`bare-path`, `bare-os` and `b4a`. (Concrete example of the hazard: `picocolors` reads the Node
`process` global and throws the moment it loads on Bare, so we write the escape codes ourselves.)

### Tested

`bare test/index.js` — **43 tests / 603 asserts** green on the Bare runtime (32 / 167 of them also
run on Node). Unit tests for the merge policy against a fake view; integration tests for the whole
command layer, two peers pairing and converging, a joined peer surviving a restart, and the live
view repainting when a teammate writes — all on a local DHT testnet, nothing touching the public
network.

### Links

- **Repo:** https://github.com/JuanWimmin/swarm-memory
- **Install:** `pear install pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy`
- **Demo video:** _TODO — paste the public link before submitting_
