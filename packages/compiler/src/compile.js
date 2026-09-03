import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { build } from 'esbuild'
import { ga4 } from './vendors/ga4.js'
import { meta } from './vendors/meta.js'

const RUNTIME_ENTRY = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../runtime/src/index.ts'
)

// Built-in reference generators. The agent-written, spec-validated generators
// will register here the same way; these two exist so the pipeline is real
// end to end from day one.
const generators = { ga4, meta }

export function generateEntry(cfg) {
  const site = cfg.site
  if (!site?.id) throw new Error('config: site.id is required')

  const auto = cfg.events?.page_view?.auto
  const autoPageview = auto === 'spa' ? "'spa'" : auto ? 'true' : 'false'

  const parts = [
    `import { createTagless } from '@tagless-dev/runtime'`,
    `const t = createTagless({ site: ${JSON.stringify(site.id)}, consentDefault: ${JSON.stringify(
      site.consent?.default ?? 'denied'
    )}, autoPageview: ${autoPageview} })`,
  ]

  for (const [id, dest] of Object.entries(cfg.destinations ?? {})) {
    const vendor = String(dest.spec ?? id).split('@')[0]
    const gen = generators[vendor]
    if (!gen) throw new Error(`destination "${id}": no generator for vendor "${vendor}"`)
    parts.push(gen(id, dest))
  }

  const usesDataLayer = Object.values(cfg.events ?? {}).some((e) => e?.source === 'dataLayer')
  if (usesDataLayer) parts.push(`t.bridge()`)

  parts.push(`;(globalThis as any).tagless = t`)
  return parts.join('\n')
}

export async function compile(configPath, outDir) {
  const cfg = parse(readFileSync(configPath, 'utf8'))
  const entry = generateEntry(cfg)
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

  return { outfile, entry }
}
