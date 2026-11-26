import { describe, expect, it } from 'vitest'
import { inspectImage } from './image.ts'
import { solidPng } from './png.ts'

// The smallest JPEG header that carries a frame: SOI, an APP0 segment, then SOF0 with the size.
function jpegHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
  ])
}

describe('inspectImage', () => {
  it('reads a PNG’s type and size from its bytes', () => {
    expect(inspectImage(solidPng(320, 240, [10, 20, 30]))).toEqual({
      type: 'image/png',
      width: 320,
      height: 240,
    })
  })

  it('reads a JPEG’s size from its first frame, past other segments', () => {
    expect(inspectImage(jpegHeader(1200, 800))).toEqual({
      type: 'image/jpeg',
      width: 1200,
      height: 800,
    })
  })

  it('refuses SVG, GIF, text and truncated files', () => {
    const text = (value: string) => new TextEncoder().encode(value)
    expect(inspectImage(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(inspectImage(text('GIF89a……'))).toBeNull()
    expect(inspectImage(solidPng(300, 300, [0, 0, 0]).subarray(0, 20))).toBeNull()
    expect(inspectImage(jpegHeader(300, 300).subarray(0, 22))).toBeNull()
  })
})
