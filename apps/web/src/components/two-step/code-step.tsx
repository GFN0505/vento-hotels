// The second step of sign-in (design #24, Auth2FA): the 6-digit code from the authenticator app,
// or a backup code, with "Don't ask again on this computer for 30 days" (decision 0023).
import { type FormEvent, useId, useState } from 'react'
import { AuthCard, AuthFootnote } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { authClient } from '@/lib/auth'
import { CANT_REACH_VENTO, isConnectionProblem } from '@/lib/errors'
import { usePageTitle } from '@/lib/title'

type CodeStepProps = { email: string; onDone: () => void | Promise<void>; onBack: () => void }

export function CodeStep({ email, onDone, onBack }: CodeStepProps) {
  usePageTitle('Enter your code')
  const trustId = useId()
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState('')
  const [trust, setTrust] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function verify(value: string) {
    setPending(true)
    setError(undefined)
    const { error: failure } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value.trim(), trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust })
    if (failure) {
      setPending(false)
      setCode('')
      // The 10-minute window to enter a code has passed: start again from the password.
      if (
        failure.code === 'INVALID_TWO_FACTOR_COOKIE' ||
        failure.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE'
      ) {
        onBack()
        return
      }
      setError(
        isConnectionProblem(failure)
          ? CANT_REACH_VENTO
          : failure.status === 429 || /lock/i.test(failure.message ?? '')
            ? 'Too many tries. Wait 15 minutes, then try again.'
            : backup
              ? "That backup code didn't work. Each one works once."
              : "That code didn't work. Codes change every 30 seconds; try the newest one.",
      )
      return
    }
    await onDone()
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!backup && !/^\d{6}$/.test(code)) {
      setError('Enter the 6 digits from your authenticator app')
      return
    }
    if (backup && code.trim().length < 6) {
      setError('Enter one of your backup codes')
      return
    }
    void verify(code)
  }

  return (
    <AuthCard
      title={backup ? 'Use a backup code' : 'Enter your code'}
      subtitle={
        backup
          ? `One of the backup codes you saved when you turned on two-step sign-in, for ${email}.`
          : `From your authenticator app, for ${email}.`
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
        <Field
          key={backup ? 'backup' : 'code'}
          label={backup ? 'Backup code' : '6-digit code'}
          name="code"
          inputMode={backup ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          maxLength={backup ? 20 : 6}
          value={code}
          className="num h-12 text-xl tracking-[0.3em]"
          error={error}
          hint={backup ? 'Like xxxxx-xxxxx, from the list you saved' : undefined}
          onChange={(event) => {
            const value = backup
              ? event.target.value
              : event.target.value.replace(/\D/g, '').slice(0, 6)
            setCode(value)
            setError(undefined)
            // Six digits is the whole code: check it straight away.
            if (!backup && value.length === 6 && !pending) void verify(value)
          }}
        />
        <label htmlFor={trustId} className="flex min-h-11 cursor-pointer items-center gap-2.5">
          <Checkbox
            id={trustId}
            checked={trust}
            onChange={(event) => setTrust(event.target.checked)}
          />
          <span>Don't ask again on this computer for 30 days</span>
        </label>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={pending}
          disabled={!backup && code.length !== 6}
        >
          {pending ? 'Checking…' : 'Verify'}
        </Button>
        <AuthFootnote>
          <button
            type="button"
            onClick={() => {
              setBackup((value) => !value)
              setCode('')
              setError(undefined)
            }}
          >
            {backup ? 'Use your authenticator app instead' : 'Use a backup code instead'}
          </button>
          <span className="max-sm:hidden"> · </span>
          <br className="sm:hidden" />
          <button type="button" onClick={onBack}>
            Back to sign in
          </button>
        </AuthFootnote>
      </form>
    </AuthCard>
  )
}
