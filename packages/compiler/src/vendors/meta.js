/**
 * Meta Pixel reference generator — direct mode (the /tr endpoint, no
 * fbevents.js). Draft implementation of specs/meta/spec.yaml; validated
 * against specs/meta/fixtures/. The hybrid target upgrades this same
 * destination to CAPI server-side.
 */
const EVENT_MAP = {
  page_view: 'PageView',
  purchase: 'Purchase',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  view_item: 'ViewContent',
  search: 'Search',
  sign_up: 'CompleteRegistration',
  generate_lead: 'Lead',
}

export function meta(id, dest) {
  if (!dest.pixel_id) throw new Error(`destination "${id}": pixel_id is required`)
  return `
t.use({
  id: ${JSON.stringify(id)},
  consent: ${JSON.stringify(dest.consent ?? 'marketing')},
  ${dest.events ? `events: ${JSON.stringify(dest.events)},` : ''}
  handle(e, ctx) {
    const map = ${JSON.stringify(EVENT_MAP)}
    const p = ctx.page()
    const q = new URLSearchParams({
      id: ${JSON.stringify(dest.pixel_id)},
      ev: map[e.name] || e.name,
      dl: p.url, rl: p.ref, ts: String(e.ts),
    })
    for (const k in e.data) {
      const v = e.data[k]
      if (v == null || typeof v === 'object') continue
      q.set('cd[' + k + ']', String(v))
    }
    ctx.send('https://www.facebook.com/tr?' + q)
  },
})`
}
