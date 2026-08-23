/**
 * Lector de vault `.stellar-memory`.
 *
 * Lee `index.json` + notas Markdown (bloque humano) y emite el grafo del
 * contrato congelado §4.1. I/O solo vía `bare-fs` / `bare-path`.
 */

const fs = require('bare-fs')
const path = require('bare-path')

const VAULT_DIR = '.stellar-memory'
const INDEX_FILE = 'index.json'
const NOTES_DIR = 'notes'

const AUTO_OPEN = '<!-- stellar-memory:auto -->'
const AUTO_CLOSE = '<!-- /stellar-memory:auto -->'

/** @typedef {'contract'|'function'|'storage'|'event'|'error'|'deployment'|'note'|'task'} GraphNodeType */
/** @typedef {'calls'|'reads'|'emits'|'raises'|'notes'|'deployed_as'} GraphEdgeType */
/** @typedef {'info'|'warn'|'critical'} GraphSeverity */

const NODE_TYPES = Object.freeze([
  'contract',
  'function',
  'storage',
  'event',
  'error',
  'deployment',
  'note',
  'task'
])

const EDGE_TYPES = Object.freeze(['calls', 'reads', 'emits', 'raises', 'notes', 'deployed_as'])

/** Kinds de stellar-memory que no entran en §4.1. */
const SKIP_KINDS = new Set(['project', 'crate', 'type', 'module', 'test', 'script'])

const KIND_TO_TYPE = {
  contract: 'contract',
  function: 'function',
  storage: 'storage',
  event: 'event',
  error: 'error',
  deployment: 'deployment',
  task: 'task',
  decision: 'note',
  doc: 'note',
  asset: 'contract'
}

const EDGE_KIND_TO_TYPE = {
  calls: 'calls',
  reads: 'reads',
  writes: 'reads',
  emits: 'emits',
  raises: 'raises',
  deployed_as: 'deployed_as',
  documents: 'notes',
  mentions: 'notes',
  defines: 'notes'
}

const SEVERITY_RANK = { info: 0, warn: 1, critical: 2 }

/**
 * Fuente de grafo congelada: `{ nodes(), edges(), meta() }`.
 * @implements {GraphSource}
 */
class VaultSource {
  /**
   * @param {{ meta: object, nodes: object[], edges: object[] }} graph
   */
  constructor(graph) {
    this._meta = graph.meta
    this._nodes = graph.nodes
    this._edges = graph.edges
  }

  nodes() {
    return this._nodes
  }

  edges() {
    return this._edges
  }

  meta() {
    return this._meta
  }

  /** Documento `graph.json` completo (§4.1). */
  toJSON() {
    return { meta: this._meta, nodes: this._nodes, edges: this._edges }
  }
}

/**
 * Resuelve el directorio de la vault a partir de un path de proyecto o de vault.
 * @param {string} start
 * @returns {Promise<string>}
 */
async function resolveVaultDir(start) {
  let dir = path.resolve(start)

  for (;;) {
    if (await isFile(path.join(dir, INDEX_FILE))) return dir
    const nested = path.join(dir, VAULT_DIR)
    if (await isFile(path.join(nested, INDEX_FILE))) return nested

    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        `No se encontró una vault .stellar-memory (falta ${INDEX_FILE}) desde ${start}`
      )
    }
    dir = parent
  }
}

/**
 * Carga la vault y la mapea al contrato §4.1.
 * @param {string} start directorio del proyecto, de `.stellar-memory`, o path a index.json
 * @param {{ generatedAt?: string, source?: 'local'|'swarm', peers?: number }} [opts]
 * @returns {Promise<VaultSource>}
 */
async function loadVault(start, opts = {}) {
  const vaultDir = (await isFile(start))
    ? path.dirname(path.resolve(start))
    : await resolveVaultDir(start)
  const raw = await readUtf8(path.join(vaultDir, INDEX_FILE))
  const memory = parseIndex(raw)
  const humanById = await loadHumanNotes(path.join(vaultDir, NOTES_DIR))
  return memoryToGraph(memory, {
    humanById,
    generatedAt: opts.generatedAt,
    source: opts.source || 'local',
    peers: opts.peers ?? 0
  })
}

/**
 * Parsea `index.json` de stellar-memory (schema v1).
 * @param {string} raw
 */
function parseIndex(raw) {
  const text = stripBom(raw)
  const parsed = JSON.parse(text)
  if (parsed.version !== undefined && parsed.version !== null && parsed.version !== 1) {
    throw new Error(
      `Vault escrita con schema v${parsed.version}; SwarmMemory espera v1. Re-escaneá con stellar-memory.`
    )
  }
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('index.json inválido: se esperaban `nodes` y `edges`')
  }
  return parsed
}

/**
 * Mapeo puro vault → graph.json (§4.1). Sin I/O.
 * @param {object} memory
 * @param {{ humanById?: Map<string, string>, generatedAt?: string, source?: string, peers?: number }} [opts]
 * @returns {VaultSource}
 */
