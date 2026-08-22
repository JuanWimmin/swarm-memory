# SwarmMemory — Plan técnico de equipo

> **Aleph Hackathon 2026 · Pears Track · Deadline: domingo 23-ago 12:00 ART**
> Equipo: **B1** (backend senior — juanp) · **B2** (backend) · **F** (front, vibecoder)
> Juez: dmc (creador de Pear). Premios $1,000/$500 al mismo challenge.

---

## 0. La frase que no se negocia

> *"Your tool must be installable with `pear install pear://<key>` … a repo that builds locally isn't enough. If that command doesn't work, the entry doesn't count."*

Todo lo demás es opcional. Por eso el pipeline de deploy se construye **primero** y se re-verifica **después de cada milestone**.

---

## 1. Qué construimos

**SwarmMemory**: la memoria viva de un proyecto de smart contracts, compartida entre los peers del equipo **sin ningún servidor**, instalada y actualizada P2P vía Pear.

- Un CLI que lee la *vault* de conocimiento de un repo Soroban (contratos, funciones, storage, riesgos TTL/auth, drift on-chain, notas humanas) y la muestra en terminal (`resume`).
- La vault se **publica a un swarm privado del equipo** (Autobase multi-writer): cada dev aporta sus scans y notas; todos ven el grafo consolidado en vivo. Un peer nuevo se une con un **código de invitación** — cero config, cero servidor.
- Un **visor HTML** autocontenido del grafo (`graph --html`) para humanos visuales y para el video.
- Distribución evergreen: `pear install pear://<key>` y **OTA updates** que llegan solos.

**Reuso declarado** (permitido por el track: *"You may reuse existing code. We will only judge what you built during the hackathon"*): formato de vault, modelo de grafo y análisis provienen de `stellar-memory` (Apache-2.0, pre-hackathon, del equipo). **Todo el código de este repo se escribe este fin de semana**, y el deploy Pear (app, link, release) es nuevo — como exige el track.

### Narrativa del video (3 min, inglés — F es el director)

| t | Escena |
|---|---|
| 0:00 | Problema: el contexto de un proyecto de contratos vive en cabezas y silos; el onboarding duele. |
| 0:35 | Máquina limpia: `pear install pear://<key>` → `swarm-memory resume` → el grafo del proyecto demo aparece. |
| 1:15 | Peer B: `swarm-memory join <invite>` → el grafo se replica **sin servidor**; A añade una nota → B la ve en vivo. |
| 2:05 | **OTA**: publicamos release desde la máquina dev → la copia instalada de B se actualiza sola (requisito del video). |
| 2:45 | Cierre: zero infra, evergreen binary, la memoria del equipo viaja por el swarm. |

---

## 2. Reglas que descalifican (verbatim del track)

1. `pear install pear://<key>` debe funcionar — **"the entry doesn't count"** si no.
2. **"Ship working P2P OTA updates. Demonstrate a real update reaching an installed copy"** — en el video.
3. **"Keep it seeded through judging"** — una máquina seedeando hasta ~17:00 ART del domingo.
4. README debe decir **de qué branch/variant del template partimos** (usamos `main`).
5. Video demo en **inglés** (o subtítulos EN precisos), máx 3 min, público.
6. AI slop = descarte: *"Pear and Bare are not Node.js… expect hallucinated Node APIs"*. Regla de equipo: toda API se verifica contra docs.pears.com antes de commitear.

---

## 3. Arquitectura

Partimos de `hello-pear-bare` branch **`main`** (updater OTA en worker Bare — el *process shape* correcto para un TUI de vida larga, y la elección de branch es criterio de juzgado).

```
┌────────────────────────────── swarm-memory (Bare CLI) ──────────────────────────────┐
│                                                                                     │
│  bin.mjs ─ paparam (subcomandos)          workers/main.js  ←── NO SE TOCA           │
│     │                                     (hello-pear-worker: OTA updater,          │
│     ├── src/commands/…   (B2)              pear-runtime, upgrade link)              │
│     │      resume · graph · status                                                  │
│     │      publish · invite · join · peers                                          │
│     │                                                                               │
│     ├── src/vault/       (B2)  lector .stellar-memory (index.json + notas md)      │
│     ├── src/core/        (B2)  modelo de grafo + queries (JS puro, sin I/O)        │
│     ├── src/render/      (B2)  salida ANSI (picocolors) + export graph.json/html   │
│     │                                                                               │
│     └── src/sync/        (B1)  Corestore + Autobase (view=Hyperbee) + Hyperswarm   │
│            apply() = política de merge     blind-pairing (patrón autopass)          │
│                                                                                     │
│  web/template.html       (F)   visor de grafo autocontenido (placeholder JSON)      │
└─────────────────────────────────────────────────────────────────────────────────────┘
         ▲ deploy: pear touch → pear stage → pear seed → pear install pear://<key>
         ▲ binarios multi-OS: npm run make / CI .github/workflows/build.yaml
```

