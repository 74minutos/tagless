/**
 * Google Ads reference generator — direct mode via the long-stable
 * conversion image-pixel format (googleadservices pagead/conversion).
 * Implements gtag's conversion-linker behavior: ?gclid= is persisted to the
 * first-party _gcl_aw cookie (90d) and replayed on later conversions.
 * Enhanced conversions (hashed user data) have no public client wire format —
 * the spec routes them to the server placement; see specs/gads/spec.yaml.
 */
export function gads(id, dest) {
  if (!dest.conversion_id) throw new Error(`destination "${id}": conversion_id is required (AW-…)`)
  const convId = String(dest.conversion_id).replace(/^AW-/, '')
  const labels = dest.labels ?? {}
  if (!Object.keys(labels).length) {
    throw new Error(`destination "${id}": labels is required ({event_name: conversion_label})`)
  }
  return `
t.use({
  id: ${JSON.stringify(id)},
  consent: ${JSON.stringify(dest.consent ?? 'marketing')},
  ${dest.events ? `events: ${JSON.stringify(dest.events)},` : ''}
  handle(e, ctx) {
    const labels = ${JSON.stringify(labels)}
    const p = ctx.page()
    // conversion linker: capture gclid on every event, even non-conversions
    const gclid = new URL(p.url).searchParams.get('gclid')
    if (gclid) ctx.setCookie('_gcl_aw', 'GCL.' + Math.floor(e.ts / 1000) + '.' + gclid, 90)
    const label = labels[e.name]
    if (!label) return
    const q = new URLSearchParams({ label, url: p.url })
    if (e.data.value != null) q.set('value', String(e.data.value))
    if (e.data.currency) q.set('currency_code', String(e.data.currency))
    if (e.data.transaction_id) q.set('oid', String(e.data.transaction_id))
    const aw = ctx.cookie('_gcl_aw')
    if (aw) q.set('gclaw', aw.split('.').slice(2).join('.'))
    ctx.send('https://www.googleadservices.com/pagead/conversion/${convId}/?' + q)
  },
})`
}
