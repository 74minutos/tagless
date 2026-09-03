#!/usr/bin/env node
import { compile } from './compile.js'
import { mkdirSync } from 'node:fs'

const [configPath, outDir = 'dist'] = process.argv.slice(2)
if (!configPath) {
  console.error('usage: tagless-compile <tracking.config.yaml> [outDir]')
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
const { outfile } = await compile(configPath, outDir)
console.log(`compiled → ${outfile}`)
