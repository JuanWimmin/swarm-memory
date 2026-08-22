// Merge policy for the SwarmMemory Autobase view (TEAM_PLAN.md §4.3).
//
// Every write is an op appended to a writer's local core; ops only reach the Hyperbee view
// through apply(), which must be deterministic: Autobase undoes and replays it whenever the
// linearized order changes, so it may only read/write `view`.
//
// Layout (frozen contract):
//   n!<id>                  node JSON
//   e!<from>!<type>!<to>    edge JSON
//   m!<key>                 metadata
//   i!<inviteId>            pending invite (internal)
//
// Policy: last-writer-wins by the lamport stamp `at`, EXCEPT nodes of type 'note' (written by
// humans) which an automatic scan never overwrites or deletes.

const b4a = require('b4a')

const NOTE = 'note'

/** Range end for a `<prefix>!` key space: '!' is 0x21, '"' is 0x22. */
function rangeEnd(prefix) {
  return prefix.slice(0, -1) + '"'
}

/** Ids must be plain strings without the '!' separator, so keys stay unambiguous. */
function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.indexOf('!') === -1
}

function validNode(node) {
  return node !== null && typeof node === 'object' && validId(node.id) && typeof node.type === 'string'
}

function validEdge(edge) {
  return (
    edge !== null &&
    typeof edge === 'object' &&
    validId(edge.from) &&
    validId(edge.to) &&
    validId(edge.type)
  )
}

function nodeKey(id) {
  return 'n!' + id
}

function edgeKey(edge) {
  return 'e!' + edge.from + '!' + edge.type + '!' + edge.to
}

/**
 * @param {object|null} prev previously stored value (node/edge) or null
 * @param {object} op incoming op ({ at, source })
 * @returns {boolean} whether the op may overwrite prev
 */
function shouldOverwrite(prev, op) {
  if (!prev) return true
  // human notes are never clobbered by an automatic scan
  if (prev.type === NOTE && op.source === 'scan') return false
  const prevAt = typeof prev.at === 'number' ? prev.at : 0
  const opAt = typeof op.at === 'number' ? op.at : 0
  return opAt >= prevAt // ties resolve by linearized order, which is deterministic
}

/**
 * Autobase apply(): the only place the view is mutated and writers are added.
 * @param {Array<{value: object, from: object}>} nodes
 * @param {import('hyperbee')} view
 * @param {{ addWriter: Function }} host
 */
async function apply(nodes, view, host) {
  for (const node of nodes) {
    const op = node.value
    if (!op || typeof op !== 'object') continue // acks / malformed
    const by = op.by || (node.from && node.from.key ? b4a.toString(node.from.key, 'hex').slice(0, 8) : 'unknown')

    switch (op.op) {
      case 'add-writer': {
        if (typeof op.key !== 'string' || op.key.length !== 64) break
        await host.addWriter(b4a.from(op.key, 'hex'), { indexer: true })
        break
      }

      case 'add-invite': {
        if (typeof op.id !== 'string') break
        await view.put('i!' + op.id, {
          invite: op.invite,
          publicKey: op.publicKey,
          expires: op.expires
        })
        break
      }

      case 'del-invite': {
        if (typeof op.id !== 'string') break
        await view.del('i!' + op.id)
        break
      }

      case 'put-node': {
        if (!validNode(op.node)) break
        const key = nodeKey(op.node.id)
        const prev = await view.get(key)
        if (!shouldOverwrite(prev && prev.value, op)) break
        await view.put(key, { ...op.node, at: op.at, by, source: op.source })
        break
      }

      case 'put-edge': {
        if (!validEdge(op.edge)) break
        const key = edgeKey(op.edge)
        const prev = await view.get(key)
        if (!shouldOverwrite(prev && prev.value, op)) break
        await view.put(key, { ...op.edge, at: op.at, by, source: op.source })
        break
      }

      case 'del-node': {
        if (!validId(op.id)) break
        const key = nodeKey(op.id)
        const prev = await view.get(key)
        if (!shouldOverwrite(prev && prev.value, op)) break
        await view.del(key)
        break
      }

      case 'del-edge': {
        if (!validEdge(op.edge)) break
        const key = edgeKey(op.edge)
        const prev = await view.get(key)
        if (!shouldOverwrite(prev && prev.value, op)) break
        await view.del(key)
        break
      }

      case 'put-meta': {
        if (!validId(op.key)) break
        await view.put('m!' + op.key, { value: op.value, at: op.at })
        break
      }

      default:
        break // unknown op from a newer peer: ignore (forward compatible)
    }
  }
}

module.exports = { apply, shouldOverwrite, validId, validNode, validEdge, nodeKey, edgeKey, rangeEnd, NOTE }
