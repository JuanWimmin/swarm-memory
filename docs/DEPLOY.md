# SwarmMemory — Deploy runbook (Pear CLI 3.2.0)

> Owner: **B1**. Every command below was checked against `pear help <cmd>` on the dev host
> (Pear 3.2.0, platform `pear://smw4thqaqed9iq6bae7a9cxd4fesruixgkafe38jny33ahs33igy`), the v3 pages
> of docs.pears.com, and the source of `pear-runtime`, `pear-runtime-updater`, `hello-pear-worker`,
> `pear-install` in `node_modules/`. Anything not executed end-to-end yet is tagged **[UNVERIFIED]**.
> Pre-v3 commands (`pear init/dev/run/release`) do not exist — if a guide mentions them, it is obsolete.
> Shell snippets use Git Bash syntax (`$TEMP`, `$LOCALAPPDATA`, `/` paths); in PowerShell use `$env:TEMP`, `$env:LOCALAPPDATA`.

## 0. Facts

| Item | Value |
| --- | --- |
| App / bin name | `swarm-memory` (`package.json` `name`, `"bin": "bin.mjs"` → installed binary `swarm-memory.exe` on Windows, `swarm-memory` on macOS/Linux) |
| Template | `holepunchto/hello-pear-bare`, branch **`main`** (OTA updater in a Bare worker thread) |
| **Link (upgrade drive)** | `pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy` = `package.json` `upgrade` (commit `985f850`). Minted by `pear touch` **inside GitHub Actions** (`.github/workflows/seed.yaml`); the writer keypair lives in the Actions cache `pear-store-*`. Verified installable from a clean machine in 5 s. |
| Retired links | `pear://ahyzbzb5e9yg…` (never writable here) and `pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o` (minted on B1 box; **unreachable** — see Seeder row). `pear info` on either prints `[ Empty ]` from outside. Never stage, seed or publish them. |
| Drive state (2026-08-22 17:11, B1 clock UTC-5) | `pear info` → `version 0.1.0`, `length 3`, `fork 0`, verlink `pear://0.3.aojgk7he…`; `pear dump --list` → `/package.json`, `/by-arch/win32-x64/app/swarm-memory.exe` (56.8 MB). Local tree already at `0.1.1` (not staged yet). |
| Dev host | Windows 11. `pear` = npm wrapper `pear@3.0.0` → `%LOCALAPPDATA%\Programs\pear\pear.exe`. Platform data: `%APPDATA%\pear\` (`corestores/`, `db/`, `gc/`, `pear.log`) — verified on disk; `%LOCALAPPDATA%\pear` does not exist. |
| Writer key | **Machine-bound** (docs: "Staged and provisioned drives are machine-bound"). For the live link that machine is the GitHub runner whose `~/.config/pear` we persist in the Actions cache. Only one job may stage at a time (§5b) or the drive forks. If the cache is lost: `pear touch` again, re-point `upgrade`, rebuild, restage, reseed. |
| Seeder | **GitHub Actions** (`seed.yaml`, ~5h40m per run, cron every 5h). B1 box **cannot** seed: public IP 168.176.40.145 (university network), hyperdht reports `firewalled true` with random NAT — `pear install` timed out at 30 s, 120 s and 300 s, from the box itself and from a GitHub runner. Preferred for judging day: a teammate at home or a VPS (`docs/SEEDER.md`). |
| Judges | `pear install pear://<key>` needs `/by-arch/<their-platform>-<arch>/app/swarm-memory[.exe]` in the drive. Today only `win32-x64` is staged → §8. |

Link anatomy: a **versioned link** is `pear://<fork>.<length>.<key>` (docs, manual-deployment/deployment: "A versioned link has the form `pear://<fork>.<length>.<key>`"). `length` is the number of blocks in the drive's metadata Hypercore; every `pear stage` that writes something appends blocks (docs, troubleshooting: "Staging ends by printing the new `Latest` length and the post-stage versioned link"). Installed copies do **not** compare lengths — they compare `package.json` `version` (semver) — see §7.

## 1. One-time setup (DONE — do not repeat)

```sh
pear touch                                  # → pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy   (run in CI, see 5b)
npm pkg set upgrade=pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy
npm start                                   # must print "CLI ready" and NO INVALID_URL
```

Docs (manual-deployment/deployment, steps 0–2, verbatim): `pear touch` → `pear seed pear://<link>` → `npm pkg set upgrade=pear://<link>` → `npm version [<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease]`.

`pear touch` flags: `--json`, `--vanity <z32-prefix>`. Install name used by `pear install` = `productName ?? name` (we have no `productName` → `swarm-memory`); binary name = key of `bin` (string `bin` → `{ [name]: bin }` → `swarm-memory`).

