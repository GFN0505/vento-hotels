// "Finish setting up" (design: OnbHome): the next step stands out with its own button and a line on
// why it matters; finished steps fold away. Shown to owners and group admins until everything's
// done or they hide it.
import { Link } from '@tanstack/react-router'
import { Check, ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { SetPinDialog } from '@/components/shell/set-pin-dialog'
import { TwoStepDialog } from '@/components/two-step/two-step-dialog'
import { cn } from '@/lib/cn'
import { useMe } from '@/lib/me'
import { type SetupStep, useSetupSteps } from './setup-steps'

const HIDDEN = 'vento.setupChecklistHidden'

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN) === '1'
  } catch {
    return false
  }
}

const buttonBase =
  'inline-flex h-11 flex-none items-center rounded-sm px-3 text-sm font-medium transition-colors lg:h-8'
const primaryButton = `${buttonBase} bg-pri text-white hover:bg-pri-hover`
const outlineButton = `${buttonBase} border border-border-strong bg-surface hover:bg-surface-2`

export function SetupChecklist({ className }: { className?: string }) {
  const me = useMe()
  const { steps, done, ready } = useSetupSteps()
  const [hidden, setHidden] = useState(readHidden)
  const [showDone, setShowDone] = useState(false)
  const [dialog, setDialog] = useState<'pin' | 'two-step'>()
  const role = me.real.role
  if (hidden || me.previewing || !(role === 'owner' || role === 'group_admin')) return null
  if (!ready || !me.data || done === steps.length) return null

  const finished = steps.filter((step) => step.done)
  const pending = steps.filter((step) => !step.done)
  const next = pending[0]?.key

  function action(step: SetupStep): ReactNode {
    const cls = step.key === next ? primaryButton : outlineButton
    switch (step.key) {
      case 'details':
        return (
          <Link to="/settings/hotels" className={cls}>
            Complete
          </Link>
        )
      case 'rooms':
        return (
          <Link to="/rates/rooms" className={cls}>
            Set up
          </Link>
        )
      case 'team':
        return (
          <Link to="/settings/members" className={cls}>
            Invite
          </Link>
        )
      case 'pin':
        return (
          <button type="button" className={cls} onClick={() => setDialog('pin')}>
            Set PIN
          </button>
        )
      case 'devices':
        return (
          <Link to="/settings/devices" className={cls}>
            Register
          </Link>
        )
      case 'two-step':
        return (
          <button type="button" className={cls} onClick={() => setDialog('two-step')}>
            Turn on
          </button>
        )
      default:
        return null
    }
  }

  function hide() {
    setHidden(true)
    try {
      localStorage.setItem(HIDDEN, '1')
    } catch {
      // Storage blocked: it shows again next time.
    }
  }

  const minutes = Math.max(1, pending.length)
  return (
    <section
      aria-labelledby="setup-heading"
      className={cn(
        'flex flex-col rounded-lg border border-border bg-surface shadow-card',
        className,
      )}
    >
      <header className="flex flex-col gap-3 px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="setup-heading" className="text-base font-semibold">
              Finish setting up
            </h2>
            <p className="text-sm text-text-2">
              {done} of {steps.length} done · about {minutes} {minutes === 1 ? 'minute' : 'minutes'}{' '}
              left
            </p>
          </div>
          <button
            type="button"
            onClick={hide}
            className="inline-flex min-h-11 items-center text-sm text-text-3 hover:text-text lg:min-h-0"
          >
            Hide
          </button>
        </div>
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-linear-to-r from-pri to-logo-dot transition-[width] duration-700 ease-out"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
      </header>

      <ul className="divide-y divide-border border-t border-border">
        {pending.map((step) => {
          const current = step.key === next
          return (
            <li
              key={step.key}
              className={cn(
                'flex min-h-16 items-center gap-3 px-5 py-3 transition-colors',
                current && 'bg-pri-soft/50',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-5 flex-none rounded-full border-2',
                  current ? 'border-pri' : 'border-border-strong',
                )}
              />
              <span className="flex min-w-0 grow flex-col">
                <span className={cn('font-medium', current && 'text-text')}>{step.label}</span>
                <span className="text-sm text-text-2">{step.why}</span>
              </span>
              {action(step)}
            </li>
          )
        })}
      </ul>

      {finished.length > 0 ? (
        <div className="border-t border-border">
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((value) => !value)}
            className="flex min-h-11 w-full items-center gap-2 px-5 py-2.5 text-left text-sm text-text-2 hover:bg-surface-2"
          >
            <span
              className="grid size-5 place-items-center rounded-full bg-pri text-white"
              aria-hidden="true"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className="grow">{finished.length} completed</span>
            <ChevronDown
              className={cn('size-4 transition-transform', showDone && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {showDone ? (
            <ul className="flex flex-col gap-1 px-5 pb-3">
              {finished.map((step) => (
                <li key={step.key} className="flex items-center gap-3 py-1 text-sm text-text-2">
                  <Check className="size-4 text-pri-ink" aria-hidden="true" />
                  {step.label}
                  <span className="sr-only">, done</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <SetPinDialog
        open={dialog === 'pin'}
        onClose={() => setDialog(undefined)}
        hasPin={me.data.hasPin}
      />
      <TwoStepDialog
        open={dialog === 'two-step'}
        onClose={() => setDialog(undefined)}
        isOn={me.data.twoStep}
      />
    </section>
  )
}
