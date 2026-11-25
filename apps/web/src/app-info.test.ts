import { describe, expect, it } from 'vitest'
import { appInfo } from './app-info.ts'

describe('appInfo', () => {
  it('uses the shared default currency', () => {
    expect(appInfo()).toEqual({ name: 'Vento Hotels', currency: 'NGN' })
  })
})
