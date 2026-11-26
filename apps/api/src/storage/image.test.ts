import { describe, expect, it } from 'vitest'
import { inspectImage } from './image.ts'
import { solidPng, tinyWebp } from './png.ts'

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

// The RIFF header and first chunk of a WebP, enough for the size: `chunk` is its first 10 bytes.
function webpHeader(fourcc: string, chunk: number[]): Uint8Array {
  const text = (value: string) => [...value].map((c) => c.charCodeAt(0))
  return Uint8Array.from([
    ...text('RIFF'),
    ...[0x40, 0, 0, 0],
    ...text('WEBP'),
    ...text(fourcc),
    ...[0x20, 0, 0, 0],
    ...chunk,
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

  it('reads a lossless WebP’s size', () => {
    expect(inspectImage(tinyWebp())).toEqual({ type: 'image/webp', width: 1, height: 1 })
  })

  it('reads an extended WebP’s canvas size', () => {
    // Flags, 3 reserved bytes, then width − 1 = 639 and height − 1 = 479, 24-bit little-endian.
    const header = webpHeader('VP8X', [0x10, 0, 0, 0, 0x7f, 0x02, 0x00, 0xdf, 0x01, 0x00])
    expect(inspectImage(header)).toEqual({ type: 'image/webp', width: 640, height: 480 })
  })

  it('reads a lossy WebP’s size from its key frame', () => {
    // Frame tag, the 9d 01 2a start code, then width 800 and height 600, little-endian.
    const header = webpHeader('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02])
    expect(inspectImage(header)).toEqual({ type: 'image/webp', width: 800, height: 600 })
  })

  it('accepts a WebP whose size it can’t read, without dimensions', () => {
    const header = webpHeader('VP8 ', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(inspectImage(header)).toEqual({ type: 'image/webp', width: null, height: null })
  })

  it('refuses other RIFF files and WebP look-alikes', () => {
    const text = (value: string) => new TextEncoder().encode(value)
    expect(inspectImage(text('RIFF\u0040\0\0\0WAVEfmt '))).toBeNull()
    expect(inspectImage(text('RIFF\u0040\0\0\0WEBP<svg onload="alert(1)">'))).toBeNull()
  })

  it('refuses SVG, GIF, text and truncated files', () => {
    const text = (value: string) => new TextEncoder().encode(value)
    expect(inspectImage(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(inspectImage(text('GIF89a……'))).toBeNull()
    expect(inspectImage(solidPng(300, 300, [0, 0, 0]).subarray(0, 20))).toBeNull()
    expect(inspectImage(jpegHeader(300, 300).subarray(0, 22))).toBeNull()
  })
})
