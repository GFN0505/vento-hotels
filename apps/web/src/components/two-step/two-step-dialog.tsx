// Turn two-step sign-in on or off (decision 0023). On: confirm your password, scan the QR code
// (or type the key), enter a first code, then save your backup codes. Off: confirm your password.
// One dialog whose content changes by step, so focus moves to each step's first control.
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Download } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { orpc } from '@/lib/api'
import { authClient } from '@/lib/auth'
import { CANT_REACH_VENTO, isConnectionProblem } from '@/lib/errors'

type Step =
  | { name: 'password' }
  | { name: 'scan'; uri: string; key: string; backupCodes: string[] }
  | { name: 'codes'; backupCodes: string[] }

type TwoStepDialogProps = { open: boolean; onClose: () => void; isOn: boolean }

type Failure = { status?: number | undefined; code?: string | undefined } | null

function problem(failure: Failure, wrongCode?: string): string {
  if (failure?.status === 429) return 'Too many tries. Wait a minute and try again.'
  if (isConnectionProblem(failure)) return CANT_REACH_VENTO
  if (failure?.code === 'INVALID_PASSWORD') return "That password isn't right"
  return wrongCode ?? "That didn't work. Try again."
}

export function TwoStepDialog({ open, onClose, isOn }: TwoStepDialogProps) {
  const queryClient = useQueryClient()
  const formId = useId()
  const [step, setStep] = useState<Step>({ name: 'password' })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [warnUnsaved, setWarnUnsaved] = useState(false)

  // Each step puts focus on its own first control.
  const stepName = step.name
  useEffect(() => {
    if (!open || !stepName) return
    document.querySelector<HTMLElement>('dialog[open] [data-autofocus]')?.focus()
  }, [open, stepName])

  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.organization.key() })
  function reset() {
    setStep({ name: 'password' })
    setPassword('')
    setCode('')
    setError(undefined)
    setSaved(false)
    setWarnUnsaved(false)
  }
  function finish() {
    reset()
    onClose()
  }
  // Backup codes are shown once: closing before copying or downloading them asks once first.
  function requestClose() {
    if (pending) return
    if (step.name === 'codes') {
      if (!saved && !warnUnsaved) return setWarnUnsaved(true)
      toast.success('Two-step sign-in is on')
    }
    finish()
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!password) return setError('Enter your password')
    setPending(true)
    setError(undefined)
    if (isOn) {
      const { error: failure } = await authClient.twoFactor.disable({ password })
      setPending(false)
      if (failure) return setError(problem(failure))
      await refresh()
      toast.success('Two-step sign-in is off')
      return finish()
    }
    const { data, error: failure } = await authClient.twoFactor.enable({ password })
    setPending(false)
    if (failure || !data || !('totpURI' in data)) return setError(problem(failure))
    const key = new URL(data.totpURI).searchParams.get('secret') ?? ''
    setStep({ name: 'scan', uri: data.totpURI, key, backupCodes: data.backupCodes })
  }

  async function verify(value: string) {
    if (step.name !== 'scan') return
    setPending(true)
    setError(undefined)
    const { error: failure } = await authClient.twoFactor.verifyTotp({ code: value })
    setPending(false)
    if (failure) {
      setCode('')
      return setError(
        problem(
          failure,
          "That code didn't work. Codes change every 30 seconds; try the newest one.",
        ),
      )
    }
    await refresh()
    setStep({ name: 'codes', backupCodes: step.backupCodes })
  }

  let title: string
  let description: ReactNode
  let body: ReactNode
  let footer: ReactNode

  if (step.name === 'codes') {
    title = 'Save your backup codes'
    description =
      'Two-step sign-in is on. If you lose your phone, each of these signs you in once. Keep them somewhere safe, away from your phone.'
    body = (
      <div className="flex flex-col gap-4">
        <BackupCodes codes={step.backupCodes} onSaved={() => setSaved(true)} />
        {warnUnsaved ? (
          <p role="status" className="rounded-sm bg-am-bg px-3 py-2 text-am">
            These are shown only once. Copy or download them first, or close again to skip.
          </p>
        ) : null}
      </div>
    )
    footer = (
      <Button variant="primary" onClick={requestClose} data-autofocus>
        Done
      </Button>
    )
  } else if (step.name === 'scan') {
    title = 'Scan with your authenticator app'
    description = 'Google Authenticator, Microsoft Authenticator, 1Password or similar.'
    body = (
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          if (!/^\d{6}$/.test(code))
            return setError('Enter the 6 digits from your authenticator app')
          void verify(code)
        }}
        noValidate
        className="flex flex-col gap-5"
      >
        <QrCode uri={step.uri} />
        <div className="flex flex-col gap-1">
          <span className="text-sm text-text-2">Can't scan? Type this key into the app:</span>
          <span className="num font-mono font-medium tracking-[0.08em] break-all">
            {step.key.match(/.{1,4}/g)?.join(' ')}
          </span>
        </div>
        <Field
          label="Code from the app"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          data-autofocus
          value={code}
          className="num h-12 text-xl tracking-[0.3em]"
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, '').slice(0, 6)
            setCode(value)
            setError(undefined)
            // Six digits is the whole code: check it straight away.
            if (value.length === 6 && !pending) void verify(value)
          }}
          error={error}
        />
      </form>
    )
    footer = (
      <>
        <Button onClick={finish} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          loading={pending}
          disabled={code.length !== 6}
        >
          Verify and turn on
        </Button>
      </>
    )
  } else {
    title = isOn ? 'Turn off two-step sign-in?' : 'Turn on two-step sign-in'
    description = isOn
      ? 'Your password alone will sign you in again. Confirm it to turn two-step off.'
      : 'After your password, Vento asks for a code from an app on your phone. A password alone can be stolen; a code from your phone can’t. Takes about two minutes.'
    body = (
      <form id={formId} onSubmit={submitPassword} noValidate>
        <Field
          label="Your password"
          name="password"
          type="password"
          autoComplete="current-password"
          revealable
          data-autofocus
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setError(undefined)
          }}
          error={error}
        />
      </form>
    )
    footer = (
      <>
        <Button onClick={finish} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          form={formId}
          variant={isOn ? 'danger' : 'primary'}
          className={isOn ? 'border-ro-dot' : undefined}
          loading={pending}
        >
          {isOn ? 'Turn off' : 'Continue'}
        </Button>
      </>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title={title}
      description={description}
      footer={footer}
    >
      {body}
    </Dialog>
  )
}

