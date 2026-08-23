import { command, flag, arg, summary, description } from 'paparam'
import { persistent } from 'bare-storage'
import process from 'bare-process'
import os from 'bare-os'
import { isWindows } from 'which-runtime'
import path from 'bare-path'
import pkg from './package.json'
import App from './app.js'
import commands from './src/sync/commands.js'

const appName = pkg.productName || pkg.name
const isDev = path.basename(Bare.argv[0]) === (isWindows ? 'bare.exe' : 'bare')

let storageDir = null
let openStores = []
let app = null

// paparam does not inherit flags into subcommands, so every command declares the shared ones.
const shared = () => [
  flag('--storage <dir>', 'custom storage directory'),
  flag('--as <name>', 'name this peer shows to the team'),
  flag('--no-updates', 'disable OTA updates for this run')
]

function resolveStorage(flags) {
  const base = flags.storage || (isDev ? null : path.join(persistent(), appName))
  return base || path.join(os.tmpdir(), 'pear', appName)
}

function ctx(cmd) {
  const flags = cmd.flags || {}
  storageDir = resolveStorage(flags)
  return { dir: path.join(storageDir, 'swarm'), name: flags.as || os.hostname(), flags }
}

/** Run a command, then exit. */
function oneShot(cmd, fn) {
  return () => {
    const base = ctx(cmd)
    Promise.resolve(fn(base))
      .then(async (store) => {
        if (store) {
          // a write has to reach somebody before we tear the connection down
          const flush = store.flushed ? await store.flushed() : { reason: 'nothing written' }
          if (flush.reason === 'no peers online') {
            console.log('saved locally — no peer online right now, it syncs when one connects')
          } else if (flush.reason === 'peers did not confirm in time') {
            console.log('saved locally — the peer did not confirm yet, it will catch up')
          }
          await store.close()
        }
        Bare.exit()
      })
      .catch((err) => {
        console.error('[error]', err.message)
        Bare.exit(1)
      })
  }
}

/** Run a command that must stay online (pairing, live view, OTA updates). */
function longRunning(cmd, fn, note) {
  return () => {
    const base = ctx(cmd)
    Promise.resolve(fn(base))
      .then((store) => {
        if (store) openStores.push(store)
        if (note) console.log(note)
        startUpdater(base.flags)
      })
      .catch((err) => {
        console.error('[error]', err.message)
        Bare.exit(1)
      })
  }
}

const resume = command(
  'resume',
  summary('Show the project context from the swarm'),
  description('The star view: contracts, functions, risks and human notes, merged across peers.'),
  flag('--watch|-w', 'keep the view open and repaint as peers write'),
  flag('--vault <dir>', 'read a scanned .stellar-memory directory instead of the swarm'),
  ...shared(),
  () => {
    if (resume.flags.vault) {
      return oneShot(resume, () => commands.inspect({ vault: resume.flags.vault }))()
    }
    return resume.flags.watch
      ? longRunning(resume, commands.watch)()
      : oneShot(resume, commands.resume)()
  }
)

const note = command(
  'note',
  summary('Write a human note into the shared graph'),
  description('Notes are never overwritten by an automatic scan — that is the point of them.'),
  arg('<text>', 'what you want the team to remember'),
  flag('--about <id>', 'attach the note to a node id (e.g. contract/payroll)'),
  ...shared(),
  () =>
    oneShot(note, (base) =>
      commands.note({ ...base, text: note.args.text, about: note.flags.about })
    )()
)

const publish = command(
  'publish',
  summary('Import a graph export into the swarm'),
  flag('--graph <file>', 'graph.json to import'),
  flag('--demo', 'load the bundled demo project (private-payroll)'),
  flag('--vault <dir>', 'a scanned .stellar-memory directory to import'),
  ...shared(),
  () =>
    oneShot(publish, (base) =>
      commands.publish({
        ...base,
        file: publish.flags.graph || 'demo/graph.json',
        vault: publish.flags.vault,
        demo: publish.flags.demo || !(publish.flags.graph || publish.flags.vault)
      })
    )()
)

const invite = command('invite', summary('Create an invite code for a teammate'), ...shared(), () =>
  longRunning(invite, commands.invite, '  Waiting for your teammate to join. Ctrl+C to stop.\n')()
)

const join = command(
  'join',
  summary('Join a teammate swarm with an invite code'),
  arg('<code>', 'invite code'),
  ...shared(),
  () => oneShot(join, (base) => commands.join({ ...base, code: join.args.code }))()
)

const peers = command('peers', summary('Connected peers and sync state'), ...shared(), () =>
  oneShot(peers, commands.peers)()
)

const graph = command(
  'graph',
  summary('Export the graph as JSON or a self-contained HTML viewer'),
  flag('--json <file>', 'write graph.json'),
  flag('--html <file>', 'write a standalone HTML viewer'),
  ...shared(),
  () =>
    oneShot(graph, (base) =>
      commands.graph({ ...base, json: graph.flags.json, html: graph.flags.html })
    )()
)

const status = command('status', summary('Version, storage and update status'), ...shared(), () => {
  const flags = status.flags
  console.log('')
  console.log(`  ${appName} v${pkg.version}`)
  console.log(`  storage  ${resolveStorage(flags)}`)
  console.log(`  updates  ${flags.updates === false ? 'disabled' : 'enabled'}`)
  console.log(`  upgrade  ${pkg.upgrade}`)
  console.log('')
  Bare.exit()
})

const root = command(
  appName,
  summary(pkg.description),
  flag('--version|-v', 'Print the current version'),
  ...shared(),
  resume,
  note,
  publish,
  invite,
  join,
  peers,
  graph,
  status,
  // No subcommand: show the context and stay online (live view + OTA updates).
  // paparam also runs this for `--version`, so that flag is handled here first.
  () => {
    if (root.flags.version) {
      console.log(`${appName} v${pkg.version}`)
      return Bare.exit()
    }
    return longRunning(root, commands.resume, '  Watching the swarm. Ctrl+C to stop.\n')()
  }
)

function startUpdater(flags) {
  const updates = flags.updates

  console.log(`Updates: ${updates === false ? 'disabled' : 'enabled'}`)

  app = new App({
    dir: storageDir,
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

  app.ready().catch(async (err) => {
    console.error('[app:error]', err)
    await app.close().finally(() => Bare.exit(1))
  })
}

async function shutdown(code) {
  for (const store of openStores) {
    try {
      await store.close()
    } catch {
      // ignore
    }
  }
  openStores = []
  if (app) return app.exit(code)
  Bare.exit(code)
}

process.on('SIGHUP', () => shutdown(129))
process.on('SIGINT', () => shutdown(130))
process.on('SIGQUIT', () => shutdown(131))
process.on('SIGTERM', () => shutdown(143))

const parsed = root.parse(Bare.argv.slice(isDev ? 2 : 1))

if (parsed === null) Bare.exit(1)
if (root.flags.help) Bare.exit()
