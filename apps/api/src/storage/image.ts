// What an uploaded image really is, from its own bytes: never trust the name or the declared type.
// PNG and JPEG only (spec: no SVG, which PDFs can't embed and which can carry scripts).
export type ImageInfo = { type: 'image/png' | 'image/jpeg'; width: number; height: number }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return pngSize(bytes)
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return jpegSize(bytes)
  return null
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
