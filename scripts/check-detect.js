/** init_site detector CI: fixture HTML with the usual suspects in it. */
import { detectTags, draftConfig } from '../packages/mcp/src/detect.js'

const FIXTURE = `<!doctype html><html><head>
<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>
<script>gtag('config', 'G-ABCDEF1234');</script>
<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>
<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script>fbq('init', '112233445566778');fbq('track', 'PageView');</script>
<script src="https://static.hotjar.com/c/hotjar-999.js"></script>
</head><body></body></html>`

const d = detectTags(FIXTURE)
const { config, advice } = draftConfig(d, 'example-com')

let failed = 0
for (const [label, ok] of [
  ['GTM container found', d.gtm.includes('GTM-ABC1234')],
  ['GA4 id found', d.ga4.includes('G-ABCDEF1234')],
  ['Meta pixel id extracted', d.metaPixel.includes('112233445566778')],
  ['fbevents.js load flagged', d.loadsFbevents === true],
  ['CMP identified (onetrust)', d.cmp === 'onetrust'],
  ['vendor without spec listed (hotjar)', d.vendors.includes('hotjar')],
  ['draft: ga4 destination', config.destinations.ga4?.measurement_id === 'G-ABCDEF1234'],
  ['draft: meta direct mode', config.destinations.meta?.pixel_id === '112233445566778' && config.destinations.meta?.mode === 'direct'],
  ['draft: consent source from CMP', config.site.consent.source === 'onetrust'],
  ['advice: run import_gtm for the container', advice.some((a) => a.includes('import_gtm'))],
]) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed++
}
console.log(`\ninit_site detector: ${10 - failed}/10 passed`)
if (failed) process.exit(1)
