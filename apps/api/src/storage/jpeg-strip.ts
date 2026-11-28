// Drops a JPEG's metadata segments (EXIF, XMP, ICC and other APPn, comments) and keeps only what
// draws the picture (decision 0031: an ID photo must not carry the phone's location or camera).
// The browser already re-encodes photos without metadata; this is the server's own check.
// Returns null when the bytes aren't a JPEG it can walk.
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const out: number[] = [0xff, 0xd8]
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1] ?? 0
    if (marker === 0xff) {
      offset += 1
      continue
    }
    // Start of scan: the image data runs to the end (EOI included); copy it as it is.
    if (marker === 0xda) {
      for (let i = offset; i < bytes.length; i++) out.push(bytes[i] ?? 0)
      return Uint8Array.from(out)
    }
    if (marker === 0xd9) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker)
      offset += 2
      continue
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
    if (length < 2 || offset + 2 + length > bytes.length) return null
    // APP1–APP15 (EXIF, XMP, ICC, Photoshop…) and COM go; APP0 (JFIF) and the rest stay.
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe
    if (!metadata) {
      for (let i = offset; i < offset + 2 + length; i++) out.push(bytes[i] ?? 0)
    }
    offset += 2 + length
  }
  out.push(0xff, 0xd9)
  return Uint8Array.from(out)
}

export const isPdf = (bytes: Uint8Array) =>
  bytes.length > 8 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-'
