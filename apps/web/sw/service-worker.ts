// Emits /sw.js with the build's own files to keep on the device (see sw/sw.js). Hand-written
// rather than a plugin library: a few lines, no dependency, and nothing added to the app's download.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

// What to keep at install: the app's code and styles, the icon, and the Latin fonts it opens with.
export function precacheList(files: string[]): string[] {
  return files
    .filter(
      (file) =>
        /^assets\/.*\.(js|css)$/.test(file) ||
        /\/(inter-latin-wght|fraunces-latin-opsz)-[^/]*\.woff2$/.test(file) ||
        file === 'favicon.svg',
    )
    .map((file) => `/${file}`)
    .sort()
}

export function serviceWorker(): Plugin {
  return {
    name: 'vento-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = [...Object.keys(bundle), 'favicon.svg']
      const precache = precacheList(files)
      // The version changes whenever any file does, because built file names carry their content.
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
