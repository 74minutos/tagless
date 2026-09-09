/**
 * CDN worker CI: exercise the full hosted lifecycle against a KV mock —
 * unauthorized writes rejected, publish, alias serve, versioned immutable
 * serve, rollback by alias repoint, alias-to-missing-version refused.
 */
import worker from '../packages/cdn-worker/src/worker.js'

const kv = new Map()
const env = {
  PUBLISH_KEY: 'test-key',
  BUNDLES: {
    get: async (k) => (kv.has(k) ? kv.get(k) : null),
    put: async (k, v) => void kv.set(k, v),
  },
}
const call = (method, path, { body, auth } = {}) =>
  worker.fetch(
    new Request(`https://cdn.tagless.foo${path}`, {
      method,
      body,
      headers: auth ? { authorization: `Bearer ${auth}` } : {},
    }),
    env
  )

let failed = 0
const check = async (label, ok) => {
  console.log(`${(await ok) ? '✓' : '✗'} ${label}`)
  if (!(await ok)) failed++
}

const landing = await call('GET', '/')
await check('landing served at root', landing.status === 200 && landing.headers.get('content-type').includes('text/html') && (await landing.text()).includes('built for'))
const guide = await call('GET', '/guide')
await check('guide served at /guide', guide.status === 200 && (await guide.text()).includes('End to end'))

await check('GET unknown site → 404', call('GET', '/t/mysite.js').then((r) => r.status === 404))
await check('PUT without key → 401', call('PUT', '/t/mysite@abc123.js', { body: 'x' }).then((r) => r.status === 401))
await check('PUT wrong key → 401', call('PUT', '/t/mysite@abc123.js', { body: 'x', auth: 'nope' }).then((r) => r.status === 401))

await check('publish v1 bundle', call('PUT', '/t/mysite@abc123.js', { body: 'console.log("v1")', auth: 'test-key' }).then((r) => r.status === 200))
await check('alias to missing version → 409', call('POST', '/t/mysite', { body: JSON.stringify({ version: 'ffffff' }), auth: 'test-key' }).then((r) => r.status === 409))
await check('alias to v1', call('POST', '/t/mysite', { body: JSON.stringify({ version: 'abc123' }), auth: 'test-key' }).then((r) => r.status === 200))

const alias = await call('GET', '/t/mysite.js')
await check('alias serves v1 with SWR cache', alias.status === 200 && (await alias.text()).includes('v1') && alias.headers.get('cache-control').includes('stale-while-revalidate') && alias.headers.get('x-tagless-version') === 'abc123')

const versioned = await call('GET', '/t/mysite@abc123.js')
await check('versioned URL immutable', versioned.status === 200 && versioned.headers.get('cache-control').includes('immutable'))

await call('PUT', '/t/mysite@def456.js', { body: 'console.log("v2")', auth: 'test-key' })
await call('POST', '/t/mysite', { body: JSON.stringify({ version: 'def456' }), auth: 'test-key' })
await check('alias now serves v2', call('GET', '/t/mysite.js').then(async (r) => (await r.text()).includes('v2')))

await call('POST', '/t/mysite', { body: JSON.stringify({ version: 'abc123' }), auth: 'test-key' })
await check('rollback: alias repointed to v1', call('GET', '/t/mysite.js').then(async (r) => (await r.text()).includes('v1')))
await check('old version still served immutably', call('GET', '/t/mysite@def456.js').then((r) => r.status === 200))

console.log(`\ncdn-worker: ${13 - failed}/13 passed`)
if (failed) process.exit(1)
