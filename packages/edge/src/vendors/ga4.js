/**
 * GA4 Measurement Protocol — the documented server placement (spec ga4@1
 * mode mp). Uses the relay's _ga-compatible client id and session layer, so
 * server-sent events land in the same user/session timelines as client hits.
 */
export function ga4Server(id, dest) {
  return {
    id,
    consent: dest.consent ?? 'analytics',
    events: dest.events,
    secret: 'GA4_API_SECRET',
    async send(ev, ctx, env) {
      const params = {
        ga_session_id: ev.ids?.sid,
        ga_session_number: Number(ev.ids?.sct ?? 1),
        engagement_time_msec: 1,
        page_location: ev.page?.url,
        page_referrer: ev.page?.ref || undefined,
        page_title: ev.page?.title,
      }
      for (const k in ev.event.data) {
        const v = ev.event.data[k]
        if (v != null && typeof v !== 'object') params[k] = v
      }
      if (Array.isArray(ev.event.data.items)) params.items = ev.event.data.items
      const body = { client_id: ev.ids?.cid, events: [{ name: ev.event.name, params }] }
      const res = await fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${dest.measurement_id}&api_secret=${env.GA4_API_SECRET}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      )
      return { status: res.status }
    },
  }
}
