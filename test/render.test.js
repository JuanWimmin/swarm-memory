// Unit tests for the terminal view. src/render/resume.js is pure — no fs, no network — so this
// suite runs on Node as well as Bare, and asserts layout rules rather than exact strings.

const test = require('brittle')

const view = require('../src/render/resume.js')
const { formatProject, formatEmpty, deploymentState, taskLabel, taskWhere } = view

const ESC = String.fromCharCode(27)
const ANSI = new RegExp(ESC + '\\[[0-9;]*m', 'g')
const plain = (s) => s.replace(ANSI, '')

function node(id, type, extra = {}) {
  return { id, type, label: extra.label || id, ...extra }
}

const SAMPLE = {
  meta: { project: 'private-payroll' },
  nodes: [
    node('contract/payroll', 'contract', {
      label: 'Payroll',
      data: { functions: 4, network: 'testnet', drift: true }
    }),
    node('contract/token', 'contract', { label: 'pay-token', data: { external: true } }),
    node('deployment/payroll', 'deployment', {
      label: 'payroll @ testnet',
      severity: 'warn',
      summary: 'Live at `CDVMJUZ4YZIG6JME7LGVEW6MPNTV5DKR6VCAZ` — out of sync with local source.'
    }),
    node('function/pay', 'function', {
      label: 'Payroll.pay',
      severity: 'critical',
      summary: 'Mutates state and never calls require_auth.'
    }),
    node('note/decision', 'note', {
      label: 'Decision: configurable pay token',
      summary: 'We chose an admin-configurable token.',
      by: 'alice'
    }),
    node('task/tests', 'task', {
      label: 'Complete withdrawal tests TODO',
      summary: 'CHECKLIST in `README.md:24`'
    }),
    node('storage/last', 'storage', { label: 'DataKey::LastPaid' })
  ],
  edges: [{ from: 'contract/payroll', to: 'contract/token', type: 'calls' }],
  info: { peers: 2, writable: true, id: 'abc123' }
}

test('the project view leads with the project, not with our own branding', (t) => {
  const out = plain(formatProject(SAMPLE, { color: false }))
  const firstLine = out.split('\n').filter(Boolean)[0]
  t.is(firstLine, 'private-payroll', 'the project name is the first thing you read')
  t.ok(out.includes('7 nodes'), 'node count')
  t.ok(out.includes('1 edge'), 'edge count is singular when it should be')
  t.ok(out.includes('2 peers'), 'peer count')
  t.ok(out.includes('writer'), 'writer status')
})

test('every section only appears when it has something to say', (t) => {
  const full = plain(formatProject(SAMPLE, { color: false }))
  for (const section of ['Contracts', 'On-chain', 'Worth knowing', 'Notes', 'Open tasks']) {
    t.ok(full.includes(section), section + ' renders when there is content')
  }

  const bare = plain(
    formatProject({ meta: { project: 'empty' }, nodes: [], edges: [], info: {} }, { color: false })
  )
  for (const section of ['Contracts', 'On-chain', 'Worth knowing', 'Notes', 'Open tasks']) {
    t.absent(bare.includes(section), section + ' is omitted when empty')
  }
})

test('a node belongs to exactly one section', (t) => {
  const out = plain(formatProject(SAMPLE, { color: false }))
  const worth = out.slice(out.indexOf('Worth knowing'), out.indexOf('Notes'))
  t.absent(worth.includes('payroll @ testnet'), 'a flagged deployment stays under On-chain')
  t.absent(worth.includes('Complete withdrawal'), 'a task stays under Open tasks')
  t.ok(worth.includes('Payroll.pay'), 'but a flagged function is surfaced here')
})

test('columns are aligned and never collide', (t) => {
  const out = plain(formatProject(SAMPLE, { color: false }))
  const contractLines = out
    .split('\n')
    .filter((l) => l.includes('Payroll ') || l.includes('pay-token'))
  for (const line of contractLines) {
    t.absent(/\S{2,}\s?\S*\d fn/.test(line.replace(/^\s+/, '').slice(0, 2)), 'row starts indented')
    t.ok(/ {2,}/.test(line.trim()), 'there is a real gap between columns: ' + JSON.stringify(line))
  }
  const onchain = out.split('\n').find((l) => l.includes('payroll @ testnet'))
  t.ok(/@ testnet\s{2,}out of sync/.test(onchain), 'name and state do not run together')
})

test('long text wraps instead of being cut with an ellipsis', (t) => {
  const long =
    'A persistent key that is never given an extend_ttl can expire and become unreachable, ' +
    'which is a Soroban-specific failure mode that is easy to forget between sessions.'
  const out = plain(
    formatProject(
      {
        meta: { project: 'x' },
        nodes: [node('storage/x', 'storage', { severity: 'warn', summary: long })],
        edges: [],
        info: {}
      },
      { color: false, width: 70 }
    )
  )
  const body = out.split('\n').filter((l) => l.trim() && !l.includes('Worth knowing'))
  for (const line of body) t.ok(line.length <= 74, 'no line overflows the width: ' + line.length)
  t.ok(out.includes('unreachable'), 'the middle of the sentence survives')
  t.ok(out.includes('sessions.'), 'and so does the end — nothing was truncated')
})

test('deployment summaries are reduced to a state', (t) => {
  t.is(
    deploymentState({ summary: 'Live at `CABC…` — out of sync with local source.' }).text,
    'out of sync with local source'
  )
  t.is(deploymentState({ summary: 'Live at `CABC…` — out of sync.' }).tone, 'warn')
  t.is(deploymentState({ summary: 'In sync with the local source.' }).text, 'in sync')
  t.is(deploymentState({ summary: 'External payment token.' }).text, 'external dependency')
  t.is(deploymentState({ summary: '' }).text, 'deployed', 'a bare deployment still says something')
  const out = plain(formatProject(SAMPLE, { color: false }))
  t.absent(out.includes('CDVMJUZ4YZIG'), 'the raw contract address is not summary material')
})

test('task rows separate what to do from where it lives', (t) => {
  t.is(taskLabel({ label: 'Complete withdrawal tests TODO' }), 'Complete withdrawal tests')
  t.is(taskLabel({ label: '□ Finish the audit' }), 'Finish the audit')
  t.is(taskWhere({ summary: 'CHECKLIST in `README.md:24`' }), 'README.md:24')
  t.is(taskWhere({ summary: 'Open, from payroll/src/test.rs:23' }), 'payroll/src/test.rs:23')
})

test('notes carry their author, other rows do not', (t) => {
  const out = plain(formatProject(SAMPLE, { color: false }))
  const notes = out.slice(out.indexOf('Notes'))
  t.ok(notes.includes('alice'), 'the person who wrote the note is named')
  const contracts = out.slice(out.indexOf('Contracts'), out.indexOf('On-chain'))
  t.absent(contracts.includes('alice'), 'attribution is not repeated on every row')
})

test('the empty view tells you the three ways to fill it', (t) => {
  const out = plain(formatEmpty('somekey'))
  t.ok(out.includes('publish --demo'), 'the bundled demo')
  t.ok(out.includes('publish --vault'), 'a project you scanned')
  t.ok(out.includes('join <invite-code>'), 'or a teammate')
  t.ok(out.includes('somekey'), 'and it shows which store you are looking at')
})

test('colour is optional and never changes the layout', (t) => {
  const coloured = formatProject(SAMPLE, { color: true })
  const monochrome = formatProject(SAMPLE, { color: false })
  t.not(coloured, monochrome, 'colour actually emits escapes')
  t.is(plain(coloured), monochrome, 'and stripping them gives exactly the plain rendering')
})
