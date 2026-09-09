import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { build } from 'esbuild'
import { writeFileSync, mkdirSync } from 'node:fs'
import { ga4 } from './vendors/ga4.js'
import { meta } from './vendors/meta.js'
import { tiktok } from './vendors/tiktok.js'
import { gads } from './vendors/gads.js'
import { linkedin } from './vendors/linkedin.js'
import { hotjar } from './vendors/hotjar.js'
import { relay } from './vendors/relay.js'

const EDGE_ENTRY = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../edge/src/index.js'
)

/** targets: - edge  |  - edge: { endpoint: "…" } */
export function getEdgeTarget(cfg) {
  for (const t of cfg.targets ?? []) {
    if (t === 'edge') return { endpoint: '/e' }
    if (t && typeof t === 'object' && 'edge' in t) return { endpoint: '/e', ...(t.edge ?? {}) }
  }
  return null
}

const RUNTIME_ENTRY = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../runtime/src/index.ts'
)

// Built-in reference generators. The agent-written, spec-validated generators
// will register here the same way; these two exist so the pipeline is real
// end to end from day one.
const generators = { ga4, meta, tiktok, gads, linkedin, hotjar }

// {{token}} → runtime expression. Builtins resolve page context; anything else
// must be a declared variable.
const BUILTIN_TOKENS = {
  hostname: 'location.hostname',
  path: 'location.pathname',
  url: 'location.href',
  title: 'document.title',
  referrer: 'document.referrer',
}

function tokenExpr(token, varNames) {
  if (BUILTIN_TOKENS[token]) return BUILTIN_TOKENS[token]
  if (varNames.has(token)) return `V[${JSON.stringify(token)}]()`
  throw new Error(`unknown variable "{{${token}}}" — declare it under variables:`)
}

/** "{{x}}" → expression; plain string → literal; mixed → concatenation */
function valueExpr(raw, varNames) {
  if (typeof raw !== 'string') return JSON.stringify(raw)
  const full = raw.match(/^\{\{([\w-]+)\}\}$/)
  if (full) return tokenExpr(full[1], varNames)
  if (!raw.includes('{{')) return JSON.stringify(raw)
  return raw
    .split(/(\{\{[\w-]+\}\})/)
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^\{\{([\w-]+)\}\}$/)
      return m ? `String(${tokenExpr(m[1], varNames)} ?? '')` : JSON.stringify(part)
    })
    .join(' + ')
}

/** element field accessors for DOM-event `fields` */
function elementExpr(raw, varNames) {
  const m = typeof raw === 'string' && raw.match(/^\{\{element\.([\w-]+)\}\}$/)
  if (!m) return valueExpr(raw, varNames)
  const f = m[1]
  if (f === 'text') return `(el.textContent || '').trim()`
  if (f === 'href') return `el.href || ''`
  if (f === 'id') return `el.id || ''`
  if (f.startsWith('data-')) return `el.getAttribute(${JSON.stringify(f)}) || ''`
  throw new Error(`unsupported element field "{{element.${f}}}" (text, href, id, data-*)`)
}

