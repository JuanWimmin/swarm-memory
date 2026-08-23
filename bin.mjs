import { command, flag, summary } from 'paparam'
import { persistent } from 'bare-storage'
import process from 'bare-process'
import os from 'bare-os'
import { isWindows } from 'which-runtime'
import path from 'bare-path'
import { createRequire } from 'bare-module'
import pkg from './package.json'

const require = createRequire(import.meta.url)
const { runResume } = require('./src/commands/resume.js')
const { runGraph } = require('./src/commands/graph.js')

const appName = pkg.productName || pkg.name
const isDev = path.basename(Bare.argv[0]) === (isWindows ? 'bare.exe' : 'bare')

const resumeCmd = command(
  'resume',
  summary('Project memory overview from a local .stellar-memory vault'),
  flag('--vault <dir>', 'project root or .stellar-memory directory')
)

const graphCmd = command(
  'graph',
  summary('Export graph.json (§4.1) and/or a self-contained HTML viewer'),
  flag('--vault <dir>', 'project root or .stellar-memory directory'),
  flag('--json [file]', 'write graph.json to stdout (or to file)'),
  flag('--html [file]', 'inject graph into web/template.html (default graph.html)')
)

const cmd = command(
  appName,
  summary(pkg.description),
  flag('--version|-v', 'Print the current version'),
  flag('--storage <dir>', 'custom storage directory'),
  flag('--no-updates', 'disable OTA updates for this run'),
  flag('--vault <dir>', 'project root or .stellar-memory directory'),
  resumeCmd,
  graphCmd
)

const parsed = cmd.parse(Bare.argv.slice(isDev ? 2 : 1))
if (!parsed || parsed.flags.help) Bare.exit()
if (cmd.flags.version) {
  console.log(`${appName} v${pkg.version}`)
  Bare.exit()
}

const invoked = cmd.current ? cmd.current.name : null
const leaf = cmd.current || cmd
const vault = leaf.flags.vault || cmd.flags.vault
if (!invoked || invoked === 'resume') {
  try {
    await runResume({ vault, cwd: os.cwd() })
  } catch (err) {
    console.error(err.message || err)
    Bare.exit(1)
  }
} else if (invoked === 'graph') {
  try {
    await runGraph({
      vault,
      cwd: os.cwd(),
      json: leaf.flags.json,
      html: leaf.flags.html
    })
  } catch (err) {
    console.error(err.message || err)
    Bare.exit(1)
  }
}

const updates = cmd.flags.updates
const storage = cmd.flags.storage || (isDev ? null : path.join(persistent(), appName))
const dir = storage || path.join(os.tmpdir(), 'pear', appName)

let App
try {
  App = require('./app.js')
} catch (err) {
  console.error('[app:error] updater unavailable:', err.message || err)
  Bare.exit(invoked && invoked !== 'resume' && invoked !== 'graph' ? 1 : 0)
}

console.log(`Updates: ${updates === false ? 'disabled' : 'enabled'}`)

const app = new App({
  dir,
  app: isDev ? null : os.execPath(),
  updates,
  version: pkg.version,
  upgrade: pkg.upgrade,
  name: isWindows ? appName + '.exe' : appName
})

app.on('message', (message) => console.log(message))
app.on('updating', () => console.log('[updater] getting new update'))
app.on('updating-delta', (delta) => console.log('[updater]', delta))
app.on('updated', () => console.log('[updater] update complete... applying'))
app.on('update-applied', () =>
  console.log('[updater] applied update, restart to run latest version')
)
app.on('error', (err) => console.error('[app:error]', err))

process.on('SIGHUP', () => app.exit(129))
process.on('SIGINT', () => app.exit(130))
process.on('SIGQUIT', () => app.exit(131))
process.on('SIGTERM', () => app.exit(143))

try {
  await app.ready()
  console.log('\nCLI ready. Press Ctrl+C to stop.\n')
} catch (err) {
  console.error('[app:error]', err)
  await app.close().finally(() => Bare.exit(1))
}
