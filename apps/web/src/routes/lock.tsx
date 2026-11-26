// The lock screen on a shared device (design #22, LockPOS / LockHK; decision 0022): tap your name,
// enter your 4-digit PIN, you're in. Big targets for busy hands; a physical keyboard works too.

import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { DEVICE_KINDS, type LockScreen, PIN_LENGTH, roleLabel } from '@vento/shared'
import { Delete, Lock, MonitorSmartphone } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { CANT_REACH_VENTO } from '@/lib/errors'
import { initials } from '@/lib/team'
import { usePageTitle } from '@/lib/title'

type LockSearch = { signedOut?: string | undefined }

export const Route = createFileRoute('/lock')({
  validateSearch: (search: Record<string, unknown>): LockSearch =>
    typeof search.signedOut === 'string' && search.signedOut.length <= 40
      ? { signedOut: search.signedOut }
      : {},
  component: LockPage,
})

type Ready = Extract<LockScreen, { status: 'ready' }>
type Person = Ready['people'][number]

function LockPage() {
  usePageTitle('Sign in on this device')
  const lock = useQuery({ queryKey: ['lock-screen'], queryFn: () => api.devices.lockScreen() })

  const device = lock.data?.status === 'ready' ? lock.data.device : undefined
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <Logo size={24} wordmark product className="text-[14px] text-text" />
        <span className="min-w-0 grow truncate text-right text-sm text-text-2">
          {device ? `${device.propertyName} · ${device.name}` : ''}
        </span>
        <Clock />
      </header>
      {lock.isPending ? (
        <Centered>
          <span
            className="h-40 w-full max-w-md animate-pulse rounded-md bg-surface-2"
            aria-hidden="true"
          />
        </Centered>
      ) : lock.isError ? (
        <Message title="Can't reach Vento" body={CANT_REACH_VENTO}>
          <Button variant="primary" size="xl" onClick={() => lock.refetch()}>
            Try again
          </Button>
        </Message>
      ) : lock.data.status === 'unregistered' ? (
        <Message
          icon={<MonitorSmartphone className="size-6 text-text-3" aria-hidden="true" />}
          title="This device isn't registered"
          body="This device isn't set up for staff PINs yet. A manager can register it in Settings › Devices."
        >
          <EmailLink />
        </Message>
      ) : lock.data.status === 'revoked' ? (
        <Message
          title={`This device was removed from ${lock.data.organizationName}`}
          body="Ask a manager if that's a mistake."
        >
          <EmailLink />
        </Message>
      ) : (
        <ReadyScreen screen={lock.data} />
      )}
    </div>
  )
}

function ReadyScreen({ screen }: { screen: Ready }) {
  const { signedOut } = Route.useSearch()
  const [person, setPerson] = useState<Person>()
  const idle = DEVICE_KINDS[screen.device.kind].idleSeconds
  const idleText = idle < 120 ? `${idle} seconds` : `${Math.round(idle / 60)} minutes`

  return (
    <main className="flex grow flex-col items-center px-4 py-8 sm:py-12">
      {person ? (
        <PinPad person={person} onCancel={() => setPerson(undefined)} />
      ) : (
        <div className="flex w-full max-w-3xl flex-col gap-6">
          {signedOut ? (
            <p role="status" className="rounded-md bg-bl-bg px-4 py-3 text-bl">
              {signedOut} was signed out. Tap your name to sign in.
            </p>
          ) : null}
          <h1 className="text-xl font-semibold">Tap your name</h1>
          {screen.people.length === 0 ? (
            <p className="text-text-2">
              No one has a PIN yet. Sign in with your email, then set one from your account menu.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {screen.people.map((p) => (
                <li key={p.memberId}>
                  <button
                    type="button"
                    onClick={() => setPerson(p)}
                    className="flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-4 text-center hover:border-pri hover:bg-pri-soft"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-grid size-10 place-items-center rounded-full bg-pri-soft text-sm font-semibold text-pri-ink"
                    >
                      {initials(p.displayName)}
                    </span>
                    <span className="font-medium">{p.displayName}</span>
                    <span className="text-sm text-text-2">{roleLabel(p.role)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-3">
            <span>Signs you out after {idleText} without a touch.</span>
            <EmailLink />
          </div>
        </div>
      )}
    </main>
  )
}

type PinError = { message: string; locked?: boolean }

function PinPad({ person, onCancel }: { person: Person; onCancel: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<PinError>()
  const [checking, setChecking] = useState(false)
  const [slow, setSlow] = useState(false)
  const [shake, setShake] = useState(0)
  const entered = useRef('')

  const submit = useCallback(
    async (value: string) => {
      setChecking(true)
      setError(undefined)
      // "Checking…" only if it takes a moment, so a fast sign-in doesn't flash it.
      const slowTimer = setTimeout(() => setSlow(true), 150)
      try {
        const response = await fetch('/api/auth/device/pin-sign-in', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ memberId: person.memberId, pin: value }),
        })
        if (response.ok) {
          // A fresh start for the new person: nothing from the last one stays in memory.
          window.location.assign('/')
          return
        }
        const body = (await response.json().catch(() => ({}))) as {
          code?: string
          triesLeft?: number
          lockedUntil?: string
          message?: string
        }
        setError(pinError(body, response.status))
        setShake((n) => n + 1)
      } catch {
        setError({ message: CANT_REACH_VENTO })
      }
      clearTimeout(slowTimer)
      setSlow(false)
      entered.current = ''
      setPin('')
      setChecking(false)
    },
    [person.memberId],
  )

  // The PIN lives in a ref as well as state, so fast taps never lose a digit and the fourth digit
  // sends exactly one sign-in (never from inside a state update, which React may run twice).
  const press = useCallback(
    (digit: string) => {
      if (checking || error?.locked || entered.current.length >= PIN_LENGTH) return
      setError(undefined)
      entered.current += digit
      setPin(entered.current)
      if (entered.current.length === PIN_LENGTH) void submit(entered.current)
    },
    [checking, error?.locked, submit],
  )
  const erase = useCallback(() => {
    entered.current = entered.current.slice(0, -1)
    setPin(entered.current)
  }, [])

  // Front desk PCs have keyboards: digits, Backspace and Escape work too.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (/^\d$/.test(event.key)) press(event.key)
      else if (event.key === 'Backspace') erase()
      else if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press, erase, onCancel])

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-5">
      <span
        aria-hidden="true"
        className="inline-grid size-14 place-items-center rounded-full bg-pri-soft text-lg font-semibold text-pri-ink"
      >
        {initials(person.displayName)}
      </span>
      <h1 className="text-xl font-semibold">{person.displayName}, enter your PIN</h1>
      <div key={shake} className={cn('flex gap-3', shake > 0 && 'pin-shake')} aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions, never reordered
            key={i}
            className={cn(
              'size-4 rounded-full border-2',
              i < pin.length ? 'border-pri bg-pri' : 'border-border-strong',
              error && 'border-ro-dot',
              error?.locked && 'opacity-40',
            )}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {pin.length} of {PIN_LENGTH} digits entered
      </p>
      <p role="alert" className={cn('min-h-10 text-center', error ? 'text-ro' : 'text-text-3')}>
        {error?.message ?? (slow ? 'Checking…' : '')}
      </p>
      <div className="grid w-full grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <Key
            key={digit}
            label={digit}
            onPress={() => press(digit)}
            disabled={checking || Boolean(error?.locked)}
          />
        ))}
        {/* Bottom-left stays empty, so a thumb aiming for 0 can't go back by mistake. */}
        <span aria-hidden="true" />
        <Key label="0" onPress={() => press('0')} disabled={checking || Boolean(error?.locked)} />
        <Key
          label={<Delete className="size-5" aria-hidden="true" />}
          ariaLabel="Delete last digit"
          onPress={erase}
          disabled={checking || pin.length === 0}
        />
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-12 items-center px-3 font-medium text-pri-ink hover:underline"
      >
        Not {person.displayName.split(' ')[0]}? Back to names
      </button>
      <p className="text-center text-sm text-text-3">Forgot your PIN? Ask a manager to reset it.</p>
    </div>
  )
}

