#!/usr/bin/env node
'use strict'

// Bakes web/template.html into web/template.generated.js so the standalone binary can write an
// HTML viewer without any files next to it. bare-build only bundles what is imported statically,
// and it cannot import .html — hence the generated module.
//
// Run after changing web/template.html:  node scripts/bundle-template.js

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'web', 'template.html')
const target = path.join(root, 'web', 'template.generated.js')

const html = fs.readFileSync(source, 'utf8')

if (!html.includes('/*__GRAPH_DATA__*/')) {
  console.error('web/template.html is missing the /*__GRAPH_DATA__*/ placeholder (frozen contract)')
  process.exit(1)
}

const body = [
  '// GENERATED FILE — do not edit. Source: web/template.html',
  '// Regenerate with: node scripts/bundle-template.js',
  'module.exports = ' + JSON.stringify(html),
  ''
].join('\n')

fs.writeFileSync(target, body)
console.log(
  'wrote web/template.generated.js (' + Math.round(html.length / 1024) + ' kB of template)'
)
