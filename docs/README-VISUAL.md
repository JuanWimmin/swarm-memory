# SwarmMemory

**P2P team memory for Soroban / smart-contract projects.** The knowledge graph of a repo — contracts, functions, storage, TTL/auth risks, human notes — syncs between teammates with **no server**. Install and update over Pear.

> Template: [`hello-pear-bare`](https://github.com/holepunchto/hello-pear-bare) branch **`main`** (updater in a Bare worker).  
> Reuse (Apache-2.0, pre-hackathon): vault format + graph model from `stellar-memory`. Pear app, `pear://` link, and release are from this weekend.

[![Pear](https://img.shields.io/badge/pear-installable-c6e05a?labelColor=0b0f14)](https://docs.pears.com)
[![OTA](https://img.shields.io/badge/OTA-P2P-f4c95d?labelColor=0b0f14)](https://docs.pears.com)
[![License](https://img.shields.io/badge/license-Apache--2.0-8b9bb0?labelColor=0b0f14)](LICENSE)

## Install (clean machine)

```sh
pear install pear://amu47syduoenxojzur88fi5sq3ohqtwg6fms4bfuonag3h1d9r1o
swarm-memory resume
```

Join a teammate’s swarm: `swarm-memory join <invite>`.

## Graph viewer (front-end)

`swarm-memory graph --html graph.html` writes a **self-contained** dark viewer (no CDN, opens as `file://`).

- Nodes colored by type (contract, function, storage, event, error, deployment, note, task)
- **Warn** = amber ring · **critical** = red pulse
- Click a node → side panel (`label`, `summary`, `severity`, edges)
- Filter chips + **risks** (warn/critical only) + **focus** (neighbors of the selected node)

Local preview while the CLI placeholder is still in the file:

```sh
node web/serve-preview.mjs
```

## Demo narrative (video, 3 min, English)

1. Problem: contract context dies in silos.
2. Clean machine: `pear install` → `resume`.
3. Peer B joins with an invite — graph replicates with no server.
4. OTA: a release reaches the installed copy.
5. Same graph in the HTML viewer for humans.

Storyboard + OBS cards: `docs/VIDEO_STORYBOARD.md`, `web/titles.html`.
