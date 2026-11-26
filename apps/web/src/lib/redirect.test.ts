import { describe, expect, it } from 'vitest'
import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it('keeps paths inside Vento', () => {
    expect(safeRedirect('/join/abc')).toBe('/join/abc')
    expect(safeRedirect('/settings/members?q=ada')).toBe('/settings/members?q=ada')
  })

  it('refuses anything that could leave Vento', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/%2F%2Fevil.example',
      'javascript:alert(1)',
      '',
      42,
    ]) {
      expect(safeRedirect(value)).toBeUndefined()
    }
  })
})
