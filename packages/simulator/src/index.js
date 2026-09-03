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

  const sandbox = {
    console,
    URL,
    URLSearchParams,
    location: {
      href: page.url ?? 'https://example.test/',
      pathname: page.path ?? '/',
      search: '',
    },
    document: { title: page.title ?? 'Example', referrer: page.referrer ?? '' },
    history: { pushState() {} },
    addEventListener() {},
    navigator: {
      sendBeacon(url, body) {
        push('beacon', url, body, 'POST')
        return true
      },
    },
    fetch(url, init = {}) {
      push('fetch', url, init.body, init.method ?? 'GET')
      return Promise.resolve({})
    },
    localStorage: {},
  }
  sandbox.window = sandbox
  sandbox.self = sandbox

  vm.createContext(sandbox)
  vm.runInContext(code, sandbox, { filename: 't.js' })

  return { tagless: sandbox.tagless, captured, sandbox }
}

/** Split a captured request into base url + parsed query params. */
export function parseRequest(req) {
  const u = new URL(req.url)
  return {
    url: u.origin + u.pathname,
    method: req.method,
    via: req.via,
    params: Object.fromEntries(u.searchParams),
    body: req.body,
  }
}

/**
 * Assert one expected request (fixture shape) against the captured list.
 * `params` are a subset match. Returns null on success, a reason string on failure.
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
    if (!missing.length) return null
  }
  const best = candidates[0]
  const missing = Object.entries(expected.params ?? {})
    .filter(([k, v]) => best.params[k] !== v)
    .map(([k, v]) => `${k}=${v} (got ${best.params[k] ?? '∅'})`)
  return `request to ${expected.url} did not match: ${missing.join(', ') || `method ${best.method} ≠ ${expected.method}`}`
}