### Decisiones cerradas

| Tema | Decisión | Por qué |
|---|---|---|
| Template branch | `main` (worker thread) | TUI de vida larga; P2P fuera del main thread; criterio del juez |
| Args CLI | `paparam` (ya en template) | Bare-nativo; NO commander (Node) |
| Colores TUI | `picocolors` | JS puro, corre en Bare |
| Node builtins | Solo `bare-*` (`bare-fs`, `bare-path`, `bare-os`, `bare-process`) | Bare ≠ Node |
| Deps nativas | **Prohibidas** | Rompen el build multi-plataforma |
| Sync engine | Plan A: `autopass` (3.4.1) como store con invites listos · Plan B: Autobase+blind-pairing a mano (copiando autopass) | Timebox 45 min del spike decide (B1, M1) |
| Scanner Rust | **No se porta.** El CLI lee vaults ya escaneadas (demo dataset incluido); `publish` acepta `--vault <dir>` | Riesgo/beneficio; el valor demo está en sync+OTA |
| Updater | `app.js` + `workers/main.js` intactos | Es el requisito de entrada; no se toca lo que funciona |

### Trampas conocidas (pegadas de la página del track)

- `INVALID_URL` al arrancar = el placeholder `pear://<YOUR_KEY_HERE>` del `upgrade` en package.json sigue ahí → correr `pear touch` y pegar el link real.
- En variant daemon los errores de update van a `<storage>/updates.log` (no usamos daemon, pero por si acaso).
- Dev mode: `npm start` corre con `--no-updates`; para probar OTA local: `npm start -- --updates`.

---

## 4. Contratos entre módulos (interfaces congeladas)

### 4.1 `graph.json` (B2 produce → F consume) — v1, congelado a las 19:00

```jsonc
{
  "meta": { "project": "private-payroll", "generatedAt": "ISO-8601", "source": "local|swarm", "peers": 2 },
  "nodes": [{
    "id": "contract/payroll",            // <tipo>/<slug>, único
    "type": "contract|function|storage|event|error|deployment|note|task",
    "label": "Payroll",
    "summary": "texto corto para el panel",
    "severity": "info|warn|critical",    // pinta el nodo
    "data": {}                            // extras por tipo (opcional)
  }],
  "edges": [{ "from": "contract/payroll", "to": "contract/treasury", "type": "calls|reads|emits|raises|notes|deployed_as" }]
}
```

### 4.2 Contrato del visor HTML (F)

- Archivo: `web/template.html`, **autocontenido** (cero CDN, cero red — debe abrir como `file://` offline).
- Contiene UNA línea: `const GRAPH = /*__GRAPH_DATA__*/;` — el CLI reemplaza el placeholder por el JSON real.
- Aceptación: renderiza nodos coloreados por `type`, aristas, click en nodo → panel lateral con `label/summary/severity`, filtro por tipo, y se ve bien en la grabación (tema oscuro OK como único tema).
- Datos de prueba: `web/mock-graph.json` (lo entrega B2 en M0). **F nunca toca `src/` ni `package.json`.**

### 4.3 Layout Hyperbee (B1) — view de Autobase

```
n!<id>                  → JSON del nodo
e!<from>!<type>!<to>    → JSON de la arista
m!<clave>               → metadatos (nombre proyecto, etc.)
```

Ops appendeadas: `{op:'put-node'|'put-edge'|'del-node'|'add-writer', …, at:<lamport>}`.
`apply()`: last-writer-wins por `at`, **excepto** nodos `type:'note'` (humanos): nunca los pisa un scan automático — misma política que los auto-blocks de stellar-memory.

### 4.4 Superficie CLI (B2 implementa; B1 conecta `sync`)

```
swarm-memory                  # = resume
swarm-memory resume           # vista de contexto del proyecto
swarm-memory publish [--vault <dir>]   # importa .stellar-memory → swarm
swarm-memory invite           # genera código de invitación
swarm-memory join <code>      # se une al swarm del equipo
swarm-memory peers            # peers conectados + estado sync
swarm-memory graph [--json <f>] [--html <f>]
swarm-memory status           # versión, updates, storage
# heredados del template: --version, --storage <dir>, --no-updates
```

---

