/**
 * Relay — the client half of the hybrid target. Destinations placed on the
 * server don't fire from the browser; instead ONE first-party request per
 * event carries everything the gateway needs to translate to vendor server
 * APIs: the event, the page, the identity cookies (which must live
 * client-side — the relay creates _fbp / _fbc / _ga / session / _gcl_aw
 * exactly like the direct-mode generators do), hashed user data, and the
 * consent snapshot the gateway gates each destination on.
 */
export function relay(endpoint, events) {
  return `({
  id: 'relay',
  ${events ? `events: ${JSON.stringify(events)},` : ''}
  handle(e, ctx) {
    const p = ctx.page()
    const q = new URL(p.url).searchParams

    let fbp = ctx.cookie('_fbp')
    if (!fbp) {
      fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 2147483647)
      ctx.setCookie('_fbp', fbp, 90)
    }
    let fbc = ctx.cookie('_fbc')
    const fbclid = q.get('fbclid')
    if (fbclid) { fbc = 'fb.1.' + Date.now() + '.' + fbclid; ctx.setCookie('_fbc', fbc, 90) }

    let cid
    const ga = ctx.cookie('_ga')
    if (ga && ga.split('.').length >= 4) cid = ga.split('.').slice(2).join('.')
    else {
      cid = Math.floor(Math.random() * 2147483647) + '.' + Math.floor(e.ts / 1000)
      ctx.setCookie('_ga', 'GA1.1.' + cid, 730)
    }
    let sid, sct
    try {
      const now = Math.floor(e.ts / 1000)
      const s = (localStorage._tl_ga || '').split('.')
      if (s.length === 3 && now - Number(s[2]) < 1800) { sid = s[0]; sct = s[1] }
      else { sid = String(now); sct = String(s.length === 3 ? Number(s[1]) + 1 : 1) }
      localStorage._tl_ga = sid + '.' + sct + '.' + now
    } catch { sid = String(Math.floor(e.ts / 1000)); sct = '1' }

    const gclid = q.get('gclid')
    if (gclid) ctx.setCookie('_gcl_aw', 'GCL.' + Math.floor(e.ts / 1000) + '.' + gclid, 90)
    const li = q.get('li_fat_id')
    if (li) ctx.setCookie('li_fat_id', li, 30)

    ctx.send(${JSON.stringify(endpoint)}, {
      event: e,
      eid: e.ts + '-' + e.name,
      page: p,
      ids: {
        fbp,
        fbc: fbc || undefined,
        cid, sid, sct,
        gclaw: (ctx.cookie('_gcl_aw') || '').split('.').slice(2).join('.') || undefined,
        li_fat_id: ctx.cookie('li_fat_id') || undefined,
      },
      user: ctx.user(),
      consent: ctx.consent(),
      sr: typeof screen !== 'undefined' ? screen.width + 'x' + screen.height : undefined,
      ul: typeof navigator !== 'undefined' ? navigator.language : undefined,
    }, true)
  },
})`
}
