/**
 * The user-owned gateway. One first-party POST in (the relay envelope), the
 * documented vendor server APIs out. Deploys to the USER's own Cloudflare
 * account — tokens are their worker secrets, events never transit tagless
 * infrastructure (SPEC §03: same shape as Meta's CAPI Gateway / Google Tag
 * Gateway, but vendor-agnostic).
 */
import { metaServer } from './vendors/meta.js'
import { ga4Server } from './vendors/ga4.js'
import { tiktokServer } from './vendors/tiktok.js'

const TRANSLATIONS = { meta: metaServer, ga4: ga4Server, tiktok: tiktokServer }

export function serverVendors() {
  return Object.keys(TRANSLATIONS)
}

export function createHandler(cfg) {
  const dests = []
  for (const [id, dest] of Object.entries(cfg.destinations ?? {})) {
    const vendor = String(dest.spec ?? id).split('@')[0]
    const make = TRANSLATIONS[vendor]
    if (!make) throw new Error(`edge: no server translation for vendor "${vendor}"`)
    dests.push(make(id, dest))
  }

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST',
    'access-control-allow-headers': 'content-type',
  }

  return {
    async fetch(req, env) {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
      if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors })

      let ev
      try {
        ev = JSON.parse(await req.text()) // text(): sendBeacon posts without a JSON content-type
      } catch {
        return Response.json({ ok: false, error: 'bad envelope' }, { status: 400, headers: cors })
      }
      if (!ev?.event?.name) return Response.json({ ok: false, error: 'bad envelope' }, { status: 400, headers: cors })

      const ctx = {
        ip: req.headers.get('cf-connecting-ip') ?? '',
        ua: req.headers.get('user-agent') ?? '',
      }

      const results = {}
      await Promise.all(
        dests.map(async (d) => {
          if (d.events && !d.events.includes(ev.event.name)) return
          if (d.consent && ev.consent?.[d.consent] !== true) {
            results[d.id] = { skipped: 'consent' }
            return
          }
          if (d.secret && !env[d.secret]) {
            results[d.id] = { skipped: `${d.secret} not set` }
            return
          }
          try {
            results[d.id] = await d.send(ev, ctx, env)
          } catch (err) {
            results[d.id] = { error: String(err?.message ?? err) }
          }
        })
      )
      return Response.json({ ok: true, results }, { headers: cors })
    },
  }
}