## 2. Build the binary for the dev host

```sh
npm run make                                 # = node scripts/make.js → npm run make:win32-x64
# make:win32-x64 = bare-build --name swarm-memory --standalone --host win32-x64 --out ./out/win32-x64 bin.mjs
ls -la out/win32-x64/swarm-memory.exe        # ~57 MB PE, self-extracting .dll libs (bare-build --standalone)
out/win32-x64/swarm-memory.exe --version     # → "swarm-memory v<version>"
```

- The binary bakes `package.json` (`version`, `upgrade`, `name`) at build time (`bin.mjs` → `import pkg from './package.json'`). **Rebuild after every version bump.**
- Running the `.exe` directly is "non-dev" (`isDev` = argv[0] is `bare.exe`): storage = `bare-storage persistent()` + `/swarm-memory` → Windows `%APPDATA%\swarm-memory` (verified on disk: `%APPDATA%\swarm-memory\pear-runtime\corestore`), Linux `$XDG_DATA_HOME` or `~/.local/share/swarm-memory`, macOS `~/Library/Application Support/swarm-memory` (`bare-storage/binding.mm`: `NSApplicationSupportDirectory`, user domain); **updates are ON** by default → use `--no-updates` for smoke tests, `--storage <dir>` to isolate.
- Other hosts: `npm run make` (`scripts/make.js`) only builds the current host, but `bare-build --host <other>` does cross-build standalone binaries (verified: `npx bare-build --name swarm-memory --standalone --host linux-x64 --out <tmp> bin.mjs` from this Windows box produced `swarm-memory` in ~5 s; whether that ELF runs is untested). Docs ("Build desktop distributables") prescribe running `npm run make` on each OS → we use CI, §8.

## 3. `pear build` → deployment directory

```sh
pear build --package ./package.json \
  --win32-x64-app ./out/win32-x64/swarm-memory.exe \
  --target ./deployment
```

`pear help build` flags: `--package [path]`, `--target [path]`, `--darwin-arm64-app`, `--darwin-x64-app`, `--linux-arm64-app`, `--linux-x64-app`, `--win32-x64-app`, `--win32-arm64-app` (+ `--ios-*`, `--android-arm64`), `--json`.

Result (verified on disk, `deployment/` is gitignored):

```
deployment/
├─ package.json                      # verbatim copy of ./package.json — source of `version` and `upgrade`
└─ by-arch/                          #   for pear install AND for the OTA updater
   └─ win32-x64/
      └─ app/
         └─ swarm-memory.exe         # basename of the path given to --win32-x64-app
```

Rules:

