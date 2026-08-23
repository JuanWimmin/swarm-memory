# DEMO — running SwarmMemory on real Soroban contracts

A camera-ready script. Every command below is one shot, and each one is labelled with the single
thing it proves to a judge. Nothing here is hand-written data: the graph comes from a real scan of
three deployed Soroban contracts.

**The project on screen.** `demo/private-payroll/` is a real Stellar project — `Treasury`,
`Payroll` and `EmployeeRegistry` in Rust, live on testnet, plus the `.stellar-memory` vault a
scanner produced from it. Our reader turns that vault into **45 nodes and 61 edges**: 4 contracts,
13 functions, 10 storage keys, 5 events, 2 errors, 4 deployments, 6 open tasks — and, in the middle
of it, two `critical` findings and two deployments that have drifted out of sync with their source.

> `swarm-memory publish --vault <dir>` — reading a scanned vault straight from disk — landed in the
> same release as everything else in this script, so the copy you install from the `pear://` link
> already has it.

---

## Read this before you hit record

Two things cost us takes. Both are cheap to avoid.

**1. Do not record the install on the machine that is seeding.** The seeder announces the drive on
the DHT, and a client on the same public IP has to hairpin back through its own NAT to reach it —
that fails on most routers, and `pear install` sits there until it times out. It is not a bug in the
app and it will not reproduce on a judge's machine. Record the install shot from **another machine
or another network** (a phone hotspot is enough), or capture the `Install test` workflow run, which
installs on a genuinely clean GitHub runner. Seeding setup is in [`SEEDER.md`](SEEDER.md).

**2. One `--storage` directory, one process.** Corestore takes an **exclusive lock** on its
directory. Peer A and peer B must have different `--storage` paths — that is what makes the
two-terminal version of this demo work on a single laptop. The same lock has a corollary that bites
mid-take: while a long-running command (`invite`, `resume --watch`, or plain `swarm-memory`) is
holding a storage directory, a second terminal cannot run `note`, `peers` or `graph` against **that
same** directory. Stop the live process first, or point the second command at the other peer.

Everything else in this script is forgiving. These two are not.

---

## Before you hit record

```sh
pear --version                 # you need the Pear CLI; if not: npm i -g pear
git clone https://github.com/<org>/swarm-memory && cd swarm-memory
```

The clone is not optional for scene 2. The installed binary is standalone and carries the _bundled_
demo (`--demo`) inside it, but `--vault` reads a directory off your disk at runtime — so the
`demo/private-payroll/.stellar-memory` folder has to exist next to you. Any other `.stellar-memory`
vault of your own works exactly the same way.

Pick your setup:

- **Two machines** (best on camera — the point of the project is that there is no server). Peer A on
  one, peer B on the other. Drop the `--storage` flags entirely; each machine has its own.
- **One machine, two terminals.** Keep every command's `--storage ./peer-a` / `--storage ./peer-b`
  exactly as written below. See trap 2.

Add `--as Ana` / `--as Bruno` to a peer's commands and that name is what shows up next to the notes
it writes. Worth doing: "written by Ana" reads better than a hostname.

---

## Scene 1 — install · _proves the entry requirement_

Peer B's machine, clean, no Node.js, nothing cloned:

```sh
pear install pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy
```

> **Proves:** the track's hard requirement — the tool installs from a `pear://` key alone. Measured
> at 5–8 s on clean GitHub-hosted Windows runners. `swarm-memory` is now on the PATH.

```sh
swarm-memory --version         # swarm-memory v0.1.10
swarm-memory status            # version, storage path, updates: enabled, the upgrade link
```

> **Proves:** it is a real installed binary with an update channel, not a script you ran out of a
> repo. Keep `status` in the take — the `upgrade pear://…` line is the setup for scene 7.

---

## Scene 2 — load the real project · _proves this is not a fixture_

Peer A, from the clone:

```sh
swarm-memory publish --vault demo/private-payroll/.stellar-memory --storage ./peer-a --as Ana
```

```
published 45 nodes, 61 edges into 555oeqk1mzhu51cc3ijczhojssggonkku8o6zrhjsky1t5hmn5qy
```

> **Proves:** the graph is read from a scan of real Rust sources and real testnet deployments — not
> a JSON somebody typed. 45/61, and you can open `demo/private-payroll/contracts/` on camera to show
> the code it came from.

`--vault demo/private-payroll` (the project root) resolves to the same vault — the reader walks up
looking for `.stellar-memory/index.json`. Both work; the explicit path is clearer on screen.