## 5. Reparto de trabajo

### B1 — juanp (lo pesado y fundamental)

| # | Tarea | Cuándo |
|---|---|---|
| 1 | **Pipeline de deploy** (M0, bloqueante): `pear touch` → link en `upgrade` → rename paquete a `swarm-memory` → `npm run make` → stage + seed → `pear install` en carpeta/máquina limpia → **provocar un OTA update y verlo aterrizar**. Documentar cada comando exacto en `docs/DEPLOY.md`. | 17:00–19:00 |
| 2 | Repo GitHub público + push + Actions ON (build.yaml ya compila darwin/linux/win — binarios multi-OS para los jueces). | 19:00 |
| 3 | **Spike sync (timebox 45 min)**: ¿autopass sirve como store KV con invites? Sí → Plan A; No → Plan B (Autobase+blind-pairing copiando el código de autopass). | 19:00–20:00 |
| 4 | **src/sync/**: SwarmStore (Corestore+Autobase+Hyperswarm), apply() con política de merge, invite/join/peers, publish (vault→base vía API de B2), watch para refresco en vivo. | 20:00–01:00 |
| 5 | Integración resume/graph ← view P2P (con B2). Re-stage + re-verify install. | 01:00–02:00 |
| 6 | **Ensayo OTA final** con copia instalada real + release. Congelar. | 02:00–03:00 |
| 7 | Apoyo a F: conectar `graph --html` con template.html; revisar su HTML; grabar los segmentos técnicos del video. | 07:00–09:00 |
| 8 | Submission en Hacki + **seeding hasta 17:00 ART** (máquina dedicada). | 10:00–17:00 |

### B2 — backend (dominio + CLI, todo testeable sin P2P)

| # | Tarea | Cuándo |
|---|---|---|
| 1 | Scaffold `src/` + copiar demo vault (de `C:\StellarMemory\stellar-memory\.stellar-memory`) a `demo/vault/`. Entregar `web/mock-graph.json` a F. | 17:00–18:00 |
| 2 | **src/vault/**: lector de `.stellar-memory` (index.json + notas md → nodos/aristas). Solo `bare-fs`/`bare-path` (correr en Node para probar rápido está OK — la CI corre `npm test` con brittle). | 18:00–20:00 |
| 3 | **src/core/**: modelo del grafo + queries (JS puro, sin I/O — inyectar fs). | 18:00–20:00 |
| 4 | **src/commands/ + src/render/**: `resume` (la vista estrella: header del proyecto, contratos, señales warn/critical, tareas), `graph --json/--html` (inyección en template de F), `status`. ANSI con picocolors. | 20:00–00:00 |
| 5 | Adaptador de datos: mismo código lee de vault local **o** de la view Hyperbee de B1 (interfaz `GraphSource: { nodes(), edges(), meta() }` — congelada a las 20:00). | 00:00–01:00 |
| 6 | Tests brittle de vault/core + fixtures. Pulir salidas para el video (son las tomas). | 01:00–03:00 |
| 7 | README técnico: setup clean-clone, comandos, branch del template, disclosure de reuso. | 07:00–09:00 |

### F — front (vibecoder) · **regla de oro: solo trabaja en `web/`, `docs/` y el video**

| # | Tarea | Cuándo |
|---|---|---|
| 1 | Setup: clonar repo, abrir `web/`. Recibe `mock-graph.json` + este contrato (§4.2). Prompt sugerido para su IA: *"Single self-contained HTML file, no external resources, that renders this JSON as an interactive graph (nodes colored by type, click opens side panel, filter by type). Data comes from `const GRAPH = /*__GRAPH_DATA__*/;`"* | 17:00–18:00 |
| 2 | `web/template.html` v1: grafo renderizado con mock. Iterar estética: tema oscuro, branding SwarmMemory (🍐+⭐), legible en video 1080p. | 18:00–22:00 |
| 3 | v2: panel de detalle, filtros, contador de peers desde `meta`, micro-animación de entrada (sobria). | 22:00–01:00 |
| 4 | **Storyboard del video** (guión inglés, 3 min, escena por escena de §1) + assets (título, lower-thirds). | 01:00–03:00 |
| 5 | README visual: hero, badges, GIF/screenshots del TUI y del visor. | 07:00 |
| 6 | **Grabación y edición del video** (dirige; B1/B2 ejecutan comandos en cámara). Subir sin listar a YouTube. | 07:00–10:00 |

---

## 6. Cronograma y checkpoints de integración

| Hito | Hora ART | Gate de salida (si falla → fallback) |
|---|---|---|
| **M0** | 19:00 | `pear install pear://<key>` funciona + 1 OTA visto. B2: vault parsea demo. F: mock renderiza. |
| **M1** | 22:00 | `resume` real en terminal · spike sync decidido · HTML v1 |
| **M2** | 02:00 | invite/join entre 2 máquinas replica el grafo · `graph --html` genera visor con datos reales |
| **M3** | 03:00 | **FEATURE FREEZE** · ensayo OTA completo · re-stage final · CI verde con binarios |
| **M4** | 09:00 | README completo · video grabado y editado |
| **M5** | 10:30 | **Submitted en Hacki** (buffer 90 min) · seeding ON hasta 17:00 |

