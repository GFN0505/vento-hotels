// Checks the built web app against bundle-budget.json and fails when a budget is exceeded.
// Run after `vite build`: `pnpm --filter @vento/web size`.
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const dist = new URL('../dist/', import.meta.url)
const budget = JSON.parse(readFileSync(new URL('../bundle-budget.json', import.meta.url), 'utf8'))
const kb = (path) => gzipSync(readFileSync(new URL(path, dist)), { level: 9 }).length / 1024

// What the first page loads: scripts, preloads and stylesheets referenced by index.html.
const html = readFileSync(new URL('index.html', dist), 'utf8')
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
const initialJs = initial.filter((p) => p.endsWith('.js')).reduce((sum, p) => sum + kb(p), 0)
const initialCss = initial.filter((p) => p.endsWith('.css')).reduce((sum, p) => sum + kb(p), 0)
const chunks = readdirSync(new URL('assets/', dist))
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: f, size: kb(`assets/${f}`) }))
  .sort((a, b) => b.size - a.size)
const largest = chunks[0] ?? { file: '(none)', size: 0 }

const checks = [
  ['First page JavaScript', initialJs, budget.initialJsKb],
  [`Largest JavaScript file (${largest.file})`, largest.size, budget.largestChunkKb],
  ['First page CSS', initialCss, budget.initialCssKb],
]

let failed = false
for (const [label, size, limit] of checks) {
  const ok = size <= limit
  failed ||= !ok
  console.log(`${ok ? '✓' : '✗'} ${label}: ${size.toFixed(1)} KB of ${limit} KB (gzip)`)
}
if (failed) {
  console.error(
    '\nOver budget. Make the code smaller (split a route, drop or lazy-load a dependency), or raise the budget in apps/web/bundle-budget.json with a reason in the pull request.',
  )
  process.exitCode = 1
}
