/**
 * Carga un GraphSource desde vault local (mismo camino para resume y graph).
 */

const path = require('bare-path')
const os = require('bare-os')
const { loadVault } = require('../vault/index.js')
const { from } = require('../core/graph.js')

async function loadGraph(opts = {}) {
  const source = await loadSource(opts)
  return from(source)
}

async function loadSource(opts) {
  const start = resolveStart(opts)
  try {
    return await loadVault(start)
  } catch (err) {
    if (opts.vault) throw err
    const fallback = path.join(__dirname, '..', '..', 'test', 'fixtures', 'vault')
    try {
      return await loadVault(fallback)
    } catch {
      throw err
    }
  }
}

function resolveStart(opts) {
  if (opts.vault) return opts.vault
  if (opts.cwd) return opts.cwd
  return os.cwd()
}

function defaultTemplatePath() {
  return path.join(__dirname, '..', '..', 'web', 'template.html')
}

module.exports = { loadGraph, loadSource, resolveStart, defaultTemplatePath }
