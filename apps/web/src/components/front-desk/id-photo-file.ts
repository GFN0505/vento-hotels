// Prepares an ID photo or scan on the device before it is sent (decision 0031): a photo is
// downscaled to 1600px on its long side and re-encoded as JPEG, which leaves out EXIF and every
// other piece of metadata (the phone's location, the camera); a PDF scan is sent as it is. Over
// 5 MB after that, it's refused here with the API's own words.
import {
  ID_DOCUMENT_MAX_BYTES,
  ID_DOCUMENT_TOO_LARGE,
  ID_DOCUMENT_WRONG_FILE,
  ID_PHOTO_MAX_SIDE,
  type IdDocumentType,
} from '@vento/shared'

export type PreparedFile = {
  contentType: IdDocumentType
  base64: string
  // For the local preview (an object URL the caller revokes), or null for a PDF.
  preview: string | null
  bytes: number
}

// The size a photo is drawn at: the long side at most `max`, never enlarged.
export function fitWithin(width: number, height: number, max = ID_PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export class IdFileProblem extends Error {}

export async function prepareIdFile(file: File): Promise<PreparedFile> {
  if (file.type === 'application/pdf') {
    if (file.size > ID_DOCUMENT_MAX_BYTES) throw new IdFileProblem(ID_DOCUMENT_TOO_LARGE)
    const bytes = new Uint8Array(await file.arrayBuffer())
    return {
      contentType: 'application/pdf',
      base64: toBase64(bytes),
      preview: null,
      bytes: bytes.length,
    }
  }
  if (!file.type.startsWith('image/')) throw new IdFileProblem(ID_DOCUMENT_WRONG_FILE)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new IdFileProblem(ID_DOCUMENT_WRONG_FILE)
  }
  const size = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new IdFileProblem(ID_DOCUMENT_WRONG_FILE)
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  )
  if (!blob) throw new IdFileProblem(ID_DOCUMENT_WRONG_FILE)
  if (blob.size > ID_DOCUMENT_MAX_BYTES) throw new IdFileProblem(ID_DOCUMENT_TOO_LARGE)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    contentType: 'image/jpeg',
    base64: toBase64(bytes),
    preview: URL.createObjectURL(blob),
    bytes: bytes.length,
  }
}