- The file under `app/` MUST be named `swarm-memory.exe` / `swarm-memory`: `pear-install` reads `/by-arch/<platform>-<arch>/app/<binName><ext>`; the updater reads `/by-arch/<host>/app/<name>` with `name = swarm-memory.exe` on Windows (`bin.mjs`). `pear-build@1.1.1` `index.js` enforces it: basename (without ext) must equal `productName ?? name` or it throws `expected directory swarm-memory but got …`.
- `deployment/package.json` `version` MUST equal the version baked into the binaries. Order is always: bump → `npm run make` → `pear build`. Never hand-edit `deployment/package.json`.
- `--target` omitted → folder `<name>-<version>` in the cwd (docs deployment page; `pear-build@1.1.1` `index.js`: `target = path.resolve(pkg.name + '-' + pkg.version)`). Docs: keep the target outside any tree you stage ("deployment folder nested inside the app" makes stage diffs grow). We stage `deployment/` itself, never the repo root, so `./deployment` inside the repo is fine.
- `pear build` into an existing `--target` overwrites files; stale arches from older runs are **not** removed (`pear-build@1.1.1` `index.js` only `mkdir -p`s, rewrites `package.json` and mirrors each `--<host>-app` with `prefix: /<basename>`; nothing else is touched — [UNVERIFIED] for the platform's built-in `pear build`) → check with `find deployment -type f` before staging.

## 4. `pear stage <link> <dir>`

```sh
pear stage --dry-run pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o ./deployment
pear stage           pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o ./deployment
pear info            pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o    # length / version / verlink
pear dump --list     pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o    # files in the drive
```

`pear help stage` flags: `--dry-run|-d` (no write), `--ignore <paths>`, `--purge` (also delete already-staged files that now match the ignore list), `--only <paths>` (stage only these comma-separated paths), `--truncate <n>` (destructive — drops later versions), `--json`.

Observed dry-run output (17:09, local tree at 0.1.1 vs drive at 0.1.0):

```
* Staging swarm-memory

[  pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o  ]
pear://0.3.aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o

Current: 3

NOTE: This is a dry run, no changes will be persisted.

~ /by-arch/win32-x64/app/swarm-memory.exe (-56.8MB, +56.8MB)
~ /package.json (-2.2kB, +2.2kB)
^ Skipping (dry-run)

Staging dry run complete!
```

Semantics: `+` added, `~` changed, `-` removed (mirror-drive compares byte length, then streams content, exec bit and metadata). `Current: N` = length before staging; a real stage ends with `^Latest: <n>` and the new verlink `pear://0.<n>.<key>` (docs, troubleshooting page). Unchanged files are not re-uploaded. Always run the dry run first and read the file list — it is exactly what judges will download.

## 5. `pear seed <link>` — long-running, keep up through judging

```sh
# Interactive UI (one terminal, leave it open):
pear seed pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o

# Plain log lines (for a log file / unattended terminal):
pear seed --no-tty pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o 2>&1 | tee "$TEMP/swarm-memory-seed.log"
```

`pear help seed`: "Announce a project link on the network and serve its blocks to peers. Runs until you exit, or until every --until-sync peer has fully synced." Flags: `--no-tty`, `--until-sync <key>` (repeatable), `--stats-interval <ms>`, `--json`.

Observed `--no-tty` log (17:10):

```
... seeding pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o
^_^ announced
... drive key aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o
... drive length 3
... semantic version 0.1.0
... discovery key 5c7hzynfrgxo41d7jh3ei8ychekhx4cemeqmid4ayjk5cxpodciy
... content key hn3zzna8zb7qwdgcaxzimkgjwzcyz8mry1fzoxtxte5nyaifyr3y
... firewalled true
... NAT type random
... whoami schcpus5heiior5rfao1rofruidpodhfamoqj5irxq716bc1d5io
--- network 0 peers, upload 0B - 0B/s, download 0B - 0B/s
```

Rules:

- Seeding must be running **whenever anyone installs or updates**, and continuously from submission until ~17:00 ART Sunday (track rule "Keep it seeded through judging"). Re-staging does not require restarting the seeder (it serves the new length) [UNVERIFIED — after each stage, check `... drive length` / `pear info` from another machine].
- Disable sleep/hibernate on the seeding Windows box (Settings → Power, or `powercfg /change standby-timeout-ac 0`), keep it on AC + wired/hotspot.
- `firewalled true` / random NAT was observed: peers behind symmetric NAT may fail to holepunch. Mitigation (docs troubleshooting "Seeder unreachable": "add the key to multiple reachable seeders"): run `pear seed pear://<key>` on a second machine (B2 or a hotspot-connected laptop) — `pear help seed`: "Seed or reseed a project" (CLI reference: "Seed project or reseed key."), so a non-writer machine pulls the blocks from B1 and serves them. [UNVERIFIED on a second machine — do it in the ritual.]
- Do not `pear stage --truncate` or re-`touch` while seeding for judges.

## 5b. Who owns the link, and the two ways seeding breaks

The writer keypair for `ci/pear-link.txt` lives in the GitHub Actions cache; `seed.yaml` is the
only job allowed to stage. Two failure modes cost us hours — both are now guarded:

1. **Cache race minted a brand new link.** Two seed runs overlapped; the newer restored a snapshot
   saved before the older one finished, found no keypair, and silently ran `pear touch`. Every
   installed copy then pointed at an orphaned drive. Guards: the canonical link is committed
   (`ci/pear-link.txt`), minting requires `mint_new_link=true`, and a run waits for (and cancels)
   older runs before restoring — which needs `permissions: actions: write`, or the two deadlock.

2. **`pear seed` exits on EOF.** In a CI shell stdin is closed, and `pear seed` returns after ~20 s
   with a success exit code, so the step looked green while nothing was being served. Fix: hold
   stdin open and restart in a loop — `timeout 1800 sh -c 'tail -f /dev/null | pear seed --no-tty "$0"' LINK`.

A reseeder needs **no keys**, only the link: `reseed.yaml` runs one on ubuntu and one on windows,
and any teammate can run `pear seed pear://<key>` at home. More seeders on more networks is the
only real insurance.

## 6. Clean install test (every milestone)

From a directory **outside** the repo (e.g. `$TEMP/pear-install-test`), with the seeder running:

```sh
pear install pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o
# slow venue network:
pear install --timeout 120 pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o
# into a throwaway dir (dir MUST already exist — pear-install does not mkdir when --to is given):
mkdir -p "$TEMP/sm-clean" && pear install --to "$TEMP/sm-clean" pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o
# judges/testers without Pear installed:
npx pear-install pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o
```

`pear help install`: "Installs from peers directly into OS application folder". Flags: `--only <paths>`, `--timeout <seconds>` (default 30 s — applies to finding the drive/metadata; the blob download itself has no timeout), `--to <dir>`, `--dht-bootstrap <nodes>`, `--json`.

What it does (pear-install 1.2.2 `index.js`, same flags as the `pear install` command):

1. Joins the swarm on the drive's discovery key (client only), waits for `drive.core.update({ wait: true })` or throws `Network Timeout 30s`.
2. Reads `/package.json` from the drive → `name`, `productName`, `version`, `upgrade`, `bin`.
3. Resolves targets for `host = <platform>-<arch>` and mirrors `/by-arch/<host>/app/<binName><ext>` into a temp `gc/<rand>/targets` dir under the Pear data dir (`pear-install` `PEAR_DIR`: `%APPDATA%\pear` i.e. `~/AppData/Roaming/pear`, `~/Library/Application Support/pear`, `~/.config/pear` — the same `%APPDATA%\pear\gc\` the 3.2.0 platform uses on this box), then moves it into place and `chmod 755`.
4. Missing binary for the host → `Not found: pear://<key>/by-arch/<host>/app/swarm-memory` (this is what a macOS/Linux judge sees today — §8).

Default destinations (pear-install README + source):

| OS | Binary lands in | PATH |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\Programs\swarm-memory\swarm-memory.exe` | dir appended to **User** `PATH` via PowerShell `[Environment]::SetEnvironmentVariable('Path', …, 'User')` → open a **new** terminal |
| macOS | `~/.local/bin/swarm-memory` | `export PATH="$PATH:/Users/<you>/.local/bin"` (absolute `os.homedir()` path; fish: `fish_add_path …`) appended to the shell rc if not already in `PATH`/rc → new shell or `source` |
| Linux | `~/.local/bin/swarm-memory` | same as macOS |
| `--to <dir>` | `<dir>/swarm-memory[.exe]` | on Windows `<dir>` is **also** appended to User PATH |

Re-install: if the destination already exists the command refuses (`Already installed: …` / `Refusing to overwrite existing: … To reinstall, manually remove then rerun command`) → delete `%LOCALAPPDATA%\Programs\swarm-memory\swarm-memory.exe` (and `swarm-memory-<old>.exe` leftovers) or use a fresh `--to` dir.

Run the installed binary:

```sh
swarm-memory --version          # → swarm-memory v0.1.x   (new terminal on Windows for PATH)
swarm-memory                    # prints: Updates: enabled / Hello from worker / CLI ready. Press Ctrl+C to stop.
swarm-memory --storage "$TEMP/sm-store"    # isolate the updater corestore for a test
```

Storage of an installed copy: `<persistent>/swarm-memory/pear-runtime/corestore` (updater replica) and `<persistent>/swarm-memory/pear-runtime/next/<length>.<fork>/` (downloaded update, transient). Delete the whole `<persistent>/swarm-memory` dir to force a fresh replica.

CI equivalent: `.github/workflows/install-test.yaml` (`workflow_dispatch`, inputs `link`, `ota_wait_seconds`) runs `pear install --timeout 300 --to <dir> <link>` on `windows-latest`, executes `--version`, optionally keeps it running with `--storage` to watch for `applied update`.

## 7. OTA test — what the installed copy watches and how an update lands

**What is watched.** The installed binary tracks the `upgrade` link baked into it at build time (`bin.mjs` → `App` → `PearRuntime.run(workers/main.js, [updates, version, upgrade, name, dir, execPath])`). `workers/main.js` = `require('hello-pear-worker')`; `node_modules/hello-pear-worker/index.js`:

- `new Corestore(<dir>/pear-runtime/corestore)`, `new Hyperswarm()`, `new PearRuntime({ updates, version, upgrade, name, dir, app, swarm, store })`.
- if `updates !== false`: `swarm.join(pear.updater.drive.core.discoveryKey, { client: true, server: false })` + `store.replicate(connection)`. So **the upgrade drive = the same link we stage to**; no `provision`/`multisig` needed for the hackathon line.
- Events forwarded over IPC: `updating`, `updated`; on `pear:applyUpdate` it runs `await pear.updater.applyUpdate()` then replies `pear:updateApplied`.

**How a new version is detected** (`node_modules/pear-runtime-updater/index.js`, v3.2.0):

1. `_open()`: only if `bundled` (= `!!app`, i.e. the standalone binary — **not** `npm start`): wipe `<dir>/pear-runtime/next`, run `_update()` immediately, and on every `drive.core.on('append')` schedule `_update()` — delay `0` if the process booted < 60 s ago (`_bootGracePeriod`), otherwise a **random delay 0–60 min** (`delay` option not set by hello-pear-worker; we cannot change it without touching the updater → plan the demo around it).
2. `_update()`: `drive.update()` → `checkout(length)` → read `/package.json` → `semver(remote.version) > semver(this.version)`? If not, stop silently. If yes: require entry `/by-arch/<host>/app/<name>` (else error `update not found`), emit **`updating`**, mirror that prefix into `<dir>/pear-runtime/next/<length>.<fork>/`, emit **`updated`** (`updater.next` = staged dir, `nextVersion`).
3. `applyUpdate()` (triggered by `app.js` on `updated`): Windows `.exe` → copy next to `<exe dir>/swarm-memory-<newver>.exe`, rename running exe to `swarm-memory-<oldver>.exe`, rename new to `swarm-memory.exe`; macOS/Linux → `fs-native-extensions swap(nextApp, app)`. Then `next/` is removed and the worker writes `pear:updateApplied`.

**What you see in the terminal** (template `bin.mjs` / `app.js`, untouched):

```
[updater] getting new update                              ← 'updating'
[updater] update complete... applying                     ← 'updated' → app sends pear:applyUpdate
[updater] applied update, restart to run latest version   ← 'update-applied'
```

Then `swarm-memory --version` (new process) prints the new version; the old file stays as `swarm-memory-<oldver>.exe` next to it (safe to delete).

**Minimal visible update (the "release"):**

```sh
# 1. a visible change (e.g. a log line / the version itself), then bump — version MUST change or nothing happens
npm version patch                      # 0.1.1 → 0.1.2 (commits + tags; add --no-git-tag-version to commit by hand)
# 2. rebuild (bakes the new version)
npm run make
# 3. deployment dir
pear build --package ./package.json --win32-x64-app ./out/win32-x64/swarm-memory.exe --target ./deployment
# 4. stage (dry run first), seeder already running
pear stage --dry-run pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o ./deployment
pear stage           pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o ./deployment
pear info            pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o    # version 0.1.2, length > before
```

Reference flow (hello-pear-electron README, "confirm stage updates" — paraphrased, not on docs.pears.com): make a change → repeat `npm version patch` → make distributables → `pear build` → `pear stage`; "this should trigger an update in every application on every machine it was run on … Restart the application to see the latest update." The runtime surfaces this as the updater's `updating` / `updated` events.

**How the installed copy reacts — pick one reliable timing for the video:**

- (A, recommended) stage first, then start the installed copy (`swarm-memory`): the boot-time `_update()` finds `0.1.2 > 0.1.1` immediately → `updating` → `updated` → `applied` within seconds (57 MB over LAN/venue Wi-Fi). Restarting the process resets the 60 s grace period (docs troubleshooting).
- (B) start the installed copy, then `pear stage` within **60 s**: the `append` fires `_update()` with delay 0.
- (C) copy already running > 60 s when you stage: update is scheduled with a random delay up to 1 h — do not film this; just restart the copy (→ A).
- The process must stay alive long enough to download: the template's default loop ("CLI ready. Press Ctrl+C to stop.") does; any short-lived subcommand B2 adds must not be the one used to demo OTA.
- `npm start -- --updates` (dev, `bare bin.mjs`) starts the worker and replicates, but `app` is `null` → `bundled=false` → **no download, no events**. OTA can only be observed with the standalone binary.

## 8. Multi-platform: merge CI `by-arch` into the deployment before staging

`.github/workflows/build.yaml` (`workflow_dispatch`) builds `out/<host>/swarm-memory*` on 6 runners (`linux-x64`, `linux-arm64`, `darwin-arm64`, `darwin-x64`, `win32-x64`, `win32-arm64`), then job `package` runs `npx --yes pear-build@1.1.1 --darwin-arm64-app … --win32-arm64-app … --target deployment --package package.json` and uploads artifact **`by-arch`** = `by-arch.tar.gz` (`tar -C deployment -czf by-arch.tar.gz .` → contains `package.json` + `by-arch/<6 hosts>/app/swarm-memory[.exe]`).

```sh
# 0. version bumped + committed + pushed BEFORE building (CI bakes the pushed package.json into every binary)
git push
gh workflow run build.yaml --ref master && gh run list --workflow build.yaml -L 1
# 1. when green, download the merged artifact (gh CLI 2.86 on the dev host)
gh run download <run-id> -n by-arch -D "$TEMP/by-arch"
# 2. replace the local deployment with the 6-arch one
rm -rf deployment && mkdir deployment && tar -xzf "$TEMP/by-arch/by-arch.tar.gz" -C deployment
find deployment -type f                               # expect package.json + 6 binaries
grep '"version"' deployment/package.json package.json # MUST match
# 3. stage as usual
pear stage --dry-run pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o ./deployment
pear stage           pear://aojgk7heyoi1so1m8pe8mnmf8p3ryph9ypi88rmc6gemttexro4o ./deployment
```

Alternative without re-downloading everything: keep the local `pear build` for win32-x64 and copy only `by-arch/<host>/` dirs from the CI tarball into `deployment/by-arch/`; the `package.json` must still be the same version as the binaries.

Caveats:

- Version skew is fatal for OTA: a staged `package.json` whose `version` is higher than the version baked into the binaries makes every installed copy re-download on every boot (remote > current forever). Bump → commit → push → CI → stage; never stage a hand-bumped manifest over CI binaries.
- `pear-build@1.1.1` (npm) and `pear build` (CLI) accept the same `--package/--target/--<host>-app` flags; pear-build's README tree shows an extra `pear.json`, but `pear-build@1.1.1` `index.js` writes only `package.json` + `by-arch/` (no `pear.json` is created — the README tree comes from an example run with `--config pear.json`).
- **Exec bit from a Windows host.** `pear stage` reads the local dir through `localdrive` [UNVERIFIED — the 3.2.0 platform source is not inspectable from this box; `localdrive@2.2.1` behavior itself is verified], which sets an entry's `executable` from `stat.mode & S_IXUSR` (`localdrive/index.js` `isExecutable`); on this Windows host both `bare-fs` and Node report `100666` for every file (verified) → all entries are staged `executable: false`. `pear install` is unaffected (it `chmod 755`s binaries). The OTA path on macOS/Linux (`co.mirror(localdrive)` writes `0o644` when not executable, then `swap`) may leave a non-executable `~/.local/bin/swarm-memory` after an update [UNVERIFIED end-to-end]. Tell mac/linux testers: if "permission denied" after an update → `chmod +x ~/.local/bin/swarm-memory`. Only fix is staging from a Linux/macOS writer (would require a new `pear touch` + new link) — not worth it this weekend; document it in the README.
- macOS binaries are unsigned; P2P downloads carry no quarantine attribute, so Gatekeeper should not block a terminal binary [UNVERIFIED on a judge's Mac].

## 9. Ritual after each milestone (B1, no exceptions)

```
[ ] git pull --rebase; npm start → "CLI ready", no INVALID_URL
[ ] npm version patch (or minor)  → commit pushed
[ ] npm run make                  → out/win32-x64/swarm-memory.exe --version shows the new version
[ ] (milestone M3/final) gh workflow run build.yaml → download by-arch → deployment/ has 6 binaries (§8)
[ ] pear build --package ./package.json --win32-x64-app ./out/win32-x64/swarm-memory.exe --target ./deployment   (skip if §8 replaced deployment/)
[ ] pear stage --dry-run <link> ./deployment   → only the files you expect (+/~), versions match
[ ] pear stage <link> ./deployment             → note ^Latest length
[ ] pear info <link>                           → version + length as expected
[ ] pear seed <link> running (second terminal, stays up)
[ ] clean install: rm "$LOCALAPPDATA/Programs/swarm-memory/"*.exe ; cd "$TEMP" ; pear install <link> ; new terminal ; swarm-memory --version
[ ] OTA: with previous installed copy running (or started after stage) → see "[updater] applied update"; swarm-memory --version shows new version
[ ] (optional) gh workflow run install-test.yaml -f link=<link> -f ota_wait_seconds=300
[ ] append a row to the Deploy log below; commit docs/DEPLOY.md
```

### Deploy log

| When (B1 clock, UTC-5) | Version | Verlink after stage | Arches in drive | Clean install (`pear install`) | OTA observed | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-22 ~16:29 | 0.1.0 | `pear://0.3.aojgk7he…` | win32-x64 | not recorded | n/a (first stage) | first stage after `pear touch` on B1 box (commit `6443803`) |
| 2026-08-22 17:06 | 0.1.1 | _pending — deployment built, not staged at 17:11_ | win32-x64 (local) | _pending_ | _pending — first OTA test 0.1.0 → 0.1.1_ | commit `059edf8` "bump 0.1.1 for first OTA test" |
| 2026-08-22 17:29 | 0.1.1 | `pear://0.6.nna7ykdz…` | win32-x64 | **PASS — 5 s** (GitHub windows runner, run `32603016008`) | n/a | first CI-owned link; B1 box still cannot install (local network) |
| 2026-08-22 17:48 | 0.1.1 (upgrade→nna7yk) | staged by `seed.yaml` run `32603385257` | 6 arches (CI `by-arch`) | PASS | n/a | first stage where the embedded upgrade link is the reachable one |
| 2026-08-22 ~18:05 | 0.1.2 | _see `ota-test.yaml` run_ | 6 arches | PASS | _OTA 0.1.1 → 0.1.2 under test_ | publisher+installer run in parallel on CI |
| 2026-08-23 08:20 | 0.1.3 | staged by `seed.yaml` | 6 arches | re-checking | pending | **seeding was broken all night**: `pear seed` exits when stdin is at EOF in CI, so the step "succeeded" in 20 s while nothing was served. Fixed with an open stdin + restart loop. |
| 2026-08-23 08:35 | 0.1.3 | `seed.yaml` run 32614134486 | 6 arches | verifying | — | plus keyless `reseed.yaml` (ubuntu + windows) and a local reseeder on B1 box, now on a home network |
| 2026-08-23 08:45 | — | — | — | — | — | CI-owned link `amu47sy…` **forked** (runner staged from a cache restore without the drive blobs). Link ownership moved to B1 box: `pear touch` → `pear://ino4ymu38…`, rebuilt so the binaries carry it |
| 2026-08-23 08:50 | 0.1.4 | `pear://0.8.ino4ymu38…` | all 6 (474 MB) | **PASS — 8 s** (GitHub windows runner, run 32615114204) | — | staged and seeded from B1 box; `NAT type consistent` here, unlike the university network |
| 2026-08-23 ~09:05 | 0.1.5 | _pending_ | all 6 | — | _OTA 0.1.4 → 0.1.5 under test_ | includes B2 vault/core/render merged via PR #1 |

## 10. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `INVALID_URL: Invalid URL 'pear://<YOUR_KEY_HERE>'` at startup | placeholder `upgrade` in `package.json` (template README) | `pear touch` → paste link into `upgrade` (already done: `pear://aojgk7he…`); rebuild |
| `pear install` → `Network Timeout 30s` / hangs on "installing" | no seeder reachable for the link (seeder down, NAT, wrong link) | start `pear seed <link>` on B1; retry with `--timeout 120`; second seeder on another network; check `pear info <link>` from the client box shows `length > 0` |
| `pear install` → `Not found: pear://<key>/by-arch/<host>/app/swarm-memory` | no binary for that platform in the drive | §8: stage the CI `by-arch` bundle |
| `pear install` → `Already installed:` / `Refusing to overwrite existing:` | destination file exists | delete `%LOCALAPPDATA%\Programs\swarm-memory\swarm-memory*.exe` (or `~/.local/bin/swarm-memory`) and rerun, or `--to <fresh dir>` |
| `pear install --to <dir>` fails with ENOENT | `--to` dir must pre-exist (pear-install only mkdirs the default location) | `mkdir` first |
| `swarm-memory` not found after install (Windows) | User PATH changed by the installer, current shell has the old env | open a new terminal (or PowerShell: `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`); or run `%LOCALAPPDATA%\Programs\swarm-memory\swarm-memory.exe` directly |
| `swarm-memory` not found (macOS/Linux) | `~/.local/bin` not in PATH in this shell | `source ~/.zshrc` / `~/.bashrc` or `export PATH="$PATH:$HOME/.local/bin"` |
| `pear` itself not found / stale | wrapper `pear@3.0.0` via npm; binary in `%LOCALAPPDATA%\Programs\pear` (`~/.local/bin/pear` on unix) | `npm i -g pear` then new terminal; or `npx pear-install` to (re)install the platform; Linux needs `libatomic1` |
| `pear stage --dry-run` shows nothing (`Current: N`, no `+/~/-` lines) | deployment identical to what is staged (you forgot `npm run make` / `pear build` after the bump, or wrong `[dir]`) | rebuild + `pear build`; confirm with `pear dump pear://<key>/package.json -` vs `deployment/package.json` |
| dry-run shows `~ …exe (-56.8MB, +56.8MB)` although "nothing changed" | the embedded `package.json` differs (e.g. 0.1.0 → 0.1.1, observed) or the source tree changed — bare-build itself is deterministic (verified: two `bare-build --standalone --host win32-x64` runs of the same tree → identical md5 `83e3971c…`, equal to `out/win32-x64/swarm-memory.exe`) | fine if intended; otherwise `pear dump pear://<key>/by-arch/win32-x64/app/swarm-memory.exe <tmp>` + `md5sum` to compare |
| stage grows hugely each time | deployment dir nested inside the staged tree (docs) | stage `./deployment` only; never stage the repo root |
| installed copy never prints `[updater]` lines | (a) `version` not bumped (updater compares semver, not length); (b) process booted > 60 s before the stage → random delay up to 1 h; (c) running via `npm start` (`bundled=false`); (d) seeder down; (e) binary built with a different `upgrade` link | (a) `npm version patch` + rebuild + build + stage; (b) restart the installed copy; (c) use the standalone exe; (d) `pear seed`; (e) `pear dump pear://<key>/package.json -` and compare `upgrade` with the binary's (`swarm-memory --version` + git log) |
| `Error: update not found` printed by the worker (hello-pear-worker `pear.updater.on('error', console.error)` — no `[app:error]` prefix; `[app:error]` is only for IPC/pipe errors and worker exit) | drive at new version has no `/by-arch/<host>/app/swarm-memory[.exe]` for this host (`pear-runtime-updater` `_update()` throws `update not found`) | §3 naming rule / §8 |
| update downloaded but `applyUpdate` fails on Windows (`EBUSY`/`EPERM`) | another `swarm-memory.exe` process holds the file, or AV lock | close other instances, retry; leftovers `swarm-memory-<ver>.exe` can be deleted |
| mac/linux binary "permission denied" after an OTA update | exec bit lost when staging from Windows (§8) | `chmod +x ~/.local/bin/swarm-memory` |
| `pear` commands hang / `store.ready()` never resolves | stuck sidecar or lingering bare worker holding the corestore lock | `pear sidecar shutdown` then retry; kill stray `swarm-memory.exe` / `bare` processes; inspect `%APPDATA%\pear\pear.log` |
| lost B1 profile / write key | staged drives are machine-bound | `pear touch` → new link → `npm pkg set upgrade=…` → rebuild → stage → seed → update README + Hacki link |
| want to inspect what judges get | — | `pear dump --list pear://<key>`; `pear dump pear://<key>/package.json -`; `pear dump --checkout <n> pear://<key> <dir>` for an older length |

## Sources (the only ones that count)

- Local, verbatim: `pear help build|stage|seed|install|info|dump|touch|provision` (Pear 3.2.0); `pear info pear://aojgk7he…`; `pear dump --list pear://aojgk7he…`; `pear stage --dry-run …`; `pear seed --no-tty …` (25 s capture).
- Source read: `C:/SwarmMemory/bin.mjs`, `C:/SwarmMemory/app.js`, `C:/SwarmMemory/workers/main.js`, `C:/SwarmMemory/node_modules/hello-pear-worker/index.js`, `C:/SwarmMemory/node_modules/pear-runtime/index.js` (+ `lib/run/bare.js`), `C:/SwarmMemory/node_modules/pear-runtime-updater/index.js` (3.2.0), `C:/SwarmMemory/node_modules/localdrive/index.js` + `streams.js`, `C:/SwarmMemory/node_modules/mirror-drive/index.js`, `C:/SwarmMemory/node_modules/bare-storage/lib/*.js`, `C:/SwarmMemory/node_modules/bare-build/README.md`, `%APPDATA%/npm/node_modules/pear/pear.js` + `node_modules/pear-install/{index.js,README.md}` (1.2.2), `.github/workflows/{build,ci,install-test}.yaml`.
- Docs: https://docs.pears.com/how-to/operate-an-app/ · https://docs.pears.com/how-to/operate-an-app/manual-deployment/deployment/ · https://docs.pears.com/how-to/operate-an-app/manual-deployment/troubleshoot-desktop-releases/ · https://docs.pears.com/how-to/operate-an-app/build-and-package/ · https://docs.pears.com/how-to/operate-an-app/github-actions/ · https://docs.pears.com/how-to/operate-an-app/github-actions/publish-with-github-actions/ (pear-ci action — derives its **own** key from `PEAR_PRIMARY_KEY`, i.e. a different link; not used) · https://docs.pears.com/reference/pear/cli/ · https://docs.pears.com/reference/pear/runtime/ · https://docs.pears.com/explanation/deployment-releasing-apps-p2p/ · https://docs.pears.com/explanation/availability-and-blind-peering/ (blind-peer as always-on seeder — optional) · https://docs.pears.com/how-to/run-on-native/bundle-a-bare-app/ · https://docs.pears.com/getting-started/from-a-template/start-from-hello-pear-bare/
- Repos: https://github.com/holepunchto/hello-pear-bare (README: `npx pear-install pear://<key>`, troubleshooting) · https://github.com/holepunchto/hello-pear-electron#4-build-deployment-directory- (steps 4–7) · https://github.com/holepunchto/swap (track's reference OTA CLI: `pear install pear://swapb14acos6iasoz5jg8bj46zt8emdk9rmm4n9j18mtjmwbqmwo`; its deployment uses `pear stage` → `pear provision` → `pear multisig` for production) · https://github.com/holepunchto/pear-install · https://github.com/holepunchto/pear-build
