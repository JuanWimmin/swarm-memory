# SwarmMemory video storyboard (3:00, English)

Director: F. B1/B2 run commands on camera. Record terminal takes separately (OBS or asciinema) so they can be recut without a full reshoot.

On-screen look: dark terminal + SwarmMemory graph viewer (this `web/template.html`). Lower-thirds: **Peer A · seed machine** / **Peer B · clean install**. Title card: `SwarmMemory 🍐⭐` / `Team memory over the swarm`.

| Time | Picture | Voiceover (EN) | On-screen |
|---|---|---|---|
| 0:00–0:08 | Title card, then a messy Slack/notes montage | Smart-contract context lives in heads and stale docs. New teammates reconstruct the graph by hand. | SwarmMemory |
| 0:08–0:35 | Split: vault markdown vs empty onboard | Payroll, treasury, TTL risks, human notes — none of it is shared unless git is lucky. | Problem: siloed team memory |
| 0:35–1:15 | Clean machine. `pear install pear://<key>` then `swarm-memory resume` | One command installs the tool. Resume shows the live project graph: contracts, warnings, tasks. | pear install → resume |
| 1:15–1:40 | Peer B: `swarm-memory join <invite>` | Peer B joins with an invite code. No server. The graph replicates over the swarm. | join \<invite\> |
| 1:40–2:05 | Peer A adds a note; Peer B graph updates | A human note lands on Peer A and appears on Peer B in seconds. | Live note replication |
| 2:05–2:25 | Cut to HTML viewer, click `Payroll.set_pay_token` (critical) | The same graph, for humans: severity glows, filters, side panel. This is what you ship in the demo. | graph --html |
| 2:25–2:45 | Dev machine stages a release; Peer B binary updates | Over-the-air update reaches the installed copy. Evergreen binary, still no infra. | OTA update applied |
| 2:45–3:00 | Both terminals + graph freeze-frame | Zero servers. The team's memory travels with the swarm. | pear://\<key\> |

## Shot list for B1/B2

1. Clean dir: `pear install pear://<key>`
2. `swarm-memory resume` (polished TUI)
3. `swarm-memory invite` / `swarm-memory join <code>` on a second machine
4. Add a note on A, `resume` or HTML refresh on B
5. `swarm-memory graph --html graph.html` → open viewer, click critical node
6. Real OTA: stage/release on A, update log on installed B

## Assets to produce

- Title + end card and lower-thirds: `web/titles.html` (`#title`, `#end`, `#peer-a`, `#peer-b`). Add `?clean=1` to hide the picker for capture.
- 3–4 stills of the graph viewer for the README (critical glow, filters, panel, **risks** chip)
- Merge-ready README copy: `docs/README-VISUAL.md`
