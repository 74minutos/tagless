/**
 * Tag/CMP detection for init_site: given a page's HTML, find what's already
 * tracking it. Pure function — testable without network.
 */

const VENDOR_SIGNATURES = [
  ['hotjar', /static\.hotjar\.com|hjid[:=]/],
  ['linkedin', /px\.ads\.linkedin\.com|_linkedin_partner_id/],
  ['tiktok', /analytics\.tiktok\.com|ttq\.load\(/],
  ['clarity', /clarity\.ms\/tag/],
  ['plausible', /plausible\.io\/js/],
  ['fathom', /cdn\.usefathom\.com/],
  ['segment', /cdn\.segment\.com\/analytics\.js/],
  ['walkerOS', /@elbwalker|walkerjs/i],
]

const CMP_SIGNATURES = [
  ['onetrust', /cdn\.cookielaw\.org|otSDKStub/],
  ['cookiebot', /consent\.cookiebot\.com/],
  ['didomi', /sdk\.privacy-center\.org|didomi/i],
  ['c15t', /c15t/],
  ['cookieyes', /cdn-cookieyes\.com/],
]

export function detectTags(html) {
  const gtm = [...new Set(html.match(/GTM-[A-Z0-9]{4,10}/g) ?? [])]
  const ga4 = [...new Set(html.match(/G-[A-Z0-9]{6,14}/g) ?? [])]
  const metaPixel = [...new Set(
    [...html.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]/g)].map((m) => m[1])
  )]
  const loadsFbevents = /connect\.facebook\.net\/[^'"]*fbevents\.js/.test(html)
  const loadsGtag = /googletagmanager\.com\/gtag\/js/.test(html)

  const vendors = VENDOR_SIGNATURES.filter(([, re]) => re.test(html)).map(([name]) => name)
  const cmp = CMP_SIGNATURES.find(([, re]) => re.test(html))?.[0] ?? null

  return { gtm, ga4, metaPixel, loadsFbevents, loadsGtag, vendors, cmp }
}

/** detection → draft tracking.config.yaml object + advice list */
export function draftConfig(detected, siteId) {
  const config = {
    site: { id: siteId, consent: { source: detected.cmp ?? 'custom', default: 'denied' } },
    events: { page_view: { auto: true } },
    destinations: {},
    targets: ['client'],
  }
  const advice = []

  if (detected.ga4.length) {
    config.destinations.ga4 = {
      spec: 'ga4@1',
      measurement_id: detected.ga4[0],
      consent: 'analytics',
      events: ['page_view'],
    }
    if (detected.ga4.length > 1) advice.push(`multiple GA4 ids found (${detected.ga4.join(', ')}) — kept the first, review`)
  }
  if (detected.metaPixel.length) {
    config.destinations.meta = {
      spec: 'meta@2',
      pixel_id: detected.metaPixel[0],
      mode: 'direct',
      consent: 'marketing',
      events: ['page_view'],
    }
    if (detected.loadsFbevents) advice.push('fbevents.js currently loaded (~110KB) — direct mode replaces it')
  }
  if (detected.gtm.length) {
    advice.push(`GTM container(s) ${detected.gtm.join(', ')} found — export from GTM Admin and run import_gtm for the full tag inventory (this page-level scan only sees what renders in HTML)`)
  }
  if (detected.vendors.length) {
    advice.push(`other vendors detected without specs yet: ${detected.vendors.join(', ')} — add specs or site-local modules`)
  }
  if (!detected.cmp) advice.push('no known CMP detected — wire your consent UI to tagless.setConsent()')

  return { config, advice }
}
