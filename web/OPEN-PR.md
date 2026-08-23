# Abrir el PR en GitHub (B1 o F con `gh auth`)

Este entorno no puede pushear a `JuanWimmin/swarm-memory` (sin credenciales) ni abrir PRs en el git temporal de Cursor (`agent_temp`).

El commit **ya está rebased sobre `master` actual**: `feat(web): interactive graph viewer for graph --html`.

En una máquina donde `gh auth status` funcione y tengas write al repo:

```sh
git clone https://github.com/JuanWimmin/swarm-memory.git
cd swarm-memory
git checkout -b cursor/f-graph-viewer-03a6
# copiá web/template.html y el resto de archivos de este branch, o:
# git cherry-pick 624c63c  si tenés el objeto
git add web/template.html web/titles.html web/inject-graph.mjs web/serve-preview.mjs \
  web/README-F.md web/FOR-BACKEND.md docs/FRONTEND.md docs/README-VISUAL.md \
  docs/VIDEO_STORYBOARD.md docs/shots README.md
git commit -m "feat(web): interactive graph viewer for graph --html"
git push -u origin cursor/f-graph-viewer-03a6
gh pr create --base master --head cursor/f-graph-viewer-03a6 \
  --title "feat(web): visor de grafo para graph --html" \
  --body "$(cat web/FOR-BACKEND.md)"
```

Si B1 ya tiene el clone: solo necesita esos archivos F y el placeholder `const GRAPH = /*__GRAPH_DATA__*/;` intacto.
