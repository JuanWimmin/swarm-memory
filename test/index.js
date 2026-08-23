const { test } = require('brittle')

test('package metadata is release-ready', (t) => {
  const pkg = require('../package.json')
  t.is(pkg.name, 'swarm-memory')
  t.ok(
    /^pear:\/\/[a-z0-9]{52}$/.test(pkg.upgrade),
    'upgrade is a real pear link, not the template placeholder'
  )
})

require('./apply.test.js')
require('./render.test.js')
require('./sync.test.js')

// B2's vault/core/render suite talks to bare-fs and bare-path, which only exist
// on Bare. Node runs the sync suite; `npm test` (brittle-bare) runs everything.
if (typeof Bare !== 'undefined') require('./vault.test.js')

// The CLI command layer goes through bare-fs too, so it is Bare-only as well.
if (typeof Bare !== 'undefined') require('./integration.test.js')
