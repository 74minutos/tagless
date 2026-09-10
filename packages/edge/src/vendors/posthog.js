/**
 * PostHog capture API — server placement (spec posthog@1). The natural
 * destination for conversational/product events arriving via the envelope.
 */
export function posthogServer(id, dest) {
  return {
    id,
    consent: dest.consent ?? 'analytics',
    events: dest.events,
    secret: dest.api_key ? undefined : 'POSTHOG_API_KEY',
    async send(ev, ctx, env) {
      const properties = {
        distinct_id: ev.ids?.distinct_id ?? ev.ids?.cid ?? 'anonymous',
        $current_url: ev.page?.url,
        $ip: ctx.ip || undefined,
        $insert_id: ev.eid,
      }
      for (const k in ev.event.data) {
        const v = ev.event.data[k]
        if (v != null && typeof v !== 'object') properties[k] = v
      }
      const res = await fetch(`${dest.host ?? 'https://us.i.posthog.com'}/capture/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: dest.api_key ?? env.POSTHOG_API_KEY,
          event: ev.event.name,
          timestamp: new Date(ev.event.ts).toISOString(),
          properties,
        }),
      })
      return { status: res.status }
    },
  }
}
