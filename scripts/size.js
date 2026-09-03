import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const file = process.argv[2]
const raw = readFileSync(file)
const gz = gzipSync(raw, { level: 9 })
const budget = 3 * 1024

console.log(`${file}`)
console.log(`  raw:  ${raw.length} bytes`)
console.log(`  gzip: ${gz.length} bytes (budget: ${budget})`)
if (gz.length > budget) {
  console.error(`  OVER BUDGET by ${gz.length - budget} bytes`)
  process.exit(1)
}
console.log(`  ✓ within budget (${(100 * gz.length / budget).toFixed(0)}% used)`)
