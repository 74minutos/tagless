/**
 * import_gtm CI: run the importer on the synthetic container export, assert
 * the mapping, then prove the draft is real by compiling it and firing a
 * purchase through the simulator.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'
import { importGtm } from '../packages/compiler/src/import-gtm.js'
import { compile } from '../packages/compiler/src/compile.js'
import { createSandbox, matchExpectation } from '../packages/simulator/src/index.js'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const exportJson = JSON.parse(readFileSync(path.join(ROOT, 'examples/gtm-import/container_export.json'), 'utf8'))

const { config, report } = importGtm(exportJson)

const checks = [
  ['GA4 measurement id resolved from constant variable', config.destinations.ga4?.measurement_id === 'G-IMPORTED1'],
  ['GA4 got page_view + purchase', JSON.stringify(config.destinations.ga4?.events?.slice().sort()) === '["page_view","purchase"]'],
  ['Meta pixel id sniffed from custom HTML', config.destinations.meta?.pixel_id === '998877665544332'],
  ['Meta in direct mode', config.destinations.meta?.mode === 'direct'],
  ['purchase event bridged from dataLayer', config.events.purchase?.source === 'dataLayer'],
  ['Hotjar reported unmapped', report.unmapped.some((u) => u.tag === 'Hotjar')],
  ['img pixel reported unmapped', report.unmapped.some((u) => u.type === 'img')],
  ['nothing silently dropped', report.mapped.length + report.unmapped.length === report.tags_total],
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed++
}

// the draft must compile and actually fire
const tmp = mkdtempSync(path.join(os.tmpdir(), 'tagless-import-'))
const configPath = path.join(tmp, 'tracking.config.yaml')
writeFileSync(configPath, stringify(config))
const { outfile } = await compile(configPath, tmp)
const { tagless, captured } = createSandbox(readFileSync(outfile, 'utf8'))
tagless.setConsent({ analytics: true, marketing: true })
tagless.track('purchase', { value: 10, currency: 'EUR' })

const err = matchExpectation(captured, {
  url: 'https://www.google-analytics.com/g/collect',
  params: { tid: 'G-IMPORTED1', en: 'purchase' },
})
console.log(`${err ? '✗' : '✓'} imported draft compiles and fires GA4 purchase${err ? ` — ${err}` : ''}`)
if (err) failed++

console.log(`\nimport_gtm: ${checks.length + 1 - failed}/${checks.length + 1} passed`)
if (failed) process.exit(1)
