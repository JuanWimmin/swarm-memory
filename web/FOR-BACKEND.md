# Para B1 / B2 — contrato del visor (F)

`graph --html` ya puede inyectar. No toquen el marcador.

```js
const GRAPH = /*__GRAPH_DATA__*/;
```

`src/render/html.js` hace `html.replace('/*__GRAPH_DATA__*/', JSON.stringify(doc))`.

- Archivo: `web/template.html` (autocontenido, cero CDN, `file://` OK)
- Schema: `web/mock-graph.json` / TEAM_PLAN §4.1
- Helpers F: `node web/inject-graph.mjs --in <graph.json> --out graph.html`

Si el visor no aparece en un clone fresco, este archivo no está en `master` todavía.
