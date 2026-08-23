/**
 * Inyección del grafo en el visor HTML autocontenido.
 * Reemplaza el marcador GRAPH_PLACEHOLDER por el JSON del contrato §4.1.
 */

const fs = require('bare-fs')
const path = require('bare-path')

const GRAPH_PLACEHOLDER = '/*__GRAPH_DATA__*/'

/**
 * Lee `templatePath` y sustituye el placeholder por `JSON.stringify(graph.toJSON())`.
 *
 * @param {{ toJSON?: Function } | object} graphData Graph o documento { meta, nodes, edges }
 * @param {string} templatePath
 * @returns {Promise<string>}
 */
async function generateHtmlReport(graphData, templatePath) {
  const raw = await readUtf8(templatePath)
  return injectGraphData(raw, graphData)
}

/**
 * Sustitución pura (sin I/O). Una sola ocurrencia del marcador.
 * @param {string} html
 * @param {{ toJSON?: Function } | object} graphData
 */
function injectGraphData(html, graphData) {
  if (!html.includes(GRAPH_PLACEHOLDER)) {
    throw new Error(`El template no contiene ${GRAPH_PLACEHOLDER}`)
  }
  const json = JSON.stringify(toDocument(graphData))
  return html.replace(GRAPH_PLACEHOLDER, json)
}

/**
 * Genera el HTML y lo escribe en `outputPath`.
 * @param {{ toJSON?: Function } | object} graphData
 * @param {string} outputPath
 * @param {string} templatePath
 */
async function writeHtmlReport(graphData, outputPath, templatePath) {
  const html = await generateHtmlReport(graphData, templatePath)
  const dir = path.dirname(outputPath)
  if (dir && dir !== '.' && dir !== outputPath) {
    await fs.mkdir(dir, { recursive: true })
  }
  await fs.writeFile(outputPath, html)
  return { outputPath, html }
}

function toDocument(graphData) {
  if (graphData && typeof graphData.toJSON === 'function') return graphData.toJSON()
  return graphData
}

async function readUtf8(file) {
  const buf = await fs.readFile(file, 'utf8')
  return typeof buf === 'string' ? buf : buf.toString('utf8')
}

module.exports = {
  GRAPH_PLACEHOLDER,
  generateHtmlReport,
  injectGraphData,
  writeHtmlReport,
  toDocument
}