If you only want the small canned dataset, `swarm-memory publish --demo` loads the bundled 23-node
graph with nothing on disk. Keep it as a fallback if the clone is missing; use `--vault` on camera.

---

## Scene 3 — the context view · _proves the tool is worth having_

```sh
swarm-memory resume --storage ./peer-a --as Ana
```

```
  private-payroll
  45 nodes  ·  61 edges  ·  0 peers  ·  writer
  ykjhq2…

  Contracts
    EmployeeRegistry  4 fn   testnet
    Payroll           4 fn   testnet   drift
    Token (token)            external
    Treasury          5 fn   testnet   drift

  On-chain
    payroll @ testnet    Live at `CDVMJUZ4…Z7XU` — out of sync with local source.
    treasury @ testnet   Live at `CDNR3WXJ…RE4R` — out of sync with local source.

  Worth knowing
    !! DataKey::LastPaid(employee) (persistent)
       Persistent key with no extend_ttl: it can expire and become unreachable.
    !! set_pay_token
       Mutates state and never calls require_auth.
     ! PayrollError
       Contract error enum with 4 variants. The discriminants are published ABI.
  …

  Open tasks
    □ Audit the registry's access control before mainnet   CHECKLIST in `README.md:25`
    □ Complete withdrawal tests for Payroll                CHECKLIST in `README.md:24`
  …
```

Real output, colours stripped and the middle elided.

> **Proves:** the thing a new teammate would spend a week discovering — the drift between the
> deployed Wasm and the local build, the persistent key with no `extend_ttl`, the state mutation
> with no `require_auth` — is one command. Land on the two `!!` lines; they are the whole pitch.

Pause on `treasury @ testnet — out of sync`. That contract really is stale on testnet: a
`payroll_address` getter was added to the source and rebuilt, but never redeployed, and the scan
caught it by comparing Wasm hashes. `demo/private-payroll/README.md` carries the two `shasum`
commands if a judge wants to verify it live against the chain.

---

## Scene 4 — pair a teammate · _proves no server and no account_

Peer A:

```sh
swarm-memory invite --storage ./peer-a --as Ana
```

```
  Invite code (single use) — your teammate runs:
    swarm-memory join yryzpzc4zwg5i4ds1gzn7bpw7s17dge6ubypj3dxzbinwie6cr48ehx3behgcq6q4jxda…
```

This one **stays running** — pairing happens live, and it repaints the live view underneath the
code. Leave it on screen.

Peer B, on the other machine:

```sh
swarm-memory join <paste the code> --storage ./peer-b --as Bruno
```

```
pairing…
joined 1c1c8gqazno9m5tem39tmkr5c3kr964h8t1f1jrw3q1gy75qq1by — 45 nodes replicated
```

> **Proves:** a second peer holds the entire graph after pasting one code. No login, no invite
> email, no host — the code goes over the public DHT and Hyperswarm finds the peer. Measured at 4 s
> for the 23-node dataset; the 45-node vault is the same order.

```sh
swarm-memory peers --storage ./peer-b --as Bruno    # connections, writer status, graph size
```

> **Proves:** B is a **writer**, not a read-only mirror. That is the difference between this and
> replicating a shared document.

---

## Scene 5 — a note lands live on the other peer · _proves the merge policy_

Split screen: peer B's live view on one side, peer A typing on the other.

Peer B, staying online:

```sh
swarm-memory resume --watch --storage ./peer-b --as Bruno
```

