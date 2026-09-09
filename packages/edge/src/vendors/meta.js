/**
 * Meta Conversions API — the documented server placement (spec meta@2 mode
 * capi). Deduplicates against a client pixel via event_id: the relay's eid
 * equals the direct-mode pixel's eid, so `placement: both` is Meta's
 * recommended redundant setup out of the box.
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

export function metaServer(id, dest) {
  return {
    id,
    consent: dest.consent ?? 'marketing',
    events: dest.events,
    secret: 'META_ACCESS_TOKEN',
    async send(ev, ctx, env) {
      const user_data = {
        client_ip_address: ctx.ip || undefined,
        client_user_agent: ctx.ua || undefined,
        fbp: ev.ids?.fbp,
        fbc: ev.ids?.fbc,
      }
      for (const k of ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'external_id']) {
        if (ev.user?.[k]) user_data[k] = [ev.user[k]]
      }
      const custom_data = {}
      for (const k in ev.event.data) {
        const v = ev.event.data[k]
        if (v != null && typeof v !== 'object') custom_data[k] = v
      }
      if (Array.isArray(ev.event.data.items)) {
        custom_data.content_type = 'product'
        custom_data.content_ids = ev.event.data.items.map((i) => i.item_id ?? i.id).filter(Boolean)
        custom_data.contents = ev.event.data.items.map((i) => ({
          id: i.item_id ?? i.id, quantity: i.quantity ?? 1, item_price: i.price,
        }))
      }
      const body = {
        data: [{
          event_name: EVENT_MAP[ev.event.name] || ev.event.name,
          event_time: Math.floor(ev.event.ts / 1000),
          event_id: ev.eid,
          action_source: 'website',
          event_source_url: ev.page?.url,
          user_data,
          custom_data,
        }],
      }
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${dest.pixel_id}/events?access_token=${env.META_ACCESS_TOKEN}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      )
      return { status: res.status }
    },
  }
}
