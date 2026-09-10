/**
 * Mixpanel ingestion API — server placement (spec mixpanel@1).
 * $insert_id = envelope eid → idempotent on retries.
 */
export function mixpanelServer(id, dest) {
  return {
    id,
    consent: dest.consent ?? 'analytics',
    events: dest.events,
    secret: dest.token ? undefined : 'MIXPANEL_TOKEN',
    async send(ev, ctx, env) {
      const properties = {
        token: dest.token ?? env.MIXPANEL_TOKEN,
        distinct_id: ev.ids?.distinct_id ?? ev.ids?.cid ?? 'anonymous',
        time: ev.event.ts,
        $insert_id: ev.eid,
        ip: ctx.ip || undefined,
        current_url: ev.page?.url,
      }
      for (const k in ev.event.data) {
        const v = ev.event.data[k]
        if (v != null && typeof v !== 'object') properties[k] = v
      }
      const res = await fetch('https://api.mixpanel.com/track?verbose=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([{ event: ev.event.name, properties }]),
      })
      return { status: res.status }
    },
  }
}
