import { describe, expect, it } from 'vitest'
import { isPdf, stripJpegMetadata } from './jpeg-strip.ts'

const segment = (marker: number, body: number[]) => [
  0xff,
  marker,
  (body.length + 2) >> 8,
  (body.length + 2) & 0xff,
  ...body,
]

describe('stripJpegMetadata', () => {
  it('drops EXIF and comments, keeps JFIF, tables and the scan', () => {
    const exif = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, 9, 9, 9])
    const jpeg = Uint8Array.from([
      0xff,
      0xd8,
      ...segment(0xe0, [1, 2, 3]),
      ...segment(0xe1, exif),
      ...segment(0xfe, [7, 7]),
      ...segment(0xdb, [4, 4]),
      ...segment(0xda, [5]),
      0x11,
      0x22,
      0xff,
      0xd9,
    ])
    const stripped = stripJpegMetadata(jpeg)
    expect(stripped).not.toBeNull()
    const text = String.fromCharCode(...(stripped ?? []))
    expect(text).not.toContain('Exif')
    expect([...(stripped ?? [])]).toEqual([
      0xff,
      0xd8,
      ...segment(0xe0, [1, 2, 3]),
      ...segment(0xdb, [4, 4]),
      ...segment(0xda, [5]),
      0x11,
      0x22,
      0xff,
      0xd9,
    ])
  })

  it('refuses what isn’t a JPEG', () => {
    expect(stripJpegMetadata(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(isPdf(new TextEncoder().encode('%PDF-1.7\n%…'))).toBe(true)
    expect(isPdf(new TextEncoder().encode('hello world'))).toBe(false)
  })
})