function buildVariables(vars, varNames) {
  const helpers = new Set()
  const entries = []
  for (const [name, def] of Object.entries(vars)) {
    if (def.value !== undefined) entries.push(`${JSON.stringify(name)}: () => ${JSON.stringify(def.value)}`)
    else if (def.dataLayer) { helpers.add('dlv'); entries.push(`${JSON.stringify(name)}: () => dlv(${JSON.stringify(def.dataLayer)})`) }
    else if (def.cookie) { helpers.add('ck'); entries.push(`${JSON.stringify(name)}: () => ck(${JSON.stringify(def.cookie)})`) }
    else if (def.query) { helpers.add('qp'); entries.push(`${JSON.stringify(name)}: () => qp(${JSON.stringify(def.query)})`) }
    else if (def.dom) { helpers.add('dq'); entries.push(`${JSON.stringify(name)}: () => dq(${JSON.stringify(def.dom)})`) }
    else if (def.lookup) {
      const { on, table = {}, regex = false } = def.lookup
      const def_ = 'default' in def.lookup ? JSON.stringify(def.lookup.default) : `''`
      const onExpr = valueExpr(on, varNames)
      const body = regex
        ? `const k = String(${onExpr} ?? ''); for (const [p, v] of ${JSON.stringify(Object.entries(table))}) { try { if (new RegExp(p).test(k)) return v } catch {} } return ${def_}`
        : `const k = String(${onExpr} ?? ''); const t = ${JSON.stringify(table)}; return Object.prototype.hasOwnProperty.call(t, k) ? t[k] : ${def_}`
      entries.push(`${JSON.stringify(name)}: () => { ${body} }`)
    } else throw new Error(`variable "${name}": unknown type (value|dataLayer|cookie|query|dom|lookup)`)
  }
  const HELPERS = {
    dlv: `const dlv = (p) => { const dl = window.dataLayer || []; const ks = p.split('.'); for (let i = dl.length - 1; i >= 0; i--) { let v = dl[i]; for (const k of ks) v = v == null ? undefined : v[k]; if (v !== undefined) return v } }`,
    ck: `const ck = (n) => { const m = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : '' }`,
    qp: `const qp = (n) => new URLSearchParams(location.search).get(n) || ''`,
    dq: `const dq = (s) => { const el = document.querySelector(s); return el ? (el.textContent || '').trim() : '' }`,
  }
  return [...[...helpers].map((h) => HELPERS[h]), `const V = {\n  ${entries.join(',\n  ')}\n}`]
}

export function generateEntry(cfg, baseDir = '.') {
  const site = cfg.site
  if (!site?.id) throw new Error('config: site.id is required')

  const auto = cfg.events?.page_view?.auto
  const autoPageview = auto === 'spa' ? "'spa'" : auto ? 'true' : 'false'
  const varNames = new Set(Object.keys(cfg.variables ?? {}))

  const imports = [`import { createTagless } from '@tagless-dev/runtime'`]
  const parts = [
    `const t = createTagless({ site: ${JSON.stringify(site.id)}, consentDefault: ${JSON.stringify(
      site.consent?.default ?? 'denied'
    )}, autoPageview: ${autoPageview} })`,
  ]

  if (varNames.size) parts.unshift(...buildVariables(cfg.variables, varNames))

  const anyEnrich = Object.values(cfg.destinations ?? {}).some((d) => d.enrich)
  if (anyEnrich) {
    parts.push(
      `const EN = (d, f) => ({ ...d, handle: (e, c) => d.handle({ ...e, data: { ...f(), ...e.data } }, c) })`
    )
  }
  const wrap = (destExpr, dest) => {
    if (!dest.enrich) return `t.use(${destExpr})`
    const fields = Object.entries(dest.enrich)
      .map(([k, v]) => `${JSON.stringify(k)}: ${valueExpr(v, varNames)}`)
      .join(', ')
    return `t.use(EN(${destExpr}, () => ({ ${fields} })))`
  }

  // hybrid target: placement server|both routes destinations through the relay
  const edgeTarget = getEdgeTarget(cfg)
  const serverDests = []

  let moduleCount = 0
  for (const [id, dest] of Object.entries(cfg.destinations ?? {})) {
    const placement = dest.placement ?? 'client'
    if (placement !== 'client') {
      if (!edgeTarget) throw new Error(`destination "${id}": placement "${placement}" needs an edge target (targets: - edge)`)
      serverDests.push([id, dest])
      if (placement === 'server') continue // no client-side code at all
    }
    // site-local destination: agent-written code living in the site's repo,
    // default-exporting a factory (opts) => Destination. Compiled in, tree-shaken
    // like everything else.
    if (dest.module) {
      const local = `dest${moduleCount++}`
      imports.push(`import ${local} from ${JSON.stringify(path.resolve(baseDir, dest.module))}`)
      const opts = { id, consent: dest.consent, events: dest.events, config: dest.config ?? {} }
      parts.push(wrap(`${local}(${JSON.stringify(opts)})`, dest))
      continue
    }
    const vendor = String(dest.spec ?? id).split('@')[0]
    const gen = generators[vendor]
    if (!gen) throw new Error(`destination "${id}": no generator for vendor "${vendor}" (or add a site-local "module")`)
    parts.push(wrap(gen(id, dest), dest))
  }

  if (serverDests.length) {
    // one first-party stream carries everything the gateway needs;
    // events = union of the server destinations' filters (undefined = all)
    const lists = serverDests.map(([, d]) => d.events)
    const union = lists.some((l) => !l) ? undefined : [...new Set(lists.flat())]
    parts.push(`t.use(${relay(edgeTarget.endpoint, union)})`)
  }

  // DOM event sources: declarative click/submit tracking on selectors
  for (const [name, ev] of Object.entries(cfg.events ?? {})) {
    if (ev?.source !== 'dom') continue
    if (!ev.selector) throw new Error(`event "${name}": source dom requires a selector`)
    const fields = Object.entries(ev.fields ?? {})
      .map(([k, v]) => `${JSON.stringify(k)}: ${elementExpr(v, varNames)}`)
      .join(', ')
    parts.push(
      `t.on(${JSON.stringify(ev.on ?? 'click')}, ${JSON.stringify(ev.selector)}, ${JSON.stringify(name)}${
        fields ? `, (el) => ({ ${fields} })` : ''
      })`
    )
  }

  const usesDataLayer = Object.values(cfg.events ?? {}).some((e) => e?.source === 'dataLayer')
  if (usesDataLayer) parts.push(`t.bridge()`)

  parts.push(`;(globalThis as any).tagless = t`)
  return [...imports, ...parts].join('\n')
}

