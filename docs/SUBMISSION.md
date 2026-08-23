# Submission checklist — Aleph Hackathon 2026, Pears Track

Deadline **Sun 23-Aug 12:00 ART** · judging from 13:00 ART · keep seeding until ~17:00 ART.

## What the judges need

| Item | Value |
| --- | --- |
| Install command | `pear install pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy` |
| Repo | https://github.com/JuanWimmin/swarm-memory (public, branch `master`) |
| Template + variant | `holepunchto/hello-pear-bare`, branch **`main`** (OTA updater in a Bare worker thread) — stated in the README |
| Platforms in the drive | win32-x64, win32-arm64, darwin-x64, darwin-arm64, linux-x64, linux-arm64 |
| Video (≤3 min, English) | **owner: F** — must show `pear install` on a clean machine and an OTA update landing |
| Track | Pears |

## Seeding through judging — the one thing that must not stop

The link is owned and served by GitHub Actions (`.github/workflows/seed.yaml`): each run seeds for
~5h30m and a cron re-launches every 5h. **Cron runs can be delayed or skipped** — before walking
away, dispatch a run manually and check it is in the `Seed` step:

```sh
gh workflow run seed.yaml -R JuanWimmin/swarm-memory -f seed_minutes=330 -f stage=false
gh run list -R JuanWimmin/swarm-memory -w seed.yaml -L 1
```

Better, if anyone on the team is on a normal home connection: run a second seeder there — it needs
no keys, only the link (see `docs/SEEDER.md`):

```sh
npm i -g pear
pear seed pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy
```

Two seeders on different networks is the cheap insurance against the entry being unjudgeable.

## Publishing a new release (B1 only)

```sh
npm version patch && git push                       # installed copies compare semver
gh workflow run build.yaml                          # 6 platforms → by-arch artifact
gh workflow run seed.yaml -f stage=true             # stages that artifact, then seeds
```

The seeder refuses to stage if the `upgrade` link baked into the binaries is not the canonical
`ci/pear-link.txt`, and it never mints a new link silently.

## Verification runs (evidence for the write-up)

```sh
gh workflow run install-test.yaml -f link=pear://amu47sy... -f ota_wait_seconds=0    # clean install
gh workflow run ota-test.yaml    -f link=pear://amu47sy...                            # OTA end to end
```
