// Verify ID (design #6 CheckIn step 1; the owner, 28 Nov 2026: "a photo or document of the ID, if
// it's physical it can be scanned"). Take photo opens the device camera (a phone's, or the desk
// webcam), Upload scan takes an image or a PDF. The photo shows here first, prepared on the device
// (downscaled, no metadata); nothing leaves the device until the check-in is saved. A returning
// guest's photo on file can be kept. A GM or the owner can skip it with a reason.
import { Camera, FileText, IdCard, RotateCcw, Upload } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { IdFileProblem, type PreparedFile, prepareIdFile } from './id-photo-file'

export type IdPhotoChoice =
  | { kind: 'file'; file: PreparedFile }
  | { kind: 'reuse'; documentId: string }
  | { kind: 'skip'; reason: string }
  | { kind: 'none' }

type Props = {
  value: IdPhotoChoice
  onChange: (value: IdPhotoChoice) => void
  required: boolean
  // "ID photo on file from 14 Oct 2026"
  onFile?: { documentId: string; line: string } | undefined
  canSkip: boolean
  error?: string | undefined
  idPrefix: string
}

export function IdPhoto({ value, onChange, required, onFile, canSkip, error, idPrefix }: Props) {
  const camera = useRef<HTMLInputElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string>()
  const statusId = useId()
  const preview = value.kind === 'file' ? value.file.preview : null
  // The preview URL lives only while it's shown.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const take = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setProblem(undefined)
    try {
      onChange({ kind: 'file', file: await prepareIdFile(file) })
    } catch (failure) {
      setProblem(
        failure instanceof IdFileProblem
          ? failure.message
          : "That photo couldn't be read. Take it again.",
      )
    } finally {
      setBusy(false)
      if (camera.current) camera.current.value = ''
      if (upload.current) upload.current.value = ''
    }
  }
  const shown = problem ?? error
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'flex flex-col gap-4 rounded-md border bg-surface-2/60 p-4 sm:flex-row sm:items-center',
          shown ? 'border-ro-dot' : 'border-border',
        )}
      >
        <div className="grid h-[120px] w-full flex-none place-items-center overflow-hidden rounded-md border border-border bg-surface sm:w-[190px]">
          {value.kind === 'file' && preview ? (
            <img
              src={preview}
              alt="The ID, as it will be saved"
              className="h-full w-full object-contain"
            />
          ) : value.kind === 'file' ? (
            <span className="flex flex-col items-center gap-1 text-sm text-text-2">
              <FileText className="size-7 text-pri-ink" aria-hidden="true" />
              PDF scan · {Math.max(1, Math.round(value.file.bytes / 1024))} KB
            </span>
          ) : (
            <IdCard className="size-9 text-text-3" aria-hidden="true" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex min-w-0 grow flex-col gap-2">
          <p id={statusId} className="font-medium" aria-live="polite">
            {value.kind === 'file'
              ? 'Check the photo is sharp and every corner shows.'
              : value.kind === 'reuse'
                ? (onFile?.line ?? 'ID photo on file')
                : value.kind === 'skip'
                  ? 'No ID photo: the stay shows "ID photo to add".'
                  : required
                    ? "Photograph the guest's ID, or upload a scan."
                    : "An ID photo isn't required here. Add one if the guest agrees."}
          </p>
          <p className="text-sm text-text-2">
            Check the ID matches the guest before you check in. The photo is kept privately and only
            managers can open it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={value.kind === 'none' ? 'primary' : 'default'}
              className="max-lg:h-11"
              loading={busy}
              aria-describedby={statusId}
              onClick={() => camera.current?.click()}
            >
              {value.kind === 'file' ? (
                <RotateCcw className="size-4" aria-hidden="true" />
              ) : (
                <Camera className="size-4" aria-hidden="true" />
              )}
              {value.kind === 'file' ? 'Retake' : 'Take photo'}
            </Button>
            <Button className="max-lg:h-11" disabled={busy} onClick={() => upload.current?.click()}>
              <Upload className="size-4" aria-hidden="true" />
              Upload scan
            </Button>
            {onFile && value.kind !== 'reuse' ? (
              <Button
                variant="ghost"
                className="max-lg:h-11"
                onClick={() => onChange({ kind: 'reuse', documentId: onFile.documentId })}
              >
                Keep the photo on file
              </Button>
            ) : null}
            {canSkip && required && value.kind !== 'skip' ? (
              <Button
                variant="ghost"
                className="max-lg:h-11"
                onClick={() => onChange({ kind: 'skip', reason: '' })}
              >
                Skip for now
              </Button>
            ) : null}
          </div>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-label="Take a photo of the ID"
            id={`${idPrefix}-camera`}
            onChange={(event) => void take(event.target.files?.[0])}
          />
          <input
            ref={upload}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload a scan of the ID"
            id={`${idPrefix}-upload`}
            data-testid="id-upload"
            onChange={(event) => void take(event.target.files?.[0])}
          />
        </div>
      </div>
      {shown ? (
        <p role="alert" className="text-sm text-ro">
          {shown}
        </p>
      ) : null}
      {value.kind === 'skip' ? (
        <Field
          id={`${idPrefix}-skip`}
          label="Why there's no ID photo"
          value={value.reason}
          hint="e.g. Camera not working"
          onChange={(event) => onChange({ kind: 'skip', reason: event.target.value })}
        />
      ) : null}
    </div>
  )
}
