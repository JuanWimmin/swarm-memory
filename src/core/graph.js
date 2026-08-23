/**
 * Modelo de grafo en memoria. JS puro, sin I/O.
 * Acepta cualquier GraphSource `{ nodes(), edges(), meta() }` (vault local o view P2P).
 */

const SEVERITY_RANK = { info: 0, warn: 1, critical: 2 }

/**
 * @param {object} source GraphSource o documento `{ meta, nodes, edges }`
 * @returns {Graph}
 */
function from(source) {
  return source instanceof Graph ? source : new Graph(adapt(source))
}

function adapt(source) {
  if (!source) throw new Error('GraphSource requerido')
  if (typeof source.nodes === 'function') return source
  if (Array.isArray(source.nodes) && Array.isArray(source.edges)) {
    return {
      nodes: () => source.nodes,
      edges: () => source.edges,
      meta: () => source.meta || {}
    }
  }
  throw new Error('GraphSource inválido: se esperaba { nodes(), edges(), meta() }')
}

class Graph {
  /**
   * @param {{ nodes: Function, edges: Function, meta: Function }} source
   */
  constructor(source) {
    this._source = source
    this._byId = null
    this._out = null
    this._in = null
  }

  nodes() {
    return this._source.nodes()
  }

  edges() {
    return this._source.edges()
  }

  meta() {
    return this._source.meta()
  }

  /** Documento graph.json (§4.1). */
  toJSON() {
    return {
      meta: this.meta(),
      nodes: this.nodes(),
      edges: this.edges()
    }
  }

  /** @param {string} id */
  get(id) {
    return this._index().get(id) || null
  }

  /** @param {string} type */
  byType(type) {
    return this.nodes().filter((n) => n.type === type)
  }

  /**
   * Nodos con severity >= `min` (`info` < `warn` < `critical`).
   * @param {'info'|'warn'|'critical'} [min]
   */
  bySeverity(min = 'warn') {
    const floor = SEVERITY_RANK[min] ?? 1
    return this.nodes().filter((n) => (SEVERITY_RANK[n.severity] ?? 0) >= floor)
  }

  /** Alias de `bySeverity('warn')` — señales para `resume`. */
  signals() {
    return this.bySeverity('warn')
  }

  contracts() {
    return this.byType('contract')
  }

  tasks() {
    return this.byType('task')
  }

  /**
   * Vecindad de un nodo.
   * @param {string} id
   */
  neighbors(id) {
    this._index()
    return {
      outgoing: this._out.get(id) || [],
      incoming: this._in.get(id) || []
    }
  }

  /** Conteos por `type` para el header de resume. */
  counts() {
    const out = Object.create(null)
    for (const node of this.nodes()) {
      out[node.type] = (out[node.type] || 0) + 1
    }
    return out
  }

  _index() {
    if (this._byId) return this._byId
    const byId = new Map()
    const outgoing = new Map()
    const incoming = new Map()
    for (const node of this.nodes()) byId.set(node.id, node)
    for (const edge of this.edges()) {
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, [])
      outgoing.get(edge.from).push(edge)
      if (!incoming.has(edge.to)) incoming.set(edge.to, [])
      incoming.get(edge.to).push(edge)
    }
    this._byId = byId
    this._out = outgoing
    this._in = incoming
    return byId
  }
}

module.exports = { Graph, from, SEVERITY_RANK }
