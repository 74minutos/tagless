/**
 * TikTok Events API v1.3 — the documented server placement (spec tiktok@1
 * mode events_api). This is where TikTok stops being experimental: unlike
 * the reverse-engineered browser pixel, this wire format is official.
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

export function tiktokServer(id, dest) {
  return {
    id,
    consent: dest.consent ?? 'marketing',
    events: dest.events,
    secret: 'TIKTOK_ACCESS_TOKEN',
    async send(ev, ctx, env) {
      const properties = {}
      for (const k in ev.event.data) {
        const v = ev.event.data[k]
        if (v != null && typeof v !== 'object') properties[k] = v
      }
      if (Array.isArray(ev.event.data.items)) {
        properties.content_type = 'product'
        properties.contents = ev.event.data.items.map((i) => ({
          content_id: i.item_id ?? i.id, content_name: i.item_name, quantity: i.quantity ?? 1, price: i.price,
        }))
      }
      const body = {
        event_source: 'web',
        event_source_id: dest.pixel_id,
        data: [{
          event: EVENT_MAP[ev.event.name] || ev.event.name,
          event_time: Math.floor(ev.event.ts / 1000),
          event_id: ev.eid,
          user: {
            ip: ctx.ip || undefined,
            user_agent: ctx.ua || undefined,
            email: ev.user?.em,
            phone: ev.user?.ph,
          },
          page: { url: ev.page?.url, referrer: ev.page?.ref || undefined },
          properties,
        }],
      }
      const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Access-Token': env.TIKTOK_ACCESS_TOKEN },
        body: JSON.stringify(body),
      })
      return { status: res.status }
    },
  }
}
