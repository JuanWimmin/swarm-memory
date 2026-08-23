#!/usr/bin/env node
/**
 * Local preview for F. Injects web/mock-graph.json into template.html
 * so the viewer can be opened while GRAPH still uses the CLI placeholder.
 *
 *   node web/serve-preview.mjs
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 43147)
const HOST = process.env.HOST || '127.0.0.1'

function inject() {
  const template = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8')
  const mock = fs.readFileSync(path.join(ROOT, 'mock-graph.json'), 'utf8').trim()
  if (!template.includes('/*__GRAPH_DATA__*/')) {
    throw new Error('template.html is missing the /*__GRAPH_DATA__*/ placeholder')
  }
  return template.replace('/*__GRAPH_DATA__*/', mock)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8'
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (
      url.pathname === '/' ||
      url.pathname === '/index.html' ||
      url.pathname === '/template.html'
    ) {
      const html = inject()
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(html)
      return
    }
    const name = path.basename(url.pathname)
    if (name && name === path.normalize(name) && !name.startsWith('.')) {
      const file = path.join(ROOT, name)
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const ext = path.extname(name)
        res.writeHead(200, {
          'Content-Type': TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        })
        res.end(fs.readFileSync(file))
        return
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(String(err.stack || err))
  }
})

server.listen(PORT, HOST, () => {
  console.log('SwarmMemory graph preview: http://' + HOST + ':' + PORT + '/')
})
