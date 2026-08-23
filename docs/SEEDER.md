# Seeder runbook — keeping `pear install pear://<key>` alive through judging

> **Why this file exists.** B1's dev machine sits on a university network (symmetric NAT,
> firewalled). From there `pear seed` announces, but peers cannot hole-punch in: both a local
> clean install and a GitHub-runner install timed out with 0 peers. The entry only counts if
> `pear install pear://<key>` works for the judges, so the link must be **owned and seeded from a
> machine on a normal network** (home router / VPS with public IP). Anyone on the team can do it.

## Who serves the link right now

**B1's Windows machine owns and seeds `pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy`.**
It holds the writer key (in `%APPDATA%\pear`), it is the only machine that can publish a release,
and it must stay awake with `pear seed` running until judging ends (~17:00 ART).

Redundancy: `.github/workflows/reseed.yaml` runs two keyless reseeders (ubuntu + windows) that pull
the drive and serve it on. Any teammate can add another with one command — see Option A.

Why not CI as the owner: a runner that stages from an Actions-cache restore which did not carry the
drive blobs **forks the drive**, and every `pear install` then dies with
`ERR_INVALID_MANIFEST: Unable to read application package.json`. We lost two links that way.

## Option A — teammate machine at home (15 min, recommended)

Requirements: Node.js ≥ 20, the machine stays on (lid open, no sleep) until **Sun 23-Aug ~17:00 ART**.

```sh
npm i -g pear            # installs the Pear CLI bootstrapper
pear versions            # first run downloads the platform (P2P) — wait for it
pear touch               # → prints pear://<key>  ← SEND THIS LINK TO B1
```

B1 then sets `upgrade` = that link in `package.json`, pushes, and GitHub Actions (`Build`) produces
`by-arch.tar.gz` (all 6 platforms, ~340 MB). Download it from the Actions run (Artifacts → by-arch),
then on the seeder machine:

```sh
mkdir deployment && tar -xzf by-arch.tar.gz -C deployment   # → deployment/package.json + by-arch/<host>/app/
pear stage --dry-run pear://<key> ./deployment
pear stage pear://<key> ./deployment
pear seed pear://<key>                                       # leave this running. Ctrl+C stops seeding.
```

Every release afterwards = download the new by-arch.tar.gz → `pear stage` again → installed copies
update themselves (OTA). `pear seed` can stay running while you stage.

Verify from anywhere else: `pear install pear://<key>` then run the installed `swarm-memory`.

## Option B — VPS / cloud VM with public IP (best reachability)

Same commands as A (Linux). Allow inbound UDP in the security group/firewall. Run the seeder under
`tmux`/`nohup`: `nohup pear seed --no-tty pear://<key> > seed.log 2>&1 &`.

## Option C — GitHub Actions seeder (automated fallback, no machine needed)

Workflow `.github/workflows/seed.yaml`: a runner owns a link (keypair persisted in the Actions
cache), stages the latest `Build` artifact and seeds for ~5h40m; a cron re-launches it every 5h
(overlapping). Link is printed as a notice on the first run. Caveat: runner NAT type is unknown —
verify with `pear install` from a home connection before relying on it.

## Verification checklist (before saying "it works")

1. `pear info pear://<key>` shows `version`, `length`, `by-arch` files.
2. From a **different network**: `pear install --to ./x pear://<key>` → binary runs `--version`.
3. Installed copy running with updates on → `pear stage` a bump → log shows
   `[updater] getting new update` → `update complete... applying` → `applied update`.
4. Seeder still running when you walk away.
