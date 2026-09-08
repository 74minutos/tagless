/**
 * Hotjar reference generator — sdk mode, and honestly only sdk mode: Hotjar's
 * product IS its script (session recordings, heatmaps); there is no request
 * to fire "directly". What tagless adds over pasting the snippet is
 * consent-gated, load-once injection: the SDK doesn't exist in the page until
 * its consent category is granted.
 */
export function hotjar(id, dest) {
  if (!dest.site_id) throw new Error(`destination "${id}": site_id is required`)
  const siteId = Number(dest.site_id)
  return `
t.use({
  id: ${JSON.stringify(id)},
  consent: ${JSON.stringify(dest.consent ?? 'analytics')},
  events: ${JSON.stringify(dest.events ?? ['page_view'])},
  handle() {
    const w = window
    if (w.hj) return // load once
    w.hj = function () { (w.hj.q = w.hj.q || []).push(arguments) }
    w._hjSettings = { hjid: ${siteId}, hjsv: 6 }
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://static.hotjar.com/c/hotjar-${siteId}.js?sv=6'
    document.head.appendChild(s)
  },
})`
}
