import { describe, expect, it } from 'vitest'
import { precacheList } from './service-worker'

describe('precacheList', () => {
  it('keeps code, styles, the icon and the Latin fonts, not every script', () => {
    expect(
      precacheList([
        'assets/index-abc.js',
        'assets/index-abc.css',
        'assets/inter-latin-wght-normal-x1.woff2',
        'assets/inter-cyrillic-wght-normal-x2.woff2',
        'assets/inter-latin-ext-wght-normal-x3.woff2',
        'assets/fraunces-latin-opsz-italic-x4.woff2',
        'favicon.svg',
        'index.html',
        'sw.js',
      ]),
    ).toEqual([
      '/assets/fraunces-latin-opsz-italic-x4.woff2',
      '/assets/index-abc.css',
      '/assets/index-abc.js',
      '/assets/inter-latin-wght-normal-x1.woff2',
      '/favicon.svg',
    ])
  })
})
