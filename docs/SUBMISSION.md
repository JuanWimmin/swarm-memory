# Submission checklist — Aleph Hackathon 2026, Pears Track

Deadline **Sun 23-Aug 12:00 ART** · judging from 13:00 ART · **keep seeding until ~17:00 ART**.

## What the judges need

| Item | Value |
| --- | --- |
| Install command | `pear install pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy` |
| Repo | https://github.com/JuanWimmin/swarm-memory (public, branch `master`) |
| Template + variant | `holepunchto/hello-pear-bare`, branch **`main`** (OTA updater in a Bare worker thread) — stated in the README |
| Platforms in the drive | win32-x64, win32-arm64, darwin-x64, darwin-arm64, linux-x64, linux-arm64 (474 MB, all six) |
| Released version | **0.1.10** — `note`, live `resume --watch`, and `invite` now holds the live view with the code pinned |
| Video (≤3 min, English) | **owner: F** — must show `pear install` on a clean machine and an OTA update landing |
| Track | Pears |

## Verified, with evidence

| Requirement | Evidence |
| --- | --- |
| `pear install pear://<key>` works on a clean machine | GitHub Actions run `32615845671` (fresh windows-latest runner, v0.1.7): install completed in **6 s**; earlier run `32615114204` did it in 8 s |
| P2P OTA updates work end to end | A running **v0.1.5** copy picked up **v0.1.7** from the swarm with no user action and reported `--version` = 0.1.7 afterwards: |

```
Updates: enabled
Application storage: ...\store\app-storage
Hello from worker
[updater] getting new update
[updater] update complete... applying
[updater] applied update, restart to run latest version

$ swarm-memory --version
swarm-memory v0.1.7
```

| | |
| --- | --- |
| Runs on Bare, not Node | `bare test/index.js`: **29 tests / 534 asserts** green — unit tests for the merge policy, integration tests for the whole command layer, two-peer pairing and the live repaint, all on a local DHT testnet |
| Multi-platform binaries | `build.yaml` builds 6 targets with `bare-build`, merged by `pear-build` into one `by-arch` deployment |

## Seeding through judging — the one thing that must not stop

**B1's machine owns the link and is the authoritative seeder.** A window titled *"SwarmMemory seeder"*
runs `C:\Users\juanp\swarm-memory-seed.cmd`, which reseeds in a loop and logs to
`%USERPROFILE%\swarm-memory-seed.log`. Do not close it, and do not let the machine sleep, until
judging ends. Check it is alive:

```sh
tail -5 ~/swarm-memory-seed.log      # expect: announced / drive length 15 / network N peers
```

Redundancy already running: `.github/workflows/reseed.yaml` (keyless, ubuntu + windows, cron every
2 h). Add a third from any teammate's home connection — it needs no keys and no repo:

```sh
npm i -g pear
pear seed pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy
```

## Publishing another release (B1's machine only)

The writer key lives in `%APPDATA%\pear` on that machine; nowhere else can stage this link.

```sh
npm version patch && git push                       # installed copies compare semver
gh workflow run build.yaml                          # 6 platforms → by-arch artifact
gh run download <run> -n by-arch -D . && tar -xzf by-arch.tar.gz -C deployment
pear stage pear://ino4ymu38… ./deployment            # seeder can stay running
```

## Video shot list (everything below is working today)

```sh
# 1. clean machine, peer-to-peer install
pear install pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy
swarm-memory --version

# 2. the project's memory in the terminal
swarm-memory publish --demo
swarm-memory resume
swarm-memory graph --html graph.html   # opens offline, no CDN

# 3. a second peer, no server — the shot that carries the whole idea
swarm-memory invite            # terminal A — pins the code above a live view and stays online
swarm-memory join <code>       # terminal B — replicates the graph in ~4 s
swarm-memory note "LastPaid has no extend_ttl - a payment can become unreachable" \
    --about storage/payroll.lastpaid          # terminal B writes...
#                                             ...and terminal A repaints by itself

# 4. OTA — leave `swarm-memory` running, publish a release, and the installed copy prints
#    [updater] getting new update → update complete... applying → applied update
```

Recording the install on B1's box may fail (it is the seeder — hairpin NAT). Record that shot on
another machine or network, or capture the `Install test` workflow run, which installs on a genuinely
clean machine.
