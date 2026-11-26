// Uploading a hotel logo, step by step as the contract says (decision 0016): ask for a short-lived
// signed URL, send the file straight to storage with exactly the headers given, then confirm it so
// the API checks the real file. Remove has an Undo, which confirms the old upload again.
import { useMutation } from '@tanstack/react-query'
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES, LOGO_MIN_PIXELS, type Property } from '@vento/shared'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { apiMessage } from '@/lib/errors'

export const WRONG_FILE = 'Use a PNG or JPEG up to 2 MB.'
export const NOT_UPLOADED = "The logo didn't upload. Try again."

// A problem found on this device, before or while sending the file; its message is for people.
class LogoProblem extends Error {}

const isLogoType = (type: string): type is (typeof LOGO_CONTENT_TYPES)[number] =>
  (LOGO_CONTENT_TYPES as readonly string[]).includes(type)

// The image's size, when the browser can read it (the API checks again either way).
async function pixels(file: File): Promise<{ width: number; height: number } | undefined> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return undefined
  }
}

export function tooSmallMessage(size: { width: number; height: number }): string | undefined {
  if (Math.min(size.width, size.height) >= LOGO_MIN_PIXELS) return undefined
  const side = size.width <= size.height ? `${size.width} px wide` : `${size.height} px tall`
  return `This logo is ${side}. Use one at least ${LOGO_MIN_PIXELS} px on each side.`
}

async function send(propertyId: string, file: File): Promise<Property> {
  const contentType = file.type
  if (!isLogoType(contentType) || file.size === 0 || file.size > LOGO_MAX_BYTES) {
    throw new LogoProblem(WRONG_FILE)
  }
  const size = await pixels(file)
  const small = size && tooSmallMessage(size)
  if (small) throw new LogoProblem(small)
  const ticket = await api.properties.logoUploadUrl({ propertyId, contentType, size: file.size })
  const sent = await fetch(ticket.url, {
    method: ticket.method,
    headers: ticket.headers,
    body: file,
  }).catch(() => undefined)
  if (!sent?.ok) throw new LogoProblem(NOT_UPLOADED)
  return api.properties.setLogo({ propertyId, uploadId: ticket.uploadId })
}

function messageFor(error: unknown): string {
  if (error instanceof LogoProblem) return error.message
  return apiMessage(error, ['STORAGE_OFF'])
}

export function useLogo(hotel: Property, onChange: (hotel: Property) => void) {
  const [preview, setPreview] = useState<string>()
  const [problem, setProblem] = useState<string>()
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview])

  const undo = useMutation({
    mutationFn: (uploadId: string) => api.properties.setLogo({ propertyId: hotel.id, uploadId }),
    onSuccess: (saved) => {
      onChange(saved)
      toast.success('Logo back')
    },
    onError: (error) => setProblem(messageFor(error)),
  })

  const upload = useMutation({
    mutationFn: (file: File) => send(hotel.id, file),
    onMutate: (file) => {
      setProblem(undefined)
      setPreview(URL.createObjectURL(file))
    },
    onSuccess: (saved) => {
      onChange(saved)
      toast.success('Logo saved')
    },
    onError: (error) => setProblem(messageFor(error)),
    onSettled: () => setPreview(undefined),
  })

  const remove = useMutation({
    mutationFn: () => api.properties.removeLogo({ propertyId: hotel.id }),
    onMutate: () => setProblem(undefined),
    onSuccess: (saved) => {
      const previous = hotel.logo?.uploadId
      onChange(saved)
      toast.success('Logo removed', {
        action: previous ? { label: 'Undo', onClick: () => undo.mutate(previous) } : undefined,
      })
    },
    onError: (error) => setProblem(messageFor(error)),
  })

  return {
    preview,
    problem,
    busy: upload.isPending || remove.isPending || undo.isPending,
    uploading: upload.isPending,
    removing: remove.isPending,
    upload: (file: File) => upload.mutate(file),
    remove: () => remove.mutate(),
  }
}
