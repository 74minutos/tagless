/**
 * tagless CDN worker — the hosted loader (SPEC §02).
 *
 * The one immutable thing users paste:
 *   <script src="https://cdn.tagless.foo/t/<site-id>.js" defer></script>
 *
 * Routes:
 *   GET  /t/<site>.js            alias → current bundle (short TTL + SWR)
 *   GET  /t/<site>@<version>.js  immutable versioned bundle (cached forever)
 *   PUT  /t/<site>@<version>.js  upload a bundle          (Bearer PUBLISH_KEY)
 *   POST /t/<site>               repoint alias {version}  (Bearer PUBLISH_KEY)
 *
 * Rollback = POST the alias to any previously uploaded version. No rebuild.
 */

const js = (body, cache, version) =>
  new Response(body, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': cache,
      ...(version ? { etag: `"${version}"`, 'x-tagless-version': version } : {}),
    },
  })

import { LANDING } from './landing.js'
import { GUIDE } from './guide.js'

const html = (body) =>
  new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  })

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (url.pathname === '/') return html(LANDING)
      if (url.pathname === '/guide' || url.pathname === '/guide/') return html(GUIDE)
    }
    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } })
    }
    const m = url.pathname.match(/^\/t\/([a-z0-9][a-z0-9-]*)(?:@([0-9a-f]{6,64}))?(\.js)?$/)
    if (!m) return new Response('not found', { status: 404 })
    const [, site, version, ext] = m

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!ext) return new Response('not found', { status: 404 })
      if (version) {
        const body = await env.BUNDLES.get(`bundle:${site}@${version}`)
        if (body === null) return new Response('unknown version', { status: 404 })
        return js(body, 'public, max-age=31536000, immutable', version)
      }
      const current = await env.BUNDLES.get(`alias:${site}`)
      if (!current) return new Response('unknown site', { status: 404 })
      const body = await env.BUNDLES.get(`bundle:${site}@${current}`)
      if (body === null) return new Response('alias points to a missing bundle', { status: 500 })
      // updates land within minutes, the URL never changes; SWR keeps it
      // serving through republish races and origin hiccups
      return js(body, 'public, max-age=300, stale-while-revalidate=86400', current)
    }

    // publish API (MCP publish_hosted / rollback)
    const auth = req.headers.get('authorization')
    if (!env.PUBLISH_KEY || auth !== `Bearer ${env.PUBLISH_KEY}`) {
      return new Response('unauthorized', { status: 401 })
    }

    if (req.method === 'PUT' && version && ext) {
      const body = await req.text()
      if (!body || body.length > 512 * 1024) {
        return new Response('bundle empty or too large', { status: 400 })
      }
      await env.BUNDLES.put(`bundle:${site}@${version}`, body)
      return Response.json({ stored: `${site}@${version}`, bytes: body.length })
    }

    if (req.method === 'POST' && !version && !ext) {
      const { version: v } = await req.json().catch(() => ({}))
      if (!/^[0-9a-f]{6,64}$/.test(v ?? '')) return new Response('bad version', { status: 400 })
      const exists = await env.BUNDLES.get(`bundle:${site}@${v}`)
      if (exists === null) return new Response('version not uploaded', { status: 409 })
      await env.BUNDLES.put(`alias:${site}`, v)
      return Response.json({ site, live: v })
    }

    return new Response('method not allowed', { status: 405 })
  },
}