function memoryToGraph(memory, opts = {}) {
  const humanById = opts.humanById || new Map()
  const idMap = new Map()
  const used = new Set()

  const nodes = []
  for (const node of memory.nodes) {
    const type = KIND_TO_TYPE[node.kind]
    if (!type || SKIP_KINDS.has(node.kind)) continue

    const id = uniqueId(toGraphId(type, node.id), used)
    idMap.set(node.id, id)

    const human = humanById.get(node.id)
    const graphNode = mapNode(node, type, id, human)
    nodes.push(graphNode)
  }

  applySignals(memory, nodes, idMap)

  const edges = []
  const edgeSeen = new Set()
  for (const edge of memory.edges) {
    const type = EDGE_KIND_TO_TYPE[edge.kind]
    if (!type) continue
    const from = idMap.get(edge.from)
    const to = idMap.get(edge.to)
    if (!from || !to) continue
    const key = `${from}\0${type}\0${to}`
    if (edgeSeen.has(key)) continue
    edgeSeen.add(key)
    edges.push({ from, to, type })
  }

  const lastScan = Array.isArray(memory.scans) ? memory.scans[memory.scans.length - 1] : null
  const generatedAt = opts.generatedAt || lastScan?.at || new Date().toISOString()

  return new VaultSource({
    meta: {
      project: memory.project?.name || 'unknown',
      generatedAt,
      source: opts.source || 'local',
      peers: opts.peers ?? 0
    },
    nodes,
    edges
  })
}

function mapNode(node, type, id, human) {
  const data = mapData(type, node)
  let summary = (human && isHumanProse(human) ? firstParagraph(human) : null) || node.summary || ''
  if (human && isHumanProse(human) && node.kind === 'decision') {
    summary = firstParagraph(human)
  }

  /** @type {GraphSeverity} */
  let severity = 'info'
  if (type === 'task') severity = 'warn'
  if (type === 'error' && Array.isArray(node.data?.variants) && node.data.variants.length > 0) {
    severity = 'warn'
  }

  const graphNode = {
    id,
    type,
    label: node.title || id,
    summary,
    severity
  }
  if (data && Object.keys(data).length > 0) graphNode.data = data
  return graphNode
}

function mapData(type, node) {
  const src = node.data && typeof node.data === 'object' ? node.data : {}
  if (type === 'contract') {
    const data = {}
    if (node.kind === 'asset' || src.kind === 'stellar-asset' || src.kind === 'token') {
      data.external = true
    }
    if (Array.isArray(src.functions)) data.functions = src.functions.length
    return data
  }
  if (type === 'storage') {
    const data = {}
    if (src.durability) data.durability = src.durability
    if (typeof src.hasTtlExtension === 'boolean') data.ttlExtended = src.hasTtlExtension
    return data
  }
  if (type === 'deployment') {
    const data = {}
    if (src.contractId) data.address = src.contractId
    if (src.network) data.network = src.network
    if (src.drift) data.drift = src.drift
    return data
  }
  if (type === 'error' && Array.isArray(src.variants)) {
    return { variants: src.variants.length }
  }
  return {}
}

/**
 * Señales de salud (TTL / auth / drift) → `severity` en nodos ya mapeados.
 */
function applySignals(memory, nodes, idMap) {
  const byGraphId = new Map(nodes.map((n) => [n.id, n]))
  const mutating = new Set()
  for (const edge of memory.edges) {
    if (edge.kind === 'writes') mutating.add(edge.from)
  }

  for (const node of memory.nodes) {
    const gid = idMap.get(node.id)
    const target = gid && byGraphId.get(gid)
    if (!target) continue

    if (node.kind === 'storage' && missingTtlExtension(node.data)) {
      raiseSeverity(target, 'critical')
      if (!target.summary) {
        target.summary = `Clave persistent sin extend_ttl: puede expirar y volverse inalcanzable.`
      }
    }

    if (node.kind === 'deployment' && node.data?.drift === 'stale') {
      raiseSeverity(target, 'warn')
      if (!/\bdrift\b/i.test(target.summary || '')) {
        target.summary = [target.summary, 'Out of sync: Wasm desplegado distinto al build local.']
          .filter(Boolean)
          .join(' ')
      }
      const contractEdge = memory.edges.find((e) => e.kind === 'deployed_as' && e.to === node.id)
      const contractGid = contractEdge && idMap.get(contractEdge.from)
      const contractNode = contractGid && byGraphId.get(contractGid)
      if (contractNode) {
        contractNode.data = { ...(contractNode.data || {}), drift: true }
        if (node.data?.network) contractNode.data.network = node.data.network
      }
    }

    if (node.kind === 'function' && node.title !== '__constructor') {
      const requiresAuth = Boolean(node.data?.requiresAuth)
      if (!requiresAuth && mutating.has(node.id)) {
        raiseSeverity(target, 'critical')
        if (!/require_auth/.test(target.summary || '')) {
          target.summary = [target.summary, 'Muta estado y nunca llama require_auth.']
            .filter(Boolean)
            .join(' ')
        }
      }
    }

    if (node.kind === 'contract') {
      const dep = memory.nodes.find(
        (n) =>
          n.kind === 'deployment' &&
          memory.edges.some((e) => e.kind === 'deployed_as' && e.from === node.id && e.to === n.id)
      )
      if (dep?.data?.network) {
        target.data = { ...(target.data || {}), network: dep.data.network }
      }
    }
  }
}