// Drawn in the browser; the small QR library loads only when this dialog needs it.
function QrCode({ uri }: { uri: string }) {
  const [svg, setSvg] = useState<string>()
  useEffect(() => {
    let live = true
    void import('uqr').then(({ renderSVG }) => {
      if (live) setSvg(renderSVG(uri, { border: 2 }))
    })
    return () => {
      live = false
    }
  }, [uri])
  return (
    <div className="grid place-items-center rounded-md border border-border bg-white p-3">
      {svg ? (
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt="QR code to scan with your authenticator app"
          className="size-48"
        />
      ) : (
        <span className="size-48 animate-pulse rounded-sm bg-surface-2" aria-hidden="true" />
      )}
    </div>
  )
}

function BackupCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  const [done, setDone] = useState<'copied' | 'downloaded' | 'copy-failed'>()
  const text = `Vento Hotels backup codes. Each works once.\n\n${codes.join('\n')}\n`
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-surface-2 p-4 font-mono font-medium">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="max-lg:h-11"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setDone('copied')
              onSaved()
            } catch {
              setDone('copy-failed')
            }
          }}
        >
          {done === 'copied' ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {done === 'copied' ? 'Copied' : 'Copy'}
        </Button>
        <Button
          className="max-lg:h-11"
          onClick={() => {
            const link = document.createElement('a')
            link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
            link.download = 'vento-hotels-backup-codes.txt'
            link.click()
            URL.revokeObjectURL(link.href)
            setDone('downloaded')
            onSaved()
          }}
        >
          {done === 'downloaded' ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          {done === 'downloaded' ? 'Downloaded' : 'Download'}
        </Button>
        {done === 'copy-failed' ? (
          <span role="status" className="text-sm text-am">
            Couldn't copy. Use Download instead.
          </span>
        ) : null}
      </div>
    </div>
  )
}
