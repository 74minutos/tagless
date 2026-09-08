/**
 * Meta Pixel reference generator — direct mode (the /tr endpoint, no
 * fbevents.js), at parity with what fbevents actually sends:
 * - _fbp browser-id cookie (created if missing) and _fbc click cookie
 *   (captured from ?fbclid=) → attribution and match quality
 * - ud[*] advanced matching from tagless.setUser() (SHA-256, hashed upstream)
 * - eid event id → deduplication with CAPI on the hybrid target
 * Validated against specs/meta/fixtures/.
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

    // _fbp: Meta's first-party browser id — create it exactly like fbevents does
    let fbp = ctx.cookie('_fbp')
    if (!fbp) {
      fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 2147483647)
      ctx.setCookie('_fbp', fbp, 90)
    }
    // _fbc: click id — capture fbclid from the URL, else reuse the cookie
    let fbc = ctx.cookie('_fbc')
    const fbclid = new URL(p.url).searchParams.get('fbclid')
    if (fbclid) {
      fbc = 'fb.1.' + Date.now() + '.' + fbclid
      ctx.setCookie('_fbc', fbc, 90)
    }

    const q = new URLSearchParams({
      id: ${JSON.stringify(dest.pixel_id)},
      ev: map[e.name] || e.name,
      dl: p.url, rl: p.ref, ts: String(e.ts),
      eid: e.ts + '-' + e.name,
      fbp,
      v: 'tagless',
    })
    if (fbc) q.set('fbc', fbc)
    if (typeof screen !== 'undefined') {
      q.set('sw', String(screen.width))
      q.set('sh', String(screen.height))
    }
    const ud = ctx.user()
    for (const k in ud) q.set('ud[' + k + ']', ud[k])

    // ecommerce: items[] → contents/content_ids (fbevents wire format)
    if (Array.isArray(e.data.items)) {
      const items = e.data.items
      q.set('cd[content_type]', 'product')
      q.set('cd[content_ids]', JSON.stringify(items.map((i) => i.item_id ?? i.id).filter(Boolean)))
      q.set('cd[contents]', JSON.stringify(items.map((i) => ({
        id: i.item_id ?? i.id, quantity: i.quantity ?? 1, item_price: i.price,
      }))))
      q.set('cd[num_items]', String(items.reduce((n, i) => n + (i.quantity ?? 1), 0)))
    }

    for (const k in e.data) {
      const v = e.data[k]
      if (v == null || typeof v === 'object') continue
      q.set('cd[' + k + ']', String(v))
    }
    ctx.send('https://www.facebook.com/tr?' + q)
  },
})`
}