function missingTtlExtension(data) {
  return Boolean(data && data.durability === 'persistent' && data.hasTtlExtension === false)
}

function raiseSeverity(node, next) {
  if (SEVERITY_RANK[next] > SEVERITY_RANK[node.severity]) node.severity = next
}

function toGraphId(type, rawId) {
  const rest =
    typeof rawId === 'string' && rawId.includes(':')
      ? rawId.slice(rawId.indexOf(':') + 1)
      : String(rawId)
  const slug = rest
    .replace(/[/\\]+/g, '-')
    .replace(/#/g, '-')
    .split('.')
    .map(slugPart)
    .join('.')
  return `${type}/${slug || 'unknown'}`
}

function slugPart(part) {
  return String(part)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

function uniqueId(id, used) {
  if (!used.has(id)) {
    used.add(id)
    return id
  }
  let n = 2
  while (used.has(`${id}-${n}`)) n++
  const next = `${id}-${n}`
  used.add(next)
  return next
}

async function loadHumanNotes(notesDir) {
  const byId = new Map()
  if (!(await isDir(notesDir))) return byId

  const files = await listMarkdown(notesDir)
  for (const file of files) {
    let raw
    try {
      raw = await readUtf8(file)
    } catch {
      continue
    }
    const parsed = parseMarkdownNote(raw)
    const id = typeof parsed.frontmatter.id === 'string' ? parsed.frontmatter.id : null
    if (!id || !isHumanProse(parsed.human)) continue
    byId.set(id, parsed.human)
  }
  return byId
}

async function listMarkdown(dir) {
  const out = []
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const name = typeof entry === 'string' ? entry : entry.name
    const abs = path.join(dir, name)
    const isDirectory = typeof entry === 'string' ? await isDir(abs) : entry.isDirectory()
    const isFileEntry = typeof entry === 'string' ? await isFile(abs) : entry.isFile()
    if (isDirectory) out.push(...(await listMarkdown(abs)))
    else if (isFileEntry && name.endsWith('.md')) out.push(abs)
  }
  return out
}

/**
 * Extrae frontmatter simple + bloque humano (fuera de los marcadores auto).
 * @param {string} source
 */
function parseMarkdownNote(source) {
  const raw = stripBom(source)
  if (!raw.trim()) return { frontmatter: {}, auto: '', human: '' }

  let body = raw
  let frontmatter = {}

  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3)
    if (end !== -1) {
      frontmatter = parseSimpleFrontmatter(raw.slice(4, end))
      const afterFence = raw.indexOf('\n', end + 1)
      body = afterFence === -1 ? '' : raw.slice(afterFence + 1)
    }
  }

  const open = indexOfLineMarker(body, AUTO_OPEN)
  const close = open === -1 ? -1 : indexOfLineMarker(body, AUTO_CLOSE, open + AUTO_OPEN.length)

  if (open === -1 || close === -1) {
    return { frontmatter, auto: '', human: body.trim() }
  }

  const auto = body.slice(open + AUTO_OPEN.length, close).trim()
  const before = body.slice(0, open).trim()
  const after = body.slice(close + AUTO_CLOSE.length).trim()
  const human = [before, after].filter(Boolean).join('\n\n')
  return { frontmatter, auto, human }
}

function parseSimpleFrontmatter(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

function indexOfLineMarker(body, marker, from = 0) {
  let at = body.indexOf(marker, from)
  while (at !== -1) {
    const startsLine = at === 0 || body[at - 1] === '\n'
    const after = body.slice(at + marker.length)
    if (startsLine && (after === '' || after.startsWith('\n') || after.startsWith('\r\n'))) {
      return at
    }
    at = body.indexOf(marker, at + marker.length)
  }
  return -1
}

function isHumanProse(text) {
  if (!text) return false
  const stripped = text
    .replace(/^##\s*Notes\s*/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
  return stripped.length > 0
}

function firstParagraph(text) {
  const stripped = text.replace(/^##\s*Notes\s*/i, '').trim()
  const para = stripped.split(/\n\s*\n/)[0] || stripped
  return para.replace(/\s+/g, ' ').trim()
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

async function readUtf8(file) {
  const buf = await fs.readFile(file, 'utf8')
  return typeof buf === 'string' ? buf : buf.toString('utf8')
}

async function isFile(file) {
  try {
    const st = await fs.stat(file)
    return st.isFile()
  } catch {
    return false
  }
}

async function isDir(dir) {
  try {
    const st = await fs.stat(dir)
    return st.isDirectory()
  } catch {
    return false
  }
}

module.exports = {
  VAULT_DIR,
  INDEX_FILE,
  NOTES_DIR,
  NODE_TYPES,
  EDGE_TYPES,
  VaultSource,
  resolveVaultDir,
  loadVault,
  parseIndex,
  memoryToGraph,
  parseMarkdownNote
}
