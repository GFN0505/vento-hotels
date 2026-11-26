// Simple PNGs made with Node's own zlib: the demo seed's placeholder logo and test fixtures. Not
// for anything a guest sees.
import { crc32, deflateSync } from 'node:zlib'

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  const typed = new TextEncoder().encode(type)
  out.set(typed, 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

type Rgb = [number, number, number]

export function pngFromPixels(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgb,
): Uint8Array {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB, no interlace
  const rowLength = 1 + width * 3
  const raw = new Uint8Array(rowLength * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * rowLength + 1 + x * 3)
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function solidPng(width: number, height: number, rgb: Rgb): Uint8Array {
  return pngFromPixels(width, height, () => rgb)
}
