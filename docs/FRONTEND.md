# Front-end lane (F)

F owns `web/` and `docs/` only. Never `src/` or `package.json`. Updater files (`app.js`, `workers/main.js`) are off-limits.

## Architecture (what the viewer consumes)

B2 emits `graph.json`. The CLI injects it into `web/template.html` by replacing the placeholder:

```js
const GRAPH = /*__GRAPH_DATA__*/;
```

Schema (frozen):

- `meta.project`, `meta.generatedAt`, `meta.source` (`local` \| `swarm`), `meta.peers`
- `nodes[]`: `id`, `type`, `label`, `summary`, `severity` (`info` \| `warn` \| `critical`), optional `data`
- `edges[]`: `from`, `to`, `type` (`calls` \| `reads` \| `emits` \| `raises` \| `notes` \| `deployed_as`)

Node types: `contract` `function` `storage` `event` `error` `deployment` `note` `task`.

The file is self-contained: no CDN, no webfonts, must work as `file://` after injection.

Upstream (B1): installable link is in `ci/pear-link.txt`. F does not change `package.json`.

## Local preview

```sh
node web/serve-preview.mjs
```

Opens the template with `web/mock-graph.json` injected. Keep the placeholder in `template.html` when committing.

```sh
node web/inject-graph.mjs --in web/mock-graph.json --out graph.html
```

Query flags for capture: `?select=<node-id>`, `?risks=1`, `?focus=1`.

## Acceptance

- Nodes colored by type; warn = amber ring; critical = red pulse
- Edges drawn; click → side panel (`label`, `summary`, `severity`, type, related edges)
- Type filter chips; **risks** (warn/critical) and **focus** (neighbors); title = `meta.project`; peer count from `meta.peers`
- Dark theme, large type for 1080p capture
- Video cards: `web/titles.html` · README copy: `docs/README-VISUAL.md`
