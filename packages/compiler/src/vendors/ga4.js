/**
 * GA4 reference generator — direct mode (Measurement Protocol-style g/collect,
 * no gtag.js). Draft implementation of specs/ga4/spec.yaml; validated against
 * specs/ga4/fixtures/.
 */
export function ga4(id, dest) {
  if (!dest.measurement_id) throw new Error(`destination "${id}": measurement_id is required`)
  return `
t.use({
  id: ${JSON.stringify(id)},
  ${dest.consent ? `consent: ${JSON.stringify(dest.consent)},` : ''}
  ${dest.events ? `events: ${JSON.stringify(dest.events)},` : ''}
  handle(e, ctx) {
    let cid
    try {
      cid = localStorage._tl_cid || (localStorage._tl_cid = Date.now() + '.' + Math.random().toString(36).slice(2))
    } catch { cid = 'anon' }
    const p = ctx.page()
    const q = new URLSearchParams({
      v: '2', tid: ${JSON.stringify(dest.measurement_id)}, cid,
      en: e.name, dl: p.url, dr: p.ref, dt: p.title,
    })
    for (const k in e.data) {
      const v = e.data[k]
      if (v == null || typeof v === 'object') continue
      q.set((typeof v === 'number' ? 'epn.' : 'ep.') + k, String(v))
    }
    ctx.send('https://www.google-analytics.com/g/collect?' + q, undefined, true)
  },
})`
}
