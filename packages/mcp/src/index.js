#!/usr/bin/env node
/**
 * tagless MCP server — the only management interface.
 *
 * plan → approve → apply, Terraform-style. `simulate` shows the exact
 * requests a bundle fires before anything ships. Runs over stdio:
 *   { "command": "node", "args": ["packages/mcp/src/index.js"] }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { compile, generateEntry } from '@tagless-dev/compiler'
import { importGtm } from '@tagless-dev/compiler/src/import-gtm.js'
import { stringify } from 'yaml'
import { createSandbox, parseRequest } from '@tagless-dev/simulator'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const SPECS_DIR = path.join(REPO_ROOT, 'specs')
const BUDGET = 3 * 1024

const readConfig = (configPath) => {
  const abs = path.resolve(configPath)
  return { abs, cfg: parse(readFileSync(abs, 'utf8')) }
}

const planId = (entry) => createHash('sha256').update(entry).digest('hex').slice(0, 12)

const sizes = (file) => {
  const raw = readFileSync(file)
  return { raw: raw.length, gzip: gzipSync(raw, { level: 9 }).length, budget: BUDGET }
}

const compileToTemp = async (configPath) => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'tagless-'))
  const { outfile } = await compile(configPath, tmp)
  return outfile
}

const json = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true })

const destSummary = (cfg) =>
  Object.entries(cfg.destinations ?? {}).map(([id, d]) => ({
    id,
    spec: d.spec ?? id,
    consent: d.consent ?? null,
    placement: d.placement ?? 'client',
    events: d.events ?? '(all)',
  }))

const consentCategories = (cfg) => [
  ...new Set(Object.values(cfg.destinations ?? {}).map((d) => d.consent).filter(Boolean)),
]

const server = new McpServer({ name: 'tagless', version: '0.0.1' })

server.registerTool(
  'plan',
  {
    description:
      'Read a tracking.config.yaml and report exactly what would ship: destinations, consent gates, events, bundle size vs the 3KB budget, and the size delta against the currently built bundle. Returns a plan_id required by apply. Nothing is written.',
    inputSchema: {
      config: z.string().describe('path to tracking.config.yaml'),
      out: z.string().optional().describe('output dir apply would use (default: <config dir>/dist); used to compute the delta'),
    },
  },
  async ({ config, out }) => {
    const { abs, cfg } = readConfig(config)
    const entry = generateEntry(cfg, path.dirname(abs))
    const outfile = await compileToTemp(abs)
    const next = sizes(outfile)
    const currentPath = path.join(out ?? path.join(path.dirname(abs), 'dist'), 't.js')
    const current = existsSync(currentPath) ? sizes(currentPath) : null
    return json({
      plan_id: planId(entry),
      site: cfg.site?.id,
      consent_default: cfg.site?.consent?.default ?? 'denied',
      consent_categories: consentCategories(cfg),
      events: Object.keys(cfg.events ?? {}),
      destinations: destSummary(cfg),
      size: {
        ...next,
        current_gzip: current?.gzip ?? null,
        delta_gzip: current ? next.gzip - current.gzip : null,
        within_budget: next.gzip <= BUDGET,
      },
      next_step: 'run simulate to inspect payloads; run apply with this plan_id to ship',
    })
  }
)

server.registerTool(
  'apply',
  {
    description:
      'Compile the config and write the bundle. Requires the plan_id from a plan of the exact same config — a changed config invalidates the plan.',
    inputSchema: {
      config: z.string().describe('path to tracking.config.yaml'),
      plan_id: z.string().describe('plan_id returned by plan'),
      out: z.string().optional().describe('output dir (default: <config dir>/dist)'),
    },
  },
  async ({ config, plan_id, out }) => {
    const { abs, cfg } = readConfig(config)
    const current = planId(generateEntry(cfg, path.dirname(abs)))
    if (current !== plan_id) {
      return fail(
        `plan ${plan_id} is stale: the config now plans as ${current}. Re-run plan, review the diff, and apply with the new plan_id.`
      )
    }
    const outDir = out ?? path.join(path.dirname(abs), 'dist')
    mkdirSync(outDir, { recursive: true })
    const { outfile } = await compile(abs, outDir)
    return json({ applied: true, outfile, size: sizes(outfile) })
  }
)

server.registerTool(
  'simulate',
  {
    description:
      'Compile the config, run the bundle in a DOM sandbox, feed it events, and return every outgoing network request with parsed payloads. Consent defaults to all categories granted; pass a partial consent state to see gating in action.',
    inputSchema: {
      config: z.string().describe('path to tracking.config.yaml'),
      events: z
        .array(z.object({ name: z.string(), data: z.record(z.unknown()).optional() }))
        .describe('events to fire, in order'),
      consent: z
        .record(z.boolean())
        .optional()
        .describe('consent state to set before firing (default: every category granted)'),
      page: z
        .object({ url: z.string().optional(), title: z.string().optional(), referrer: z.string().optional() })
        .optional(),
    },
  },
  async ({ config, events, consent, page }) => {
    const { abs, cfg } = readConfig(config)
    const outfile = await compileToTemp(abs)
    const { tagless, captured } = createSandbox(readFileSync(outfile, 'utf8'), page)
    const state = consent ?? Object.fromEntries(consentCategories(cfg).map((c) => [c, true]))
    tagless.setConsent(state)
    for (const e of events) tagless.track(e.name, e.data ?? {})
    return json({
      consent: state,
      fired: events.map((e) => e.name),
      requests: captured.map(parseRequest),
      note: 'includes any auto page_view queued at load and released by consent',
    })
  }
)

import { detectTags, draftConfig } from './detect.js'
import { findElement } from './find-element.js'

server.registerTool(
  'find_element',
  {
    description:
      'Turn "track clicks on that thing on the page" into a verified CSS selector: fetches the live page, finds clickable elements matching a plain-language description, and returns candidates with uniqueness-checked selectors plus a ready-to-paste config block for a source:dom event. Static-HTML scan — purely client-rendered elements are invisible to it.',
    inputSchema: {
      url: z.string().describe('page URL to inspect'),
      description: z.string().describe('what the human said, e.g. "the start a conversation button"'),
      event_name: z.string().optional().describe('event name for the config block (default: derived)'),
    },
  },
  async ({ url, description, event_name }) => {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; tagless-find-element)' },
    })
    if (!res.ok) return fail(`fetch failed: ${res.status} ${res.statusText}`)
    const candidates = findElement(await res.text(), description)
    if (!candidates.length) {
      return json({
        candidates: [],
        note: 'no clickable element matched — if the page is client-rendered (SPA), the element may not exist in the static HTML; inspect the running page instead',
      })
    }
    const best = candidates.find((c) => c.unique) ?? candidates.find((c) => c.selector) ?? candidates[0]
    const name = event_name ?? 'cta_click'
    const configBlock = best.selector
      ? `events:\n  ${name}:\n    source: dom\n    on: click\n    selector: "${best.selector}"\n    fields: { text: "{{element.text}}" }`
      : null
    return json({
      candidates,
      config_block: configBlock,
      note:
        best.matches > 1
          ? `the selector matches ${best.matches} elements — all of them will fire ${name} (for repeated CTAs that is usually what you want; the {{element.text}} field disambiguates)`
          : undefined,
      next_step: 'add the block to tracking.config.yaml, then plan → simulate (fireDom) → apply',
    })
  }
)

server.registerTool(
  'init_site',
  {
    description:
      'Inspect a live URL: detect existing tracking (GTM containers, GA4, Meta pixel, common vendors) and the CMP, then draft a tracking.config.yaml to start the migration from. Page-level scan — for the full GTM tag inventory, export the container and run import_gtm.',
    inputSchema: {
      url: z.string().describe('page URL to inspect'),
      out: z.string().optional().describe('if given, write the draft tracking.config.yaml here'),
    },
  },
  async ({ url, out }) => {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; tagless-init-site)' },
    })
    if (!res.ok) return fail(`fetch failed: ${res.status} ${res.statusText}`)
    const html = await res.text()
    const detected = detectTags(html)
    const siteId = new URL(res.url).hostname.replace(/^www\./, '').replace(/[^a-z0-9-]/g, '-')
    const { config, advice } = draftConfig(detected, siteId)
    const configYaml = stringify(config)
    if (out) {
      mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
      writeFileSync(path.resolve(out), configYaml)
    }
    return json({ detected, advice, config_yaml: configYaml, written_to: out ?? null })
  }
)

const CDN = () => process.env.TAGLESS_CDN ?? 'https://cdn.tagless.foo'
const publishAuth = () => {
  const key = process.env.TAGLESS_PUBLISH_KEY
  if (!key) throw new Error('TAGLESS_PUBLISH_KEY is not set in the MCP server environment')
  return { authorization: `Bearer ${key}` }
}

server.registerTool(
  'publish_hosted',
  {
    description:
      'Hosted mode: compile the config, upload the bundle as an immutable version to the CDN, and repoint the site alias so the pasted snippet serves it within minutes. Same staleness rule as apply: requires the plan_id of the exact current config. Needs TAGLESS_PUBLISH_KEY in the environment.',
    inputSchema: {
      config: z.string().describe('path to tracking.config.yaml'),
      plan_id: z.string().describe('plan_id returned by plan'),
      cdn: z.string().optional().describe('CDN base URL (default: https://cdn.tagless.foo or $TAGLESS_CDN)'),
    },
  },
  async ({ config, plan_id, cdn }) => {
    const { abs, cfg } = readConfig(config)
    const current = planId(generateEntry(cfg, path.dirname(abs)))
    if (current !== plan_id) {
      return fail(`plan ${plan_id} is stale: the config now plans as ${current}. Re-run plan and review the diff.`)
    }
    const auth = publishAuth()
    const base = cdn ?? CDN()
    const site = cfg.site.id
    const bundle = readFileSync(await compileToTemp(abs), 'utf8')

    const put = await fetch(`${base}/t/${site}@${plan_id}.js`, { method: 'PUT', headers: auth, body: bundle })
    if (!put.ok) return fail(`upload failed: ${put.status} ${await put.text()}`)
    const alias = await fetch(`${base}/t/${site}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ version: plan_id }),
    })
    if (!alias.ok) return fail(`alias repoint failed: ${alias.status} ${await alias.text()}`)

    return json({
      published: `${site}@${plan_id}`,
      live_url: `${base}/t/${site}.js`,
      versioned_url: `${base}/t/${site}@${plan_id}.js`,
      snippet: `<script src="${base}/t/${site}.js" defer></script>`,
      gzip_bytes: gzipSync(Buffer.from(bundle), { level: 9 }).length,
      note: 'alias cache is max-age=300 + SWR — live within minutes; rollback repoints the alias to any previous version',
    })
  }
)

server.registerTool(
  'rollback',
  {
    description:
      'Hosted mode: repoint a site alias to any previously published version (a plan_id). Instant, no rebuild. Needs TAGLESS_PUBLISH_KEY.',
    inputSchema: {
      site: z.string().describe('site id'),
      version: z.string().describe('plan_id of the version to make live'),
      cdn: z.string().optional(),
    },
  },
  async ({ site, version, cdn }) => {
    const base = cdn ?? CDN()
    const res = await fetch(`${base}/t/${site}`, {
      method: 'POST',
      headers: { ...publishAuth(), 'content-type': 'application/json' },
      body: JSON.stringify({ version }),
    })
    if (!res.ok) return fail(`rollback failed: ${res.status} ${await res.text()}`)
    return json({ site, live: version, live_url: `${base}/t/${site}.js` })
  }
)

server.registerTool(
  'import_gtm',
  {
    description:
      'Migration on-ramp: read a GTM container export JSON (Admin → Export Container) and produce a tracking.config.yaml draft plus a report of what mapped cleanly (GA4 tags, Meta pixels sniffed inside custom HTML) and what needs review. Best-effort: nothing is guessed, everything unmapped is reported with a reason.',
    inputSchema: {
      export: z.string().describe('path to the GTM container export JSON'),
      out: z.string().optional().describe('if given, write the draft tracking.config.yaml here'),
    },
  },
  async ({ export: exportPath, out }) => {
    const exportJson = JSON.parse(readFileSync(path.resolve(exportPath), 'utf8'))
    const { config, report } = importGtm(exportJson)
    const configYaml = stringify(config)
    if (out) {
      mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
      writeFileSync(path.resolve(out), configYaml)
    }
    return json({
      report,
      config_yaml: configYaml,
      written_to: out ?? null,
      next_step: 'review the draft (especially consent categories and unmapped tags), then plan → simulate → apply',
    })
  }
)

server.registerTool(
  'search_specs',
  {
    description:
      'List or search the vendor spec registry: contracts describing endpoints, placements (client/server), modes (direct/sdk/…), consent category, and config fields per vendor.',
    inputSchema: { query: z.string().optional().describe('substring filter on id/name; omit to list all') },
  },
  async ({ query }) => {
    const q = (query ?? '').toLowerCase()
    const out = []
    for (const dir of readdirSync(SPECS_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const specPath = path.join(SPECS_DIR, dir.name, 'spec.yaml')
      if (!existsSync(specPath)) continue
      const spec = parse(readFileSync(specPath, 'utf8'))
      if (q && !`${spec.id} ${spec.name}`.toLowerCase().includes(q)) continue
      out.push({
        id: spec.id,
        version: spec.version,
        name: spec.name,
        consent: spec.consent,
        placements: spec.placements,
        modes: Object.keys(spec.modes ?? {}),
        config: Object.keys(spec.config ?? {}),
        fixtures: existsSync(path.join(SPECS_DIR, dir.name, 'fixtures'))
          ? readdirSync(path.join(SPECS_DIR, dir.name, 'fixtures')).length
          : 0,
      })
    }
    return json({ specs: out })
  }
)

await server.connect(new StdioServerTransport())
