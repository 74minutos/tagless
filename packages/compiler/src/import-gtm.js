/**
 * import_gtm — the migration on-ramp.
 *
 * Takes a GTM container export (Admin → Export Container, exportFormatVersion 2)
 * and produces a tracking.config.yaml draft plus a report of what mapped
 * cleanly and what needs a human (or an agent with a vendor spec).
 *
 * Best-effort by design: GTM containers are arbitrary code; the importer
 * recognizes what it can prove (GA4 tags, fbq pixels in custom HTML,
 * pageview + custom-event triggers, constant variables) and reports the rest
 * instead of guessing.
 */

const ALL_PAGES_TRIGGER = '2147479553' // GTM built-in "All Pages"

// reverse of the compiler's meta event map: fbq names → tagless names
const META_EVENTS = {
  PageView: 'page_view',
  Purchase: 'purchase',
  AddToCart: 'add_to_cart',
  InitiateCheckout: 'begin_checkout',
  ViewContent: 'view_item',
  Search: 'search',
  CompleteRegistration: 'sign_up',
  Lead: 'generate_lead',
}

const param = (entity, key) => entity.parameter?.find((p) => p.key === key)?.value

export function importGtm(exportJson) {
  const cv = exportJson.containerVersion
  if (!cv) throw new Error('not a GTM container export (missing containerVersion)')

  const tags = cv.tag ?? []
  const triggers = cv.trigger ?? []
  const variables = cv.variable ?? []

  // resolve {{Constant Variable}} references; anything else stays literal and is reported
  const constants = Object.fromEntries(
    variables.filter((v) => v.type === 'c').map((v) => [v.name, param(v, 'value')])
  )
  const unresolved = new Set()
  const resolve = (val) =>
    typeof val === 'string'
      ? val.replace(/\{\{([^}]+)\}\}/g, (m, name) => {
          if (name in constants) return constants[name]
          unresolved.add(name)
          return m
        })
      : val

  const triggerById = Object.fromEntries(triggers.map((t) => [t.triggerId, t]))

  /** trigger ids → tagless event names ('' = unmappable trigger) */
  const eventsFor = (tag) =>
    (tag.firingTriggerId ?? []).map((id) => {
      if (id === ALL_PAGES_TRIGGER) return 'page_view'
      const t = triggerById[id]
      if (!t) return ''
      if (t.type === 'PAGEVIEW' || t.type === 'DOM_READY' || t.type === 'WINDOW_LOADED') return 'page_view'
      if (t.type === 'CUSTOM_EVENT') {
        return (
          t.customEventFilter?.[0]?.parameter?.find((p) => p.key === 'arg1')?.value ?? ''
        )
      }
      return ''
    })

  const config = {
    site: {
      id: (cv.container?.publicId ?? 'imported').toLowerCase(),
      consent: { source: 'custom', default: 'denied' },
    },
    events: {},
    destinations: {},
    targets: ['client'],
  }
  const mapped = []
  const unmapped = []

  const addEvent = (name) => {
    if (!name) return
    if (name === 'page_view') config.events.page_view ??= { auto: true }
    else config.events[name] ??= { source: 'dataLayer' }
  }
  const addDestEvents = (dest, names) => {
    const clean = [...new Set(names.filter(Boolean))]
    clean.forEach(addEvent)
    dest.events = [...new Set([...(dest.events ?? []), ...clean])]
    return clean
  }

  for (const tag of tags) {
    const events = eventsFor(tag)

    // GA4 config tag
    if (tag.type === 'gaawc') {
      const mid = resolve(param(tag, 'measurementId') ?? param(tag, 'tagId') ?? '')
      config.destinations.ga4 ??= { spec: 'ga4@1', measurement_id: mid, consent: 'analytics', events: [] }
      const clean = addDestEvents(config.destinations.ga4, events.length ? events : ['page_view'])
      mapped.push({ tag: tag.name, type: 'gaawc', to: 'ga4', events: clean })
      continue
    }

    // GA4 event tag
    if (tag.type === 'gaawe') {
      const mid = resolve(param(tag, 'measurementIdOverride') ?? '')
      config.destinations.ga4 ??= { spec: 'ga4@1', measurement_id: mid, consent: 'analytics', events: [] }
      if (mid && !config.destinations.ga4.measurement_id) config.destinations.ga4.measurement_id = mid
      const eventName = resolve(param(tag, 'eventName') ?? '') || events.find(Boolean)
      const clean = addDestEvents(config.destinations.ga4, [eventName])
      mapped.push({ tag: tag.name, type: 'gaawe', to: 'ga4', events: clean })
      continue
    }

    // custom HTML: sniff for a Meta pixel before giving up
    if (tag.type === 'html') {
      const html = param(tag, 'html') ?? ''
      const fbqInit = html.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/)
      if (fbqInit) {
        const tracked = [...html.matchAll(/fbq\(\s*['"]track(?:Custom)?['"]\s*,\s*['"]([\w]+)['"]/g)]
          .map((m) => META_EVENTS[m[1]] ?? m[1].toLowerCase())
        config.destinations.meta ??= {
          spec: 'meta@2',
          pixel_id: fbqInit[1],
          mode: 'direct',
          consent: 'marketing',
          events: [],
        }
        const clean = addDestEvents(config.destinations.meta, [...tracked, ...events])
        mapped.push({ tag: tag.name, type: 'html(fbq)', to: 'meta', events: clean, note: 'fbevents.js replaced by direct mode' })
        continue
      }
      unmapped.push({ tag: tag.name, type: 'html', reason: 'custom HTML — no known vendor signature; needs a vendor spec or manual review' })
      continue
    }

    if (tag.type === 'img') {
      unmapped.push({ tag: tag.name, type: 'img', reason: `pixel image (${resolve(param(tag, 'url') ?? '?')}) — identify the vendor and add a spec` })
      continue
    }

    unmapped.push({ tag: tag.name, type: tag.type, reason: `unsupported tag type "${tag.type}" — no vendor spec yet` })
  }

  return {
    config,
    report: {
      container: cv.container?.publicId,
      tags_total: tags.length,
      mapped,
      unmapped,
      unresolved_variables: [...unresolved],
      notes: [
        'consent.source set to "custom" — wire your CMP to tagless.setConsent()',
        'page_view imported as auto:true — switch to auto:"spa" if the site is a SPA',
        'review consent categories per destination before apply',
      ],
    },
  }
}
