/**
 * Hybrid target CI, true end to end: compile a config with server/both
 * placements → run the CLIENT bundle in the sandbox → take the actual relay
 * envelope it produced → feed it to the compiled GATEWAY worker with vendor
 * fetches mocked → assert the documented server-API payloads.
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { stringify } from 'yaml'
import { compile } from '../packages/compiler/src/compile.js'
import { createSandbox, parseRequest } from '../packages/simulator/src/index.js'

const tmp = mkdtempSync(path.join(os.tmpdir(), 'tagless-edge-'))
writeFileSync(
  path.join(tmp, 'tracking.config.yaml'),
  stringify({
    site: { id: 'edgetest', consent: { default: 'denied' } },
    events: { purchase: { source: 'api' } },
    destinations: {
      ga4: { spec: 'ga4@1', measurement_id: 'G-EDGE1', consent: 'analytics', placement: 'server' },
      meta: { spec: 'meta@2', pixel_id: '555000111', consent: 'marketing', placement: 'both' },
      tiktok: { spec: 'tiktok@1', pixel_id: 'CEDGE01', consent: 'marketing', placement: 'server' },
    },
    targets: ['client', { edge: { endpoint: 'https://gw.example.test/e' } }],
  })
)

const { outfile, edge } = await compile(path.join(tmp, 'tracking.config.yaml'), tmp)

// ---- client half
const { tagless, captured } = createSandbox(readFileSync(outfile, 'utf8'), {
  url: 'https://shop.example.test/p?fbclid=CLICK123',
})
tagless.setConsent({ analytics: true, marketing: true })
await tagless.setUser({ email: 'test@example.com' })
tagless.track('purchase', { value: 49.9, currency: 'EUR' })

const reqs = captured.map(parseRequest)
const envelopeReq = reqs.find((r) => r.url === 'https://gw.example.test/e')
const envelope = envelopeReq ? JSON.parse(envelopeReq.body) : null
const clientChecks = [
  ['relay posts ONE envelope to the gateway', !!envelope],
  ['meta both → client pixel still fires', reqs.some((r) => r.url === 'https://www.facebook.com/tr')],
  ['ga4/tiktok server-only → no client requests to them', !reqs.some((r) => r.url.includes('google-analytics') || r.url.includes('tiktok'))],
  ['envelope carries fbp + fbc from fbclid', !!envelope?.ids?.fbp && envelope?.ids?.fbc?.includes('CLICK123')],
  ['envelope carries _ga-format cid + session', !!envelope?.ids?.cid && !!envelope?.ids?.sid],
  ['envelope carries hashed user + consent snapshot', envelope?.user?.em?.length === 64 && envelope?.consent?.marketing === true],
  ['relay eid matches client pixel eid (CAPI dedup)', (() => {
    const tr = reqs.find((r) => r.url === 'https://www.facebook.com/tr')
    return tr && envelope && tr.params.eid === envelope.eid
  })()],
]

// ---- gateway half, with vendor fetches mocked
const worker = (await import(pathToFileURL(edge).href)).default
const vendorCalls = []
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  vendorCalls.push({ url: String(url), init })
  return new Response('{}', { status: 200 })
}
const gwRes = await worker.fetch(
  new Request('https://gw.example.test/e', {
    method: 'POST',
    body: JSON.stringify(envelope),
    headers: { 'cf-connecting-ip': '83.1.2.3', 'user-agent': 'UA-Test' },
  }),
  { META_ACCESS_TOKEN: 'tok-meta', GA4_API_SECRET: 'sec-ga4', TIKTOK_ACCESS_TOKEN: 'tok-tt' }
)
const gwBody = await gwRes.json()

// consent gating: marketing denied → only GA4 goes out
vendorCalls.length = 0
await worker.fetch(
  new Request('https://gw.example.test/e', {
    method: 'POST',
    body: JSON.stringify({ ...envelope, consent: { analytics: true, marketing: false } }),
  }),
  { META_ACCESS_TOKEN: 'x', GA4_API_SECRET: 'y', TIKTOK_ACCESS_TOKEN: 'z' }
)
const gatedUrls = vendorCalls.map((c) => c.url)
globalThis.fetch = realFetch

// re-run the granted case for payload assertions
globalThis.fetch = async (url, init) => (vendorCalls.push({ url: String(url), init }), new Response('{}', { status: 200 }))
vendorCalls.length = 0
await worker.fetch(
  new Request('https://gw.example.test/e', {
    method: 'POST',
    body: JSON.stringify(envelope),
    headers: { 'cf-connecting-ip': '83.1.2.3', 'user-agent': 'UA-Test' },
  }),
  { META_ACCESS_TOKEN: 'tok-meta', GA4_API_SECRET: 'sec-ga4', TIKTOK_ACCESS_TOKEN: 'tok-tt' }
)
globalThis.fetch = realFetch

const capi = vendorCalls.find((c) => c.url.includes('graph.facebook.com'))
const capiBody = capi ? JSON.parse(capi.init.body).data[0] : null
const mp = vendorCalls.find((c) => c.url.includes('mp/collect'))
const mpBody = mp ? JSON.parse(mp.init.body) : null
const tt = vendorCalls.find((c) => c.url.includes('business-api.tiktok.com'))
const ttBody = tt ? JSON.parse(tt.init.body) : null

const gatewayChecks = [
  ['gateway responds ok with per-dest results', gwBody.ok === true && Object.keys(gwBody.results).length === 3],
  ['Meta CAPI: documented endpoint + token', capi?.url.includes('/555000111/events?access_token=tok-meta')],
  ['CAPI: event mapped + event_id = relay eid (dedup)', capiBody?.event_name === 'Purchase' && capiBody?.event_id === envelope.eid],
  ['CAPI: hashed em, fbp/fbc, ip+ua from the edge', capiBody?.user_data.em?.[0]?.length === 64 && !!capiBody?.user_data.fbp && capiBody?.user_data.client_ip_address === '83.1.2.3'],
  ['GA4 MP: client_id + session continuity', mp?.url.includes('measurement_id=G-EDGE1&api_secret=sec-ga4') && mpBody?.client_id === envelope.ids.cid && mpBody?.events[0].params.ga_session_id === envelope.ids.sid],
  ['TikTok Events API: official endpoint + Access-Token', tt?.init.headers['Access-Token'] === 'tok-tt' && ttBody?.data[0].event === 'CompletePayment'],
  ['marketing denied at the gateway → only GA4 out', gatedUrls.length === 1 && gatedUrls[0].includes('mp/collect')],
  ['wrangler.toml generated next to the worker', existsSync(path.join(path.dirname(edge), 'wrangler.toml'))],
]

let failed = 0
for (const [label, ok] of [...clientChecks, ...gatewayChecks]) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed++
}
console.log(`\nhybrid target: ${15 - failed}/15 passed`)
if (failed) process.exit(1)