function pinError(
  body: { code?: string; triesLeft?: number; lockedUntil?: string },
  status: number,
): PinError {
  if (body.code === 'WRONG_PIN') {
    const left = body.triesLeft ?? 0
    return { message: `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` }
  }
  if (body.code === 'PIN_LOCKED') {
    const at = body.lockedUntil
      ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
          new Date(body.lockedUntil),
        )
      : 'a few minutes'
    return {
      message: `Too many wrong PINs. Try again at ${at}, or ask a manager to reset your PIN.`,
      locked: true,
    }
  }
  if (body.code === 'CANT_SIGN_IN_HERE') return { message: "You can't sign in on this device." }
  if (body.code === 'PIN_NEEDS_RESET') {
    return {
      message: 'Your PIN was locked too many times. Ask a manager to reset it.',
      locked: true,
    }
  }
  if (status === 429) return { message: 'Too many tries on this device. Wait a few minutes.' }
  if (body.code === 'DEVICE_REVOKED' || body.code === 'DEVICE_NOT_REGISTERED') {
    window.location.reload()
  }
  return { message: CANT_REACH_VENTO }
}

function Key({
  label,
  ariaLabel,
  onPress,
  disabled,
}: {
  label: React.ReactNode
  ariaLabel?: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onPress}
      disabled={disabled}
      className={cn(
        'grid h-16 place-items-center rounded-md border border-border bg-surface font-medium text-text hover:bg-surface-2 active:bg-pri-soft disabled:opacity-45',
        'num text-2xl',
      )}
    >
      {label}
    </button>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Tick on the minute, so the clock never lags behind the wall.
    const untilNextMinute = () => 60_000 - (Date.now() % 60_000)
    let timer = setTimeout(function tick() {
      setNow(new Date())
      timer = setTimeout(tick, untilNextMinute())
    }, untilNextMinute())
    return () => clearTimeout(timer)
  }, [])
  return (
    <span className="num text-sm font-medium whitespace-nowrap">
      {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(now)}
    </span>
  )
}

function EmailLink() {
  return (
    <Link
      to="/sign-in"
      className="inline-flex min-h-12 items-center font-medium text-pri-ink hover:underline"
    >
      Sign in with email instead
    </Link>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex grow items-center justify-center p-6">{children}</div>
}

function Message({
  icon,
  title,
  body,
  children,
}: {
  icon?: React.ReactNode
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <Centered>
      <div className="flex max-w-md flex-col items-start gap-3">
        {icon ?? <Lock className="size-6 text-text-3" aria-hidden="true" />}
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-text-2">{body}</p>
        {children}
      </div>
    </Centered>
  )
}