**Ritual tras cada hito:** B1 re-stagea y re-corre `pear install` en carpeta limpia. Sin excepción.

Sync de equipo: standup de 5 min por voz a cada hora en punto. Bloqueado >20 min = se dice en el canal, nadie se hunde en silencio. Mentores del track en el topic de Pears del Telegram; el equipo Pear vive en Keet (no Discord).

---

## 7. Convenciones

- **Git**: commits pequeños y frecuentes con mensajes reales — el historial es la **prueba de que todo se hizo este finde** ("everything will be checked"). Trunk-based, sin PRs entre nosotros (no hay tiempo); `git pull --rebase` antes de push.
- **Estilo**: prettier del template (`npm run format`). Sin TypeScript (no hay build step en Bare — JS + JSDoc donde aporte).
- **IA con grounding**: antes de aceptar código generado que use APIs de runtime: verificar contra https://docs.pears.com/reference/. Si tu IA escribe `require('fs')`, `process.env`, `child_process` → **rojo**: son `bare-fs`, `bare-process`, etc.
- **Nada de deps nuevas sin avisar a B1** (cada dep es riesgo Bare + riesgo build).

## 8. Riesgos y fallbacks

| Riesgo | Prob. | Fallback |
|---|---|---|
| Autopass no encaja como KV genérico | Media | Plan B: Autobase + blind-pairing a mano (autopass como referencia de código) |
| Autobase pelea a las 2 AM | Media | El track dice *"the tool itself doesn't have to be peer-to-peer"*: entrada válida = CLI útil + deploy + OTA. Sync pasa a "single-writer replica" (Hyperbee simple replicada por Hyperswarm, solo lectura para peers) |
| Cross-build de binarios falla local | Media | CI de GitHub Actions (build.yaml) compila las 6 plataformas |
| `pear install` flaky en red del venue | Baja | Hotspot móvil + segunda máquina seedeando |
| Se cae la red / npm | Ya pasó hoy | Deps ya instaladas; `npm ci` desde package-lock commiteado |
| Video se come el tiempo | Alta | Storyboard listo a las 03:00; tomas de terminal grabadas por separado (asciinema/OBS) y editables sin re-shoot |

## 9. Checklist de entrega (Hacki, antes de 12:00 — nosotros: 10:30)

- [ ] Repo público con README: qué es, **branch `main` del template**, setup clean-clone, disclosure de reuso, plataformas con binarios
- [ ] Link `pear://` en el README y en el form de Hacki
- [ ] Video ≤3 min inglés (instalación + OTA aterrizando) — link público
- [ ] BUIDL en Hacki con todos los emails del equipo (cuentas aprobadas ✔ verificar YA)
- [ ] Track seleccionado: Pears
- [ ] Máquina seedeando hasta el fin del juzgado (~17:00 ART)

## 10. Referencias (las únicas que valen — ignorar tutoriales pre-v3)

- Template guide: https://docs.pears.com/getting-started/from-a-template/start-from-hello-pear-bare/
- CLI reference (v3): https://docs.pears.com/reference/pear/cli/
- Release & distribute: https://docs.pears.com/how-to/operate-an-app/
- Store & replicate (Hypercore/Corestore/Hyperbee): https://docs.pears.com/how-to/store-and-replicate/
- Connect to peers (Hyperswarm): https://docs.pears.com/how-to/connect-to-peers/
- autopass (patrón completo pairing+Autobase): https://github.com/holepunchto/autopass
- swap (referencia OTA del propio track): https://github.com/holepunchto/swap
- Bare modules: https://docs.pears.com/reference/modules/bare-modules/

Versiones verificadas hoy en npm: hyperswarm 4.17.0 · autobase 7.28.1 · corestore 7.12.0 · hyperbee 2.27.3 · blind-pairing 2.3.1 · autopass 3.4.1 · b4a 1.8.1 · pear-runtime 1.2.0 (template) · Pear CLI 3.2.0.
