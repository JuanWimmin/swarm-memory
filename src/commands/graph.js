/**
 * Comando `graph`: exporta el contrato §4.1 como JSON y/o visor HTML.
 */

const fs = require('bare-fs')
const path = require('bare-path')
const { loadGraph, defaultTemplatePath } = require('./source.js')
const { generateHtmlReport, writeHtmlReport } = require('../render/html.js')

/**
 * @param {{
 *   vault?: string,
 *   cwd?: string,
 *   json?: boolean | string,
 *   html?: boolean | string,
 *   template?: string,
 *   write?: Function
 * }} [opts]
 */
async function runGraph(opts = {}) {
  const write = opts.write || ((s) => console.log(s))
  const graph = await loadGraph(opts)
  const doc = graph.toJSON()
  const wantJson = opts.json !== undefined && opts.json !== false
  const wantHtml = opts.html !== undefined && opts.html !== false
  const results = { graph, doc, jsonPath: null, htmlPath: null, html: null }

  if (wantJson || !wantHtml) {
    const text = JSON.stringify(doc, null, 2)
    if (typeof opts.json === 'string' && opts.json) {
      await writeUtf8(opts.json, text)
      results.jsonPath = opts.json
    } else {
      write(text)
    }
  }

  if (wantHtml) {
    const templatePath = opts.template || defaultTemplatePath()
    const outputPath = typeof opts.html === 'string' && opts.html ? opts.html : 'graph.html'
    const written = await writeHtmlReport(graph, outputPath, templatePath)
    results.htmlPath = written.outputPath
    results.html = written.html
    write(`Wrote ${written.outputPath}`)
  }

  return results
}

async function writeUtf8(file, text) {
  const dir = path.dirname(file)
  if (dir && dir !== '.' && dir !== file) {
    await fs.mkdir(dir, { recursive: true })
  }
  await fs.writeFile(file, text)
}

module.exports = { runGraph, generateHtmlReport }
