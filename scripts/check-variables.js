/**
 * Variables + DOM events CI: a config using every variable type (dataLayer,
 * cookie, query, dom, lookup incl. regex), per-destination enrich, and a
 * declarative click event — compiled, sandboxed, clicked, asserted.
 */
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stringify } from 'yaml'
import { compile } from '../packages/compiler/src/compile.js'
import { createSandbox, parseRequest } from '../packages/simulator/src/index.js'

const tmp = mkdtempSync(path.join(os.tmpdir(), 'tagless-vars-'))
writeFileSync(
  path.join(tmp, 'tracking.config.yaml'),
  stringify({
    site: { id: 'vartest', consent: { default: 'denied' } },
    variables: {
      page_type: { dataLayer: 'page.type' },
      user_tier: { cookie: 'tier' },
      gclid: { query: 'gclid' },
      headline: { dom: 'h1' },
      partner_id: {
        lookup: { on: '{{hostname}}', table: { 'shop.example.test': 'P-77' }, default: 'P-0' },
      },
      channel: {
        lookup: { on: '{{path}}', regex: true, table: { '^/blog': 'content', '^/shop': 'commerce' }, default: 'other' },
      },
    },
    events: {
      purchase: { source: 'api' },
      cta_click: {
        source: 'dom',
        on: 'click',
        selector: 'a.cta',
        fields: { text: '{{element.text}}', href: '{{element.href}}', headline: '{{headline}}' },
      },
    },
    destinations: {
      ga4: {
        spec: 'ga4@1',
        measurement_id: 'G-VARTEST1',
        consent: 'analytics',
        enrich: { page_type: '{{page_type}}', tier: '{{user_tier}}', partner: '{{partner_id}}', channel: '{{channel}}', click_id: '{{gclid}}' },
      },
    },
    targets: ['client'],
  })
)

const { outfile } = await compile(path.join(tmp, 'tracking.config.yaml'), tmp)
const { tagless, captured, sandbox, fireDom } = createSandbox(readFileSync(outfile, 'utf8'), {
  url: 'https://shop.example.test/shop/camisetas?gclid=CjTEST123',
  path: '/shop/camisetas',
  dom: { h1: 'Camisetas molonas' },
})

sandbox.dataLayer = [{ page: { type: 'plp' } }, { other: 1 }]
sandbox.document.cookie = 'tier=pro'
tagless.setConsent({ analytics: true })
tagless.track('purchase', { value: 10, currency: 'EUR' })
fireDom('click', 'a.cta', { textContent: '  Empezar ahora  ', href: 'https://shop.example.test/contacto' })

const reqs = captured.map(parseRequest).filter((r) => r.url.includes('google-analytics'))
const purchase = reqs.find((r) => r.params.en === 'purchase')?.params ?? {}
const click = reqs.find((r) => r.params.en === 'cta_click')?.params ?? {}

let failed = 0
for (const [label, ok] of [
  ['dataLayer variable (deep path, last-write-wins)', purchase['ep.page_type'] === 'plp'],
  ['cookie variable', purchase['ep.tier'] === 'pro'],
  ['query variable', purchase['ep.click_id'] === 'CjTEST123'],
  ['lookup table on {{hostname}}', purchase['ep.partner'] === 'P-77'],
  ['regex lookup on {{path}}', purchase['ep.channel'] === 'commerce'],
  ['event data wins over enrich', purchase['epn.value'] === '10'],
  ['dom click event fired', click.en === 'cta_click'],
  ['element.text extracted + trimmed', click['ep.text'] === 'Empezar ahora'],
  ['element.href extracted', click['ep.href'] === 'https://shop.example.test/contacto'],
  ['dom variable inside click fields', click['ep.headline'] === 'Camisetas molonas'],
  ['enrich applies to dom events too', click['ep.channel'] === 'commerce'],
]) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed++
}
console.log(`\nvariables + dom events: ${11 - failed}/11 passed`)
if (failed) process.exit(1)
