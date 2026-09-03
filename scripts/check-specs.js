/**
 * Fixture CI: for every specs/<vendor>/fixtures/*.json, build a minimal
 * config with that destination, compile it, run the bundle in the sandbox,
 * fire the fixture event, and assert the expected requests were produced.
 * A generator that doesn't reproduce its contract doesn't ship.
 */
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { compile } from '../packages/compiler/src/compile.js'
import { createSandbox, matchExpectation } from '../packages/simulator/src/index.js'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const SPECS = path.join(ROOT, 'specs')

let pass = 0
let failCount = 0

for (const dir of readdirSync(SPECS, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  const specPath = path.join(SPECS, dir.name, 'spec.yaml')
  const fixturesDir = path.join(SPECS, dir.name, 'fixtures')
  if (!existsSync(specPath) || !existsSync(fixturesDir)) continue
  const spec = parse(readFileSync(specPath, 'utf8'))

  for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith('.json'))) {
    const fixture = JSON.parse(readFileSync(path.join(fixturesDir, file), 'utf8'))
    const label = `${spec.id}@${spec.version} · ${file}`

    const config = {
      site: { id: 'fixture', consent: { default: 'denied' } },
      events: { [fixture.event.name]: { source: 'api' } },
      destinations: {
        [spec.id]: { spec: `${spec.id}@${spec.version}`, consent: spec.consent, ...fixture.config },
      },
      targets: ['client'],
    }

    try {
      const tmp = mkdtempSync(path.join(os.tmpdir(), 'tagless-fixture-'))
      const configPath = path.join(tmp, 'tracking.config.yaml')
      writeFileSync(configPath, stringify(config))
      const { outfile } = await compile(configPath, tmp)

      const { tagless, captured } = createSandbox(readFileSync(outfile, 'utf8'))
      tagless.setConsent({ [spec.consent]: true })
      tagless.track(fixture.event.name, fixture.event.data)

      const failures = (fixture.expect ?? []).map((e) => matchExpectation(captured, e)).filter(Boolean)
      if (failures.length) {
        failCount++
        console.error(`✗ ${label}\n    ${failures.join('\n    ')}`)
      } else {
        pass++
        console.log(`✓ ${label}`)
      }
    } catch (err) {
      failCount++
      console.error(`✗ ${label}\n    ${err.message}`)
    }
  }
}

console.log(`\n${pass} passed, ${failCount} failed`)
if (failCount) process.exit(1)
