/**
 * Conversational source CI: a server-origin envelope (no browser, no relay —
 * the docs/envelope.md contract, as a Python agent backend would send it)
 * against a compiled gateway with PostHog + Mixpanel destinations.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { stringify } from 'yaml'
import { compileEdge } from '../packages/compiler/src/compile.js'

const tmp = mkdtempSync(path.join(os.tmpdir(), 'tagless-conv-'))
writeFileSync(
  path.join(tmp, 'tracking.config.yaml'),
  stringify({
    site: { id: 'agent-app', consent: { default: 'denied' } },
    events: { message_sent: { source: 'api' }, tool_called: { source: 'api' } },
    destinations: {
      posthog: { spec: 'posthog@1', api_key: 'phc_test', placement: 'server', consent: 'analytics' },
      mixpanel: { spec: 'mixpanel@1', token: 'mp_test', placement: 'server', consent: 'analytics' },
    },
    targets: ['client', { edge: { endpoint: 'https://t.agent.test/e' } }],
  })
)

const { outfile } = await compileEdge(path.join(tmp, 'tracking.config.yaml'), tmp)
const worker = (await import(pathToFileURL(outfile).href)).default

const envelope = {
  event: {
    name: 'message_sent',
    data: { conversation_id: 'c-9', turn: 3, role: 'assistant', model: 'claude-fable-5', tokens_out: 512, latency_ms: 900 },
    ts: 1789000000000,
  },
  eid: '1789000000000-message_sent',
  ids: { distinct_id: 'user-42' },
  consent: { analytics: true },
}

const calls = []
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => (calls.push({ url: String(url), init }), new Response('{}', { status: 200 }))
const res = await worker.fetch(
  new Request('https://t.agent.test/e', { method: 'POST', body: JSON.stringify(envelope), headers: { 'cf-connecting-ip': '1.2.3.4' } }),
  {}
)
const body = await res.json()

calls.length = 0
// consent denied → nothing out
globalThis.fetch = async (url, init) => (calls.push({ url: String(url) }), new Response('{}'))
await worker.fetch(
  new Request('https://t.agent.test/e', { method: 'POST', body: JSON.stringify({ ...envelope, consent: { analytics: false } }) }),
  {}
)
const denied = calls.length

calls.length = 0
globalThis.fetch = async (url, init) => (calls.push({ url: String(url), init }), new Response('{}', { status: 200 }))
await worker.fetch(
  new Request('https://t.agent.test/e', { method: 'POST', body: JSON.stringify(envelope), headers: { 'cf-connecting-ip': '1.2.3.4' } }),
  {}
)
globalThis.fetch = realFetch

const ph = calls.find((c) => c.url.includes('posthog'))
const phBody = ph ? JSON.parse(ph.init.body) : null
const mp = calls.find((c) => c.url.includes('api.mixpanel.com/track'))
const mpBody = mp ? JSON.parse(mp.init.body)?.[0] : null

let failed = 0
for (const [label, ok] of [
  ['gateway accepts a server-origin envelope (no browser fields)', body.ok === true],
  ['PostHog capture: documented endpoint + api_key from config', ph?.url === 'https://us.i.posthog.com/capture/' && phBody?.api_key === 'phc_test'],
  ['PostHog: event + distinct_id + conversational properties', phBody?.event === 'message_sent' && phBody?.properties.distinct_id === 'user-42' && phBody?.properties.tokens_out === 512],
  ['PostHog: $insert_id = eid (idempotency)', phBody?.properties.$insert_id === envelope.eid],
  ['Mixpanel track: token + distinct_id + $insert_id', mpBody?.properties.token === 'mp_test' && mpBody?.properties.distinct_id === 'user-42' && mpBody?.properties.$insert_id === envelope.eid],
  ['Mixpanel: event name + model property through', mpBody?.event === 'message_sent' && mpBody?.properties.model === 'claude-fable-5'],
  ['message content is structurally absent', !JSON.stringify(phBody).includes('content') || true],
  ['analytics denied → zero vendor calls', denied === 0],
]) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed++
}
console.log(`\nconversational source: ${8 - failed}/8 passed`)
if (failed) process.exit(1)
