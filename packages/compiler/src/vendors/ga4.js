/**
 * GA4 reference generator — direct mode (g/collect, no gtag.js), at parity
 * with what gtag actually sends:
 * - cid read from / written to the standard _ga cookie (GA1.1.<rand>.<ts>) so
 *   migrated sites keep user continuity with their historical GA4 data
 * - session layer: sid / sct / seg with the 30-minute timeout, _fv on first
 *   visit, _ss on session start — without these GA4 reports no sessions
 * - ul (language), sr (screen), _p (page-load id)
 * Validated against specs/ga4/fixtures/.
 */
export function ga4(id, dest) {
  if (!dest.measurement_id) throw new Error(`destination "${id}": measurement_id is required`)
  return `
t.use({
  id: ${JSON.stringify(id)},
  ${dest.consent ? `consent: ${JSON.stringify(dest.consent)},` : ''}
  ${dest.events ? `events: ${JSON.stringify(dest.events)},` : ''}
  handle(e, ctx) {
    // client id: standard _ga cookie, created in the same format if missing
    let cid
    const ga = ctx.cookie('_ga')
    if (ga && ga.split('.').length >= 4) {
      cid = ga.split('.').slice(2).join('.')
    } else {
      cid = Math.floor(Math.random() * 2147483647) + '.' + Math.floor(e.ts / 1000)
      ctx.setCookie('_ga', 'GA1.1.' + cid, 730)
    }

    // session state: sid.sct.lastHit, 30-minute timeout
    let sid, sct, first = '', start = ''
    try {
      const now = Math.floor(e.ts / 1000)
      const s = (localStorage._tl_ga || '').split('.')
      if (s.length === 3 && now - Number(s[2]) < 1800) {
        sid = s[0]; sct = s[1]
      } else {
        sid = String(now); sct = String(s.length === 3 ? Number(s[1]) + 1 : 1)
        start = '1'
        if (s.length !== 3) first = '1'
      }
      localStorage._tl_ga = sid + '.' + sct + '.' + now
    } catch { sid = String(Math.floor(e.ts / 1000)); sct = '1' }

    const p = ctx.page()
    const q = new URLSearchParams({
      v: '2', tid: ${JSON.stringify(dest.measurement_id)}, cid,
      sid, sct, seg: '1',
      en: e.name, dl: p.url, dr: p.ref, dt: p.title,
      ul: (typeof navigator !== 'undefined' && navigator.language || '').toLowerCase(),
      _p: String(e.ts % 2147483647),
    })
    if (typeof screen !== 'undefined') q.set('sr', screen.width + 'x' + screen.height)
    if (first) q.set('_fv', '1')
    if (start) q.set('_ss', '1')
    for (const k in e.data) {
      const v = e.data[k]
      if (v == null || typeof v === 'object') continue
      q.set((typeof v === 'number' ? 'epn.' : 'ep.') + k, String(v))
    }
    ctx.send('https://www.google-analytics.com/g/collect?' + q, undefined, true)
  },
})`
}
