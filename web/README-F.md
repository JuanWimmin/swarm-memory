# Para F — tu carril completo 🍐

Tu trabajo vive SOLO en esta carpeta (`web/`) más el video y el README visual. **Nunca toques `src/` ni `package.json`.**

## Tu entregable: `web/template.html`

Un único archivo HTML **autocontenido** (cero CDN, cero internet — debe abrir con doble-click como `file://` sin red) que visualiza el grafo del proyecto.

**La única regla técnica inquebrantable** — tu HTML debe contener exactamente esta línea:

```js
const GRAPH = /*__GRAPH_DATA__*/;
```

El CLI reemplaza `/*__GRAPH_DATA__*/` por el JSON real. Para desarrollar, copia el contenido de `mock-graph.json` en ese lugar (y antes de commitear, vuelve a dejar el placeholder).

## Qué debe hacer (criterios de aceptación)

1. Renderiza los `nodes` como grafo interactivo, coloreados por `type` (contract, function, storage, event, error, deployment, note, task).
2. Los nodos con `severity: "warn"` y `"critical"` deben saltar a la vista (borde/glow ámbar y rojo).
3. Dibuja las `edges` entre nodos.
4. Click en un nodo → panel lateral con `label`, `summary`, `severity` y su tipo.
5. Filtro por tipo (botones o chips).
6. Muestra `meta.project` como título y `meta.peers` ("2 peers conectados") en una esquina.
7. Tema oscuro (único tema está bien) y legible en un video a 1080p — fuentes grandes.

## Prompt sugerido para tu IA (ajústalo a tu gusto)

> Create a single self-contained HTML file with no external resources (no CDN, no fonts from the internet) that renders a knowledge graph from a JSON variable declared as `const GRAPH = /*__GRAPH_DATA__*/;`. Nodes have {id, type, label, summary, severity}; edges have {from, to, type}. Draw an interactive force-directed graph on a canvas: color nodes by type, highlight severity "warn" in amber and "critical" in red, click a node to open a side panel with its details, add type filter chips, dark theme, large readable text. Here is sample data: (pega mock-graph.json)

## Tus otras tareas (ver TEAM_PLAN.md §5, carril F)

- Storyboard del video de 3 min en inglés (el guión escena a escena está en TEAM_PLAN.md §1).
- Grabación y edición del video (tú diriges; B1 y B2 ejecutan comandos en cámara).
- README visual del repo: hero, badges, screenshots/GIF.

Cualquier duda sobre el JSON → B2. Cualquier duda de integración → B1.
