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
  /** read a first-party cookie */
  cookie: (name: string) => string
  /** write a first-party cookie (days of validity) */
  setCookie: (name: string, value: string, days: number) => void
  /** normalized + SHA-256-hashed user data set via setUser (em, ph, fn, ln, ct, st, zp, external_id) */
  user: () => Record<string, string>
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
  /**
   * Provide user data for advanced matching / enhanced conversions.
   * Values are normalized (email lowercased, phone digits-only) and SHA-256
   * hashed before they're stored — plaintext never reaches a destination.
   * Accepts long keys (email, phone, first_name, …) or vendor-short ones.
   */
  setUser: (u: Record<string, string | undefined>) => Promise<void>
  use: (d: Destination) => void
  /** delegated DOM event source: fire `name` when `selector` matches ev.target.closest() */
  on: (domEvent: string, selector: string, name: string, fields?: (el: Element) => Record<string, unknown>) => void
  /** bridge an existing dataLayer-style global array (items with an `event` key) */
  bridge: (globalName?: string) => void
}

const USER_KEYS: Record<string, string> = {
  email: 'em',
  phone: 'ph',
  first_name: 'fn',
  last_name: 'ln',
  city: 'ct',
  state: 'st',
  zip: 'zp',
}

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  let out = ''
  for (const b of new Uint8Array(buf)) out += b.toString(16).padStart(2, '0')
  return out
}

export function createTagless(opts: RuntimeOptions): Tagless {
  const dests: Destination[] = []
  const queue: TaglessEvent[] = []
  const grantedByDefault = opts.consentDefault === 'granted'
  let consent: ConsentState | null = null

  const user: Record<string, string> = {}

  const ctx: Ctx = {
    site: opts.site,
    page: () => ({ url: location.href, ref: document.referrer, title: document.title }),
    cookie: (name) => {
      try {
        const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'))
        return m ? decodeURIComponent(m[1]) : ''
      } catch {
        return ''
      }
    },
    setCookie: (name, value, days) => {
      try {
        document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${days * 86400};SameSite=Lax`
      } catch {
        /* cookies unavailable */
      }
    },
    user: () => user,
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

  const setUser: Tagless['setUser'] = async (u) => {
    for (const [k, raw] of Object.entries(u)) {
      if (!raw) continue
      const key = USER_KEYS[k] ?? k
      const norm =
        key === 'ph' ? String(raw).replace(/\D/g, '') : String(raw).trim().toLowerCase()
      if (!norm) continue
      try {
        user[key] = await sha256(norm)
      } catch {
        /* no WebCrypto (http) — drop rather than leak plaintext */
      }
    }
  }

  const use: Tagless['use'] = (d) => {
    dests.push(d)
  }

  const on: Tagless['on'] = (domEvent, selector, name, fields) => {
    document.addEventListener(
      domEvent,
      (ev) => {
        const target = ev.target as Element | null
        const el = target && target.closest ? target.closest(selector) : null
        if (!el) return
        try {
          track(name, fields ? fields(el) : {})
        } catch {
          /* a broken field accessor never breaks the page */
        }
      },
      true
    )
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

  return { track, setConsent, setUser, use, on, bridge }
}
