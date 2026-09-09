/**
 * LinkedIn Insight reference generator — direct mode via the documented
 * image-pixel format (px.ads.linkedin.com/collect, fmt=gif) that LinkedIn
 * itself offers as the no-JS alternative to the Insight Tag.
 * Every event sends a collect hit (retargeting); events mapped in
 * `conversions` also carry their conversionId. The ?li_fat_id= click id is
 * persisted first-party and replayed, like the Insight Tag does.
 */
export function linkedin(id, dest) {
  if (!dest.partner_id) throw new Error(`destination "${id}": partner_id is required`)
  const conversions = dest.conversions ?? {}
  return `({
  id: ${JSON.stringify(id)},
  consent: ${JSON.stringify(dest.consent ?? 'marketing')},
  ${dest.events ? `events: ${JSON.stringify(dest.events)},` : ''}
  handle(e, ctx) {
    const conversions = ${JSON.stringify(conversions)}
    const p = ctx.page()
    const li = new URL(p.url).searchParams.get('li_fat_id')
    if (li) ctx.setCookie('li_fat_id', li, 30)
    const q = new URLSearchParams({
      pid: ${JSON.stringify(String(dest.partner_id))},
      fmt: 'gif',
      url: p.url,
      time: String(e.ts),
    })
    const conv = conversions[e.name]
    if (conv) q.set('conversionId', String(conv))
    const fat = ctx.cookie('li_fat_id')
    if (fat) q.set('li_fat_id', fat)
    ctx.send('https://px.ads.linkedin.com/collect/?' + q)
  },
})`
}
