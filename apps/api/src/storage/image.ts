// What an uploaded image really is, from its own bytes: never trust the name or the declared type.
// PNG, JPEG and WebP only. No SVG (it can carry scripts) and nothing else. Dimensions are recorded
// when they can be read cheaply but no rule depends on them, so a WebP whose size we can't read is
// still accepted. React-pdf can't embed WebP: when PDFs arrive, WebP logos are converted to PNG on
// the server.
export type ImageInfo = {
  type: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number | null
  height: number | null
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return pngSize(bytes)
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return jpegSize(bytes)
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return webp(bytes)
  return null
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to))
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value)
}

// The first chunk must be IHDR: width and height are its first 8 bytes, big-endian.
function pngSize(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 24) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunk = String.fromCharCode(...bytes.subarray(12, 16))
  if (chunk !== 'IHDR') return null
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { type: 'image/png', width, height } : null
}

// Walks the JPEG segments to the first start-of-frame marker, which holds the dimensions.
function jpegSize(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1] ?? 0
    // Fill bytes before a marker.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    // Markers without a length: TEM and RST0–7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const length = view.getUint16(offset + 2)
    if (length < 2) return null
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isFrame) {
      if (offset + 9 > bytes.length) return null
      const height = view.getUint16(offset + 5)
      const width = view.getUint16(offset + 7)
      return width > 0 && height > 0 ? { type: 'image/jpeg', width, height } : null
    }
    offset += 2 + length
  }
  return null
}

// The first chunk after the RIFF header says which WebP it is; anything else isn't a WebP.
// Sizes: VP8X stores width − 1 and height − 1 as 24-bit little-endian; VP8L packs them as 14-bit
// fields after its 0x2f signature; VP8 (lossy) keeps them after the 9d 01 2a start code.
function webp(bytes: Uint8Array): ImageInfo | null {
  const chunk = ascii(bytes, 12, 16)
  if (chunk !== 'VP8X' && chunk !== 'VP8L' && chunk !== 'VP8 ') return null
  return { type: 'image/webp', ...(webpSize(bytes, chunk) ?? { width: null, height: null }) }
}

function webpSize(bytes: Uint8Array, chunk: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u24 = (at: number) => view.getUint16(at, true) + ((bytes[at + 2] ?? 0) << 16)
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { width: u24(24) + 1, height: u24(27) + 1 }
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  const startCode = bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a
  if (chunk === 'VP8 ' && bytes.length >= 30 && startCode) {
    const width = view.getUint16(26, true) & 0x3fff
    const height = view.getUint16(28, true) & 0x3fff
    return width > 0 && height > 0 ? { width, height } : null
  }
  return null
}