export async function compile(configPath, outDir) {
  const cfg = parse(readFileSync(configPath, 'utf8'))
  const entry = generateEntry(cfg, path.dirname(path.resolve(configPath)))
  const outfile = path.join(outDir, 't.js')

  await build({
    stdin: {
      contents: entry,
      loader: 'ts',
      resolveDir: path.dirname(RUNTIME_ENTRY),
      sourcefile: 'tagless-entry.ts',
    },
    alias: { '@tagless-dev/runtime': RUNTIME_ENTRY },
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2018',
    outfile,
  })

  const edge = getEdgeTarget(cfg) ? await compileEdge(configPath, path.join(outDir, 'edge')) : null
  return { outfile, entry, edge: edge?.outfile ?? null }
}

/**
 * The user-owned gateway (SPEC §03): a self-contained Cloudflare Worker,
 * ready for `wrangler deploy` in the USER's account. Vendor tokens are their
 * worker secrets; nothing transits tagless infrastructure.
 */
export async function compileEdge(configPath, outDir) {
  const cfg = parse(readFileSync(configPath, 'utf8'))
  if (!getEdgeTarget(cfg)) throw new Error('config has no edge target')

  const serverDests = Object.fromEntries(
    Object.entries(cfg.destinations ?? {}).filter(([, d]) => d.placement === 'server' || d.placement === 'both')
  )
  if (!Object.keys(serverDests).length) throw new Error('edge target with no server/both destinations')

  const entry = [
    `import { createHandler } from ${JSON.stringify(EDGE_ENTRY)}`,
    `export default createHandler(${JSON.stringify({ site: cfg.site.id, destinations: serverDests })})`,
  ].join('\n')

  mkdirSync(outDir, { recursive: true })
  const outfile = path.join(outDir, 'worker.js')
  await build({
    stdin: { contents: entry, loader: 'js', resolveDir: outDir, sourcefile: 'edge-entry.js' },
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    outfile,
  })

  const secrets = [...new Set(Object.values(serverDests).map((d) => {
    const vendor = String(d.spec ?? '').split('@')[0]
    return { meta: 'META_ACCESS_TOKEN', ga4: 'GA4_API_SECRET', tiktok: 'TIKTOK_ACCESS_TOKEN' }[vendor]
  }).filter(Boolean))]

  writeFileSync(
    path.join(outDir, 'wrangler.toml'),
    `name = "tagless-edge-${cfg.site.id}"\nmain = "worker.js"\ncompatibility_date = "2026-09-01"\n\n# deploy (in this folder, YOUR Cloudflare account):\n#   npx wrangler deploy\n# secrets:\n${secrets.map((s) => `#   npx wrangler secret put ${s}`).join('\n')}\n# then point targets.edge.endpoint at the deployed URL and re-apply the client.\n`
  )
  return { outfile, secrets }
}
