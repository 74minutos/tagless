import vm from 'node:vm'

/**
 * Run a compiled tagless bundle inside a vm context with minimal DOM shims.
 * Nothing leaks into the host process, so a long-lived server can run many
 * simulations. Returns the page's `tagless` handle plus every request the
 * bundle attempted (fetch and sendBeacon).
 */
export function createSandbox(code, page = {}) {
  const captured = []
  const push = (via, url, body, method) =>
    captured.push({ via, method, url: String(url), body: body == null ? null : String(body) })

  const storage = () => {
    const m = new Map()
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    }
  }

  const href = page.url ?? 'https://example.test/'
  const loc = new URL(href)
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    location: {
      href,
      origin: loc.origin,
      hostname: loc.hostname,
      pathname: page.path ?? loc.pathname,
      search: loc.search,
    },
    document: (() => {
      const doc = { title: page.title ?? 'Example', referrer: page.referrer ?? '' }
      let jar = []
      Object.defineProperty(doc, 'cookie', {
        get: () => jar.join('; '),
        set: (v) => {
          const pair = String(v).split(';')[0].trim()
          const name = pair.split('=')[0]
          jar = jar.filter((c) => !c.startsWith(name + '='))
          jar.push(pair)
        },
      })
      return doc
    })(),
    history: { pushState() {} },
    addEventListener() {},
    navigator: {
      language: 'en-US',
      hardwareConcurrency: 8,
      sendBeacon(url, body) {
        push('beacon', url, body, 'POST')
        return true
      },
    },
    fetch(url, init = {}) {
      push('fetch', url, init.body, init.method ?? 'GET')
      return Promise.resolve({})
    },
    localStorage: storage(),
    sessionStorage: storage(),
    screen: { width: 1920, height: 1080, colorDepth: 24 },
  }
  sandbox.window = sandbox
  sandbox.self = sandbox

  vm.createContext(sandbox)
  vm.runInContext(code, sandbox, { filename: 't.js' })

  return { tagless: sandbox.tagless, captured, sandbox }
}

/** Split a captured request into base url + parsed query params. */
export function parseRequest(req) {
  // relative URLs (first-party collectors) parse against a sentinel origin
  const relative = !/^[a-z]+:\/\//i.test(req.url)
  const u = new URL(req.url, 'https://site.local')
  return {
    url: relative ? u.pathname : u.origin + u.pathname,
    method: req.method,
    via: req.via,
    params: Object.fromEntries(u.searchParams),
    body: req.body,
  }
}

/** deep subset: every leaf in `exp` must equal the corresponding leaf in `got` */
const subset = (exp, got) => {
  if (typeof exp !== 'object' || exp === null) return exp === got
  if (typeof got !== 'object' || got === null) return false
  return Object.entries(exp).every(([k, v]) => subset(v, got[k]))
}

/**
 * Assert one expected request (fixture shape) against the captured list.
 * `params` are a query subset match; `body` (when given) is a deep subset
 * match against the JSON request body. Returns null on success, a reason
 * string on failure.
 */
export function matchExpectation(captured, expected) {
  const parsed = captured.map(parseRequest)
  const candidates = parsed.filter((r) => r.url === expected.url)
  if (!candidates.length) {
    return `no request to ${expected.url} (saw: ${parsed.map((r) => r.url).join(', ') || 'none'})`
  }
  for (const r of candidates) {
    if (expected.method && r.method !== expected.method) continue
    const missing = Object.entries(expected.params ?? {}).filter(([k, v]) => r.params[k] !== v)
    if (missing.length) continue
    if ((expected.params_present ?? []).some((k) => !(k in r.params) || r.params[k] === '')) continue
    if (expected.body) {
      let got
      try {
        got = JSON.parse(r.body)
      } catch {
        continue
      }
      if (!subset(expected.body, got)) continue
    }
    return null
  }
  const best = candidates[0]
  const missing = Object.entries(expected.params ?? {})
    .filter(([k, v]) => best.params[k] !== v)
    .map(([k, v]) => `${k}=${v} (got ${best.params[k] ?? '∅'})`)
  return `request to ${expected.url} did not match: ${missing.join(', ') || `method ${best.method} ≠ ${expected.method}`}`
}