Peer A — stop the `invite` process first (pairing is done, and it is holding A's storage; trap 2),
then:

```sh
swarm-memory note "set_pay_token can repoint payroll at a worthless token - needs require_auth" \
    --about function/payroll.set_pay_token --storage ./peer-a --as Ana
```

```
noted note/set-pay-token-can-repoint-payroll-at-a-31 → function/payroll.set_pay_token
```

Peer B's view repaints by itself. Nobody refreshed anything.

> **Proves:** every peer is a writer and the view is live. This is the shot that separates the
> project from a markdown file in a repo.

If B has not repainted after a couple of seconds, start `swarm-memory --storage ./peer-a --as Ana`
on A and leave it online — A stays connected and the append replicates. Cheap insurance; if you only
get one take, start it before the write.

Then say the rule out loud, because it is the product opinion:

> A node of type `note` is **never** overwritten or deleted by a write whose source is `scan`.
> Everything else is last-writer-wins by a lamport stamp, so a stale scan replayed by a peer that
> was offline loses to a newer one. A scanner may refresh facts; it may not argue with a person.
> That is enforced inside `apply()`, which Autobase re-runs on every reorder, so it cannot be
> bypassed by writing straight to the view.

Optional and strong: re-run scene 2's `publish --vault` on peer A. The whole scan re-lands, the
counts go back to their scanned values — and Ana's note is still sitting there.

---

## Scene 6 — the offline viewer · _proves it outlives the demo_

```sh
swarm-memory graph --html payroll.html --storage ./peer-b --as Bruno
open payroll.html                       # macOS · `start` on Windows · `xdg-open` on Linux
```

> **Proves:** one self-contained file — no server, no CDN, no network. Drop it in Slack, open it
> from `file://` in six months, it still renders the graph the team had today.

Turn the Wi-Fi off before opening it if you want the point made on camera.

Run from inside the clone it uses `web/template.html`, so the frontend can iterate without a
rebuild; run from an installed copy it uses the viewer baked into the binary and says
`(bundled viewer)`. `--json payroll.json` writes the portable export instead.

---

## Scene 7 — the update lands by itself · _proves the OTA requirement_

Leave a peer running with updates on — plain `swarm-memory`, no subcommand, and **no**
`--no-updates`:

```sh
swarm-memory --storage ./peer-b --as Bruno
```

```
Updates: enabled
```

The release itself is B1's, from the machine that owns the link, and the exact sequence is in
[`DEPLOY.md`](DEPLOY.md) — `npm version patch` → `npm run make` → `pear stage` → the seeder serves
the new length. Do not improvise it on camera.

The shot is the terminal you left running:

```
[updater] getting new update
[updater] update complete... applying
[updater] applied update, restart to run latest version
```

```sh
swarm-memory --version         # the new version
```

> **Proves:** "a real update reaching an installed copy" — the track's second hard requirement. A
> running **v0.1.5** picked up **v0.1.7** with no user action; nobody re-installed anything, and the
> update travelled over the same swarm the graph does.

---

## The whole thing as one command sheet

Peer A:

```sh
swarm-memory publish --vault demo/private-payroll/.stellar-memory --storage ./peer-a --as Ana
swarm-memory resume  --storage ./peer-a --as Ana
swarm-memory invite  --storage ./peer-a --as Ana          # stays online — stop it after B joins
swarm-memory note "set_pay_token can repoint payroll at a worthless token - needs require_auth" \
    --about function/payroll.set_pay_token --storage ./peer-a --as Ana
swarm-memory --storage ./peer-a --as Ana                  # stay online
```

Peer B:

```sh
pear install pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy
swarm-memory status
swarm-memory join <code>          --storage ./peer-b --as Bruno
swarm-memory peers                --storage ./peer-b --as Bruno
swarm-memory resume --watch       --storage ./peer-b --as Bruno    # the note lands here
swarm-memory graph --html payroll.html --storage ./peer-b --as Bruno
swarm-memory                      --storage ./peer-b --as Bruno    # left running for the OTA
```

On two machines, delete every `--storage` flag.

## Node ids worth pointing `--about` at

Taken from the real vault, so they exist:

| id                                                                            | why it is interesting                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `function/payroll.set_pay_token`                                              | `critical` — mutates state, never calls `require_auth` |
| `contract/treasury`                                                           | the contract whose deployed Wasm has drifted           |
| `contract/payroll`                                                            | the orchestrator                                       |
| `deployment/testnet.cdnr3wxjiy7gczgy6kkfuw3bv3h5k654y4iipd4zwurhngkfhhyare4r` | the stale testnet deployment                           |

`swarm-memory graph --json out.json` writes the whole export if you need to find another one — the
persistent `LastPaid` key is in there too, but its id has parentheses in it and is miserable to
quote on camera.

## If a take goes wrong

| What you see                                          | What it is                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pear install` hangs or times out                     | you are installing on the seeding machine (trap 1), or no seeder is reachable — retry from another network |
| a command hangs on open, or errors on the storage dir | another process is holding that `--storage` (trap 2) — stop the live view first                            |
| `join` never completes                                | peer A's `invite` must still be running, and the code is single use — generate a fresh one                 |
| `resume` prints an empty project                      | that storage has nothing in it — run scene 2's `publish` against **that** `--storage`                      |
| the vault is not found                                | you are not in the clone, or the path is wrong — `--vault` needs the directory on disk                     |
| the viewer opens blank                                | the export ran against an empty storage; check `swarm-memory peers` reports nodes first                    |
