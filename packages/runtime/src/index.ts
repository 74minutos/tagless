/**
 * tagless runtime — the browser core.
 *
 * Everything here ships to every visitor, so every byte is accountable.
 * No interpreter, no config parsing at runtime: the compiler bakes
 * destinations in as plain functions and esbuild tree-shakes the rest.
 */

export interface TaglessEvent {
  name: string
  data: Record<string, unknown>
  ts: number
}

export interface Ctx {
  /** site id from config */
  site: string
  page: () => { url: string; ref: string; title: string }
  /** fire a request; GET when body is undefined, sendBeacon when beacon=true */
  send: (url: string, body?: unknown, beacon?: boolean) => void
}

export interface Destination {
  id: string
  /** consent category required to fire (e.g. "marketing"); undefined = always allowed */
  consent?: string
  /** event-name filter; undefined = receives all events */
  events?: string[]
  handle: (e: TaglessEvent, ctx: Ctx) => void
}

export interface RuntimeOptions {
  site: string
  /** what to do before consent is known: "denied" queues, "granted" fires */
  consentDefault?: 'granted' | 'denied'
  /** true = pageview on load; "spa" = also on history push/pop */
  autoPageview?: boolean | 'spa'
}

export type ConsentState = Record<string, boolean>

export interface Tagless {
  track: (name: string, data?: Record<string, unknown>) => void
  setConsent: (c: ConsentState) => void
  use: (d: Destination) => void
  /** bridge an existing dataLayer-style global array (items with an `event` key) */
  bridge: (globalName?: string) => void
}

export function createTagless(opts: RuntimeOptions): Tagless {
  const dests: Destination[] = []
  const queue: TaglessEvent[] = []
  const grantedByDefault = opts.consentDefault === 'granted'
  let consent: ConsentState | null = null

  const ctx: Ctx = {
    site: opts.site,
    page: () => ({ url: location.href, ref: document.referrer, title: document.title }),
    send: (url, body, beacon) => {
      const s = body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, s)
        return
      }
      fetch(url, {
        method: s == null ? 'GET' : 'POST',
        body: s,
        keepalive: true,
        credentials: 'omit',
        mode: 'no-cors',
      }).catch(() => {})
    },
  }

  const allowed = (d: Destination) =>
    !d.consent || (consent ? consent[d.consent] === true : grantedByDefault)

  const dispatch = (e: TaglessEvent) => {
    for (const d of dests) {
      if (d.events && d.events.indexOf(e.name) < 0) continue
      if (!allowed(d)) continue
      try {
        d.handle(e, ctx)
      } catch {
        /* one broken destination never breaks the rest */
      }
    }
  }

  const track: Tagless['track'] = (name, data) => {
    const e: TaglessEvent = { name, data: data || {}, ts: Date.now() }
    // consent unknown + default denied → hold events until setConsent()
    if (consent === null && !grantedByDefault) {
      queue.push(e)
      return
    }
    dispatch(e)
  }

  const setConsent: Tagless['setConsent'] = (c) => {
    consent = { ...c }
    const held = queue.splice(0)
    for (const e of held) dispatch(e)
  }

  const use: Tagless['use'] = (d) => {
    dests.push(d)
  }

  const bridge: Tagless['bridge'] = (globalName) => {
    const w = window as unknown as Record<string, unknown[]>
    const name = globalName || 'dataLayer'
    const dl = (w[name] = w[name] || [])
    const intake = (item: unknown) => {
      if (item && typeof item === 'object' && typeof (item as { event?: unknown }).event === 'string') {
        const { event, ...rest } = item as { event: string } & Record<string, unknown>
        track(event, rest)
      }
    }
    dl.forEach(intake)
    const push = dl.push.bind(dl)
    dl.push = (...items: unknown[]) => {
      items.forEach(intake)
      return push(...items)
    }
  }

  if (opts.autoPageview) {
    const pv = () => track('page_view', { path: location.pathname, title: document.title })
    if (opts.autoPageview === 'spa') {
      const h = history
      const orig = h.pushState.bind(h)
      h.pushState = (...a: Parameters<History['pushState']>) => {
        orig(...a)
        pv()
      }
      addEventListener('popstate', pv)
    }
    pv()
  }

  return { track, setConsent, use, bridge }
}
