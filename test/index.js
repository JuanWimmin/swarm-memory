const { test } = require('brittle')

test('package metadata is release-ready', (t) => {
  const pkg = require('../package.json')
  t.is(pkg.name, 'swarm-memory')
  t.ok(
    /^pear:\/\/[a-z0-9]{52}$/.test(pkg.upgrade),
    'upgrade is a real pear link, not the template placeholder'
  )
})

require('./sync.test.js')
