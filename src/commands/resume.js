/**
 * Comando `resume`: vista de contexto del proyecto en terminal.
 */

const { loadGraph } = require('./source.js')
const { formatResume } = require('../render/ansi.js')

/**
 * @param {{ vault?: string, cwd?: string, write?: Function, color?: boolean }} [opts]
 */
async function runResume(opts = {}) {
  const write = opts.write || ((s) => console.log(s))
  const color = opts.color !== false
  const graph = await loadGraph(opts)
  const text = formatResume(graph, { color })
  write(text)
  return { graph, text }
}

module.exports = { runResume, formatResume }
