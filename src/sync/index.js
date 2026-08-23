// src/sync — the P2P layer of SwarmMemory (B1).
//
//   const { openStore } = require('./src/sync')
//   const store = await openStore(dir, { name: 'juanp' })         // create/reopen our swarm
//   const store = await openStore(dir, { invite: '<code>' })      // join the team's swarm
//
// `store` satisfies the frozen GraphSource contract { nodes(), edges(), meta() } so the same
// resume/graph rendering code works against a local vault or the swarm.

const Corestore = require('corestore')

const SwarmStore = require('./store.js')
const SwarmPairer = require('./pairer.js')
const { apply, shouldOverwrite, validId, validNode, validEdge } = require('./apply.js')

/**
 * Open (or join) the team store.
 * @param {string} dir storage directory
 * @param {object} [opts]
 * @param {Buffer} [opts.key] existing autobase key
 * @param {string} [opts.invite] invite code — joins instead of creating
 * @param {string} [opts.name] human label for this peer
 * @param {Array} [opts.bootstrap] DHT bootstrap (tests)
 * @param {number} [opts.timeout] pairing timeout in ms
 * @returns {Promise<SwarmStore>} ready store
 */
async function openStore(dir, opts = {}) {
  const store = new Corestore(dir)

  if (opts.invite) {
    const pairer = new SwarmPairer(store, opts.invite, {
      name: opts.name,
      bootstrap: opts.bootstrap,
      timeout: opts.timeout
    })
    const joined = await pairer.finished()
    await joined.ready()
    return joined
  }

  // a directory that has been paired before reopens as the base it joined, not as a new one
  const remembered = opts.key
    ? { key: opts.key, encryptionKey: null }
    : await SwarmStore.readRemembered(store)

  const swarmStore = new SwarmStore(store, {
    key: opts.key || remembered.key || null,
    encryptionKey: remembered.encryptionKey || undefined,
    name: opts.name,
    bootstrap: opts.bootstrap
  })
  await swarmStore.ready()
  return swarmStore
}

module.exports = {
  openStore,
  SwarmStore,
  SwarmPairer,
  apply,
  shouldOverwrite,
  validId,
  validNode,
  validEdge
}
