# SwarmMemory — Battle Plan (Aleph Hackathon 2026, Pears Track)

> Deadline: **domingo 23-ago 12:00 ART** · Juez: **dmc, creador de Pear** (Keet @dmc0) · Demo: video 3 min inglés, asíncrono
> Premios: $1,000 / $500 al mismo challenge único (dos chances con una entrada)

**Qué es:** la memoria de proyecto de `stellar-memory` convertida en **herramienta CLI P2P**: el grafo de conocimiento de un equipo Soroban, sincronizado entre peers sin servidor, distribuido e instalado vía Pear con OTA updates.

## Reglas verificadas (verbatim de la página del track)

- Challenge único: "Build a standalone CLI tool, deploy it with the Pear CLI, and make it installable with pear install, with peer-to-peer OTA updates."
- **Requisito duro:** "your tool must be installable with `pear install pear://<key>`… genuinely deployed with the Pear CLI and seeded, a repo that builds locally isn't enough."
- "Ship working P2P OTA updates. **Demonstrate a real update reaching an installed copy**" (en el video).
- Reuso: "**You may reuse existing code.** We will only judge what you built during the hackathon. **The Pear deployment must be new**: the app, the pear:// link, and the release have to be from this weekend."
- "The tool itself doesn't have to be peer-to-peer… using the wider Pear ecosystem is encouraged" → nuestra capa P2P es diferenciador, no requisito: si Autobase pelea, el MVP sigue vivo.
- Criterios del juez: instala limpio con pear install · OTA funciona end-to-end · **process shape sensato** (elección de branch del template) · algo que una persona usaría de verdad.
- ⚠️ "Tether · you can enter 1 track from this sponsor" — mismo sponsor que WDK; confirmar con organizadores si dos proyectos distintos pueden ir a dos tracks Tether.

## Arquitectura

```
swarm-memory (Pear CLI, Bare runtime)
├── Reuso declarado (stellar-memory, Apache-2.0, pre-hackathon):
│   ├── scanner/ (Rust parsing, TTL/auth/drift analysis)  ← puro cómputo local, portable
│   ├── core/    (modelo de grafo: 16 node types, 12 edge types)
│   └── vault    (formato: markdown + index.json)
├── NUEVO este finde (lo que se juzga):
│   ├── Empaquetado Pear/Bare (template hello-pear-bare, branch main = worker thread)
│   ├── TUI: resume / graph / peers / sync status
│   ├── Capa P2P: Corestore + Autobase (view = Hyperbee) + Hyperswarm
│   │   └── pairing por invite (blind-pairing, patrón autopass)
│   │   └── cada peer = writer core; apply() = política de merge (auto-blocks vs notas humanas)
│   └── OTA: pear-runtime updates API (patrón swap: github.com/holepunchto/swap)
```

- **Template**: `github.com/holepunchto/hello-pear-bare` branch **`main`** (updater en Bare worker thread — correcto para TUI de larga vida con lógica P2P fuera del main thread). La elección de branch ES un criterio de juzgado.
- **Trampas conocidas**: placeholder `upgrade` link → `INVALID_URL` hasta correr `pear touch` y pegarlo en package.json. En daemon variant los errores van a `<storage>/updates.log`.
- **Bare ≠ Node** ("models confidently assume they are"): deps de stellar-memory son puro-JS (commander, zod, yaml, smol-toml, picocolors ✓). Node builtins vía `bare-node` aliases (fs, path, crypto). `child_process`→ enriquecimiento on-chain opcional (`scan --offline` ya existe); si bare-subprocess pelea, se corta. MCP server: fuera del build Pear (vive en el paquete npm original).
- Fallback de empaquetado: bundle con esbuild a un solo JS si la resolución de módulos da guerra.

## Demo narrative (video 3 min, inglés)

1. (0:00) Problema: team memory for smart-contract projects dies in silos; git-committed context goes stale.
2. (0:40) `pear install pear://<key>` en una máquina limpia → `swarm-memory resume` muestra el grafo del proyecto payroll demo.
3. (1:20) Peer B se une con un invite code → el grafo aparece SIN servidor; Peer A añade una nota → replica en vivo.
4. (2:10) **OTA**: push de release desde la máquina dev → la copia instalada de Peer B se actualiza sola (requisito de video).
5. (2:45) Cierre: zero infra, evergreen binary, memoria de equipo que viaja por el swarm.

## Orden de ejecución

1. **PoC despliegue primero**: hello-pear-bare tal cual → `pear touch` → stage/seed → `pear install` desde otra carpeta/máquina → OTA update visto. (Sin esto no hay entrada válida.)
2. Embeber lector de vault + `resume` TUI → 3. Scanner integrado → 4. Autobase sync + pairing → 5. Polish + video + README.
Regla: tras cada milestone, re-stage y verificar que `pear install` sigue funcionando.

## Submission checklist (verbatim)

- [ ] Repo público + README (qué construimos + **qué branch/variant del template usamos**)
- [ ] Link `pear://` — **mantener seedeado durante todo el juzgado** (máquina encendida hasta ~17:00 ART domingo)
- [ ] Video demo: instalación + OTA update aterrizando
- [ ] Plataformas con binarios construidos (win-x64 mínimo; linux si da tiempo)

## Recursos clave

- Guía template: docs.pears.com/getting-started/from-a-template/start-from-hello-pear-bare/
- Referencia OTA one-shot: `swap` (pears.com/news/ecosystem-spotlight-swap…)
- Patrón multi-writer completo: `autopass` (github.com/holepunchto/autopass)
- Mentores: topic de Pears en Telegram del hackathon; equipo Pear vive en Keet (no Discord).
