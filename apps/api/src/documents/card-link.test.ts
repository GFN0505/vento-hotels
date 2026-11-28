import { describe, expect, it } from 'vitest'
import { CARD_LINK_SECONDS, cardLink, readCardToken } from './card-link.ts'

const claims = {
  organizationId: 'o',
  propertyId: 'p',
  stayId: 's',
  copy: 1,
  byName: 'Chiamaka Eze',
  deviceName: 'FD-VI-01',
}
const tokenOf = (url: string) => new URL(url, 'http://x').searchParams.get('t') ?? ''

describe('registration card links', () => {
  it('read back with the right secret until they expire', () => {
    const url = cardLink('secret', claims, 1_000)
    expect(readCardToken('secret', tokenOf(url), 2_000)).toMatchObject(claims)
    expect(readCardToken('other', tokenOf(url), 2_000)).toBeNull()
    expect(readCardToken('secret', tokenOf(url), 1_000 + CARD_LINK_SECONDS * 1000 + 1)).toBeNull()
  })

  it('refuse a changed body', () => {
    const [body, signature] = tokenOf(cardLink('secret', claims)).split('.')
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body ?? '', 'base64url').toString()),
        stayId: 'x',
      }),
    ).toString('base64url')
    expect(readCardToken('secret', `${forged}.${signature}`)).toBeNull()
  })
})
