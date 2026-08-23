# SwarmMemory — Reglas del proyecto (leer antes de escribir código)

Proyecto del Aleph Hackathon 2026, Pears Track. **Lee `TEAM_PLAN.md` completo antes de tu primera tarea** — contiene arquitectura, contratos congelados, reparto (B1/B2/F) y cronograma. Este archivo solo resume lo que NUNCA se viola.

## Reglas duras

1. **Bare ≠ Node.js.** Este CLI corre en Bare. Prohibido `require('fs')`, `process.env`, `child_process`, `node:*`. Se usan los módulos `bare-*`: `bare-fs`, `bare-path`, `bare-os`, `bare-process`. Si una API no aparece en https://docs.pears.com/reference/modules/bare-modules/ o en las deps del package.json, NO existe — verifica antes de usar.
2. **No tocar el updater OTA**: `app.js`, `workers/main.js` y el campo `upgrade` de `package.json` son intocables salvo por B1. Es el requisito de entrada del track.
3. **Cero dependencias nativas** y ninguna dep nueva sin aprobación de B1 (rompen el build multi-plataforma de `bare-build`).
4. **CLI args con `paparam`** (ya en deps). No commander, no yargs.
5. **F (front) solo trabaja en `web/` y `docs/`**. Nunca en `src/` ni `package.json`.
6. **Contratos congelados** (ver TEAM_PLAN.md §4): schema `graph.json`, interfaz `GraphSource { nodes(), edges(), meta() }`, layout Hyperbee `n!<id>` / `e!<from>!<type>!<to>` / `m!<k>`, y el placeholder `/*__GRAPH_DATA__*/` de `web/template.html`. Cambiarlos requiere acuerdo de los 3.
7. **Commits pequeños y frecuentes** con mensajes reales — el historial git es la prueba de que todo se hizo durante el hackathon.
8. Después de cada milestone, B1 re-stagea y re-verifica `pear install pear://<key>` en carpeta limpia.

## Comandos

- `npm start` — dev mode (corre `bare bin.mjs --no-updates`)
- `npm start -- --updates` — dev con OTA activo
- `npm test` — tests brittle
- `npm run make` — binario standalone del host actual en `out/`
- Deploy (solo B1): `pear touch` → `pear stage` → `pear seed` (docs: https://docs.pears.com/how-to/operate-an-app/)

## Estructura

- `bin.mjs` — entrypoint CLI (paparam) · `app.js` + `workers/main.js` — updater OTA (NO TOCAR)
- `src/vault/` (B2) lector .stellar-memory · `src/core/` (B2) grafo+queries · `src/render/` (B2) ANSI+export
- `src/sync/` (B1) Corestore+Autobase+Hyperswarm+pairing
- `web/` (F) visor HTML autocontenido · `demo/vault/` dataset demo

## Release (B1 machine only)

El link del release es **pear://ino4ymu381ouhyo14u6sg5ursbto4irt4n5mhhzjkk8a7mwgd6iy** (`ci/pear-link.txt`
y el campo `upgrade`). Su llave de escritura vive en `%APPDATA%\pear` de la máquina de B1: **solo ahí**
se puede `pear stage`. El seeder autoritativo es `C:\Users\juanp\swarm-memory-seed.cmd` (ventana propia,
reinicio automático, log en `%USERPROFILE%\swarm-memory-seed.log`); `reseed.yaml` añade dos seeders sin llaves.

Publicar una versión: `npm version patch` → push → `gh workflow run build.yaml` → descargar el artefacto
`by-arch` → `tar -xzf` → `pear stage <link> ./deployment`. Detalles y bitácora en `docs/DEPLOY.md`.

Trampas ya pagadas (no repetir): `pear seed` muere a los ~20 s si stdin está en EOF (CI) — hay que
mantener stdin abierto; stagear desde una caché sin los blobs **forkea el drive** y todo `pear install`
falla con `ERR_INVALID_MANIFEST`; `picocolors` lee el global `process` y revienta en Bare (usar
`src/sync/colors.js`); Git Bash no captura el stdout de un binario Bare — usar PowerShell.
