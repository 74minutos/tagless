/**
 * TikTok reference generator — direct mode (the pixel's v2 track endpoint,
 * no events.js SDK). The client wire format is not officially documented by
 * TikTok, so this mode is flagged experimental in specs/tiktok/spec.yaml;
 * the documented server placement is the Events API (hybrid target).
 */
const EVENT_MAP = {
  page_view: 'Pageview',
  purchase: 'CompletePayment',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  view_item: 'ViewContent',
  search: 'Search',
  sign_up: 'CompleteRegistration',
  generate_lead: 'SubmitForm',
  contact: 'Contact',
}

export function tiktok(id, dest) {
  if (!dest.pixel_id) throw new Error(`destination "${id}": pixel_id is required`)
  return `
t.use({
  id: ${JSON.stringify(id)},
  consent: ${JSON.stringify(dest.consent ?? 'marketing')},
  ${dest.events ? `events: ${JSON.stringify(dest.events)},` : ''}
  handle(e, ctx) {
    const map = ${JSON.stringify(EVENT_MAP)}
    const p = ctx.page()
    const properties = {}
    for (const k in e.data) {
      const v = e.data[k]
      if (v != null && typeof v !== 'object') properties[k] = v
    }
    ctx.send('https://analytics.tiktok.com/api/v2/pixel', {
      event: map[e.name] || e.name,
      event_id: e.ts + '-' + e.name,
      timestamp: new Date(e.ts).toISOString(),
      context: {
        pixel: { code: ${JSON.stringify(dest.pixel_id)} },
        page: { url: p.url, referrer: p.ref },
      },
      properties,
    })
  },
})`
}
