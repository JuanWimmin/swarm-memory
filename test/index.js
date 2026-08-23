const { test } = require('brittle')
const path = require('bare-path')
const {
  loadVault,
  NODE_TYPES,
  EDGE_TYPES
} = require('../src/vault/index.js')

const fixture = path.join(__dirname, 'fixtures', 'vault')

test('loadVault mapea index.json + notas al contrato §4.1', async (t) => {
  const source = await loadVault(fixture)
  const graph = source.toJSON()

  t.is(graph.meta.project, 'private-payroll')
  t.is(graph.meta.source, 'local')
  t.is(graph.meta.generatedAt, '2026-08-22T20:00:00.000Z')
  t.ok(typeof graph.meta.peers === 'number')

  const byId = new Map(graph.nodes.map((n) => [n.id, n]))

  t.absent(byId.get('crate/payroll'), 'crates quedan fuera del contrato')

  const payroll = byId.get('contract/payroll')
  t.ok(payroll)
  t.is(payroll.type, 'contract')
  t.is(payroll.label, 'Payroll')
  t.is(payroll.data.functions, 4)
  t.is(payroll.data.network, 'testnet')
  t.is(payroll.data.drift, true)

  const fn = byId.get('function/payroll.set_pay_token')
  t.is(fn.severity, 'critical')
  t.ok(fn.summary.includes('require_auth'))

  const storage = byId.get('storage/payroll.last-paid')
  t.is(storage.severity, 'critical')
  t.is(storage.data.durability, 'persistent')
  t.is(storage.data.ttlExtended, false)

  const dep = byId.get('deployment/testnet.ca2utest')
  t.ok(dep, 'deployment id mapeado')
  t.is(dep.severity, 'warn')
  t.is(dep.data.address, 'CA2U…TWRN')

  const note = byId.get('note/pay-token-decision')
  t.is(note.type, 'note')
  t.ok(note.summary.includes('token configurable'))
  t.absent(note.summary.includes('scanner'))

  const task = [...byId.values()].find((n) => n.type === 'task')
  t.ok(task)
  t.is(task.severity, 'warn')

  for (const node of graph.nodes) {
    t.ok(NODE_TYPES.includes(node.type), node.type)
    t.ok(['info', 'warn', 'critical'].includes(node.severity))
    t.ok(typeof node.id === 'string' && node.id.includes('/'))
    t.ok(typeof node.label === 'string')
    t.ok(typeof node.summary === 'string')
  }

  t.ok(
    graph.edges.some(
      (e) =>
        e.from === 'function/payroll.set_pay_token' &&
        e.to === 'storage/payroll.last-paid' &&
        e.type === 'reads'
    ),
    'writes de la vault se mapea a reads'
  )
  t.ok(
    graph.edges.some(
      (e) => e.from === 'contract/payroll' && e.to === dep.id && e.type === 'deployed_as'
    )
  )
  t.ok(
    graph.edges.some(
      (e) => e.from === note.id && e.to === fn.id && e.type === 'notes'
    )
  )

  for (const edge of graph.edges) {
    t.ok(EDGE_TYPES.includes(edge.type), edge.type)
    t.ok(byId.has(edge.from), edge.from)
    t.ok(byId.has(edge.to), edge.to)
  }
})

test('Graph queries sobre GraphSource de la vault', async (t) => {
  const { from } = require('../src/core/graph.js')
  const source = await loadVault(fixture)
  const g = from(source)

  t.is(g.meta().project, 'private-payroll')
  t.is(g.contracts().length, 1)
  t.is(g.byType('function').length, 1)
  t.ok(g.signals().every((n) => n.severity === 'warn' || n.severity === 'critical'))
  t.ok(g.bySeverity('critical').some((n) => n.id === 'function/payroll.set_pay_token'))

  const payroll = g.get('contract/payroll')
  t.is(payroll.label, 'Payroll')

  const nb = g.neighbors('contract/payroll')
  t.ok(nb.outgoing.some((e) => e.type === 'deployed_as'))
  t.is(g.counts().contract, 1)

  const doc = g.toJSON()
  t.ok(doc.meta && Array.isArray(doc.nodes) && Array.isArray(doc.edges))
})

test('resume formatea header, contratos, señales y tareas', async (t) => {
  const { runResume, formatResume } = require('../src/commands/resume.js')
  const { from } = require('../src/core/graph.js')
  const source = await loadVault(fixture)
  const text = formatResume(from(source), { color: false })

  t.ok(text.includes('SwarmMemory'))
  t.ok(text.includes('private-payroll'))
  t.ok(text.includes('Contracts'))
  t.ok(text.includes('Payroll'))
  t.ok(text.includes('Signals'))
  t.ok(text.includes('CRITICAL'))
  t.ok(text.includes('WARN'))
  t.ok(text.includes('Tasks'))
  t.ok(text.includes('set_pay_token') || text.includes('require_auth'))
  t.absent(text.includes('\x1b['), 'sin ANSI si color=false')

  const chunks = []
  await runResume({
    vault: fixture,
    color: false,
    write: (s) => chunks.push(s)
  })
  t.ok(chunks.join('\n').includes('SwarmMemory'))
})
