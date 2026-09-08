/**
 * Site-local destination CI: a config referencing a `module:` destination
 * (agent-written code in the site's repo) compiles in, respects consent,
 * and fires.
 */
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stringify } from 'yaml'
import { compile } from '../packages/compiler/src/compile.js'
import { createSandbox } from '../packages/simulator/src/index.js'

const tmp = mkdtempSync(path.join(os.tmpdir(), 'tagless-module-'))

writeFileSync(
  path.join(tmp, 'collector.js'),
  `export default (opts) => ({
    id: opts.id,
    consent: opts.consent,
    events: opts.events,
    handle(e, ctx) {
      ctx.send(opts.config.endpoint, { event: e.name, ts: e.ts, ...e.data })
    },
  })`
)

writeFileSync(
  path.join(tmp, 'tracking.config.yaml'),
  stringify({
    site: { id: 'moduletest', consent: { default: 'denied' } },
    events: { ping: { source: 'api' } },
    destinations: {
      local: {
        module: './collector.js',
        consent: 'measurement',
        events: ['ping'],
        config: { endpoint: 'https://first.party/collect' },
      },
    },
    targets: ['client'],
  })
)

const { outfile } = await compile(path.join(tmp, 'tracking.config.yaml'), tmp)
const { tagless, captured } = createSandbox(readFileSync(outfile, 'utf8'))

tagless.track('ping', { a: 1 })
const beforeConsent = captured.length === 0

tagless.setConsent({ measurement: true })
const afterConsent =
  captured.length === 1 &&
  captured[0].url === 'https://first.party/collect' &&
  captured[0].method === 'POST' &&
  JSON.parse(captured[0].body).event === 'ping' &&
  JSON.parse(captured[0].body).a === 1

let failed = 0
for (const [label, ok] of [
  ['queued while consent unknown', beforeConsent],
  ['module destination fires with payload after consent', afterConsent],
]) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed++
}
console.log(`\nmodule destinations: ${2 - failed}/2 passed`)
if (failed) process.exit(1)
