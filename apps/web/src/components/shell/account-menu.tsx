// The avatar in the top bar opens this: who is signed in, and Sign out. Closes on Escape, on a
// click outside, and when focus leaves it, and hands focus back to the avatar on Escape.
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Eye, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { TwoStepDialog } from '@/components/two-step/two-step-dialog'
import { authClient } from '@/lib/auth'
import { lockDevice } from '@/lib/device-session'
import { useMe } from '@/lib/me'
import { PreviewRoleDialog } from './preview-role-dialog'
import { SetPinDialog } from './set-pin-dialog'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

type AccountMenuProps = { name: string; email: string; onSharedDevice: boolean }

export function AccountMenu({ name, email, onSharedDevice }: AccountMenuProps) {
  const me = useMe()
  const [settingPin, setSettingPin] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [twoStep, setTwoStep] = useState(false)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!open) return
    // Click or Tab anywhere outside closes it.
    function onOutside(event: Event) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('focusin', onOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('focusin', onOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function signOut() {
    // On a shared device, signing out hands the device to the next person.
    if (onSharedDevice) return lockDevice()
    await authClient.signOut()
    queryClient.clear()
    await navigate({ to: '/sign-in' })
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-grid size-11 place-items-center rounded-full lg:size-9"
      >
        <span
          aria-hidden="true"
          className="inline-grid size-8 place-items-center rounded-full bg-pri-soft text-xs font-semibold text-pri-ink"
        >
          {initials(name)}
        </span>
        <span className="sr-only">Account: {name}</span>
      </button>
      {open ? (
        <div
          id={menuId}
          className="absolute top-full right-0 z-50 mt-1 w-64 max-w-[calc(100vw-24px)] rounded-md border border-border bg-surface p-1 shadow-[var(--shadow-lg)]"
        >
          <div className="flex min-w-0 flex-col px-3 py-2">
            <span className="truncate font-medium">{name}</span>
            <span className="truncate text-sm text-text-2">{email}</span>
          </div>
          <div className="my-1 h-px bg-border" />
          {me.real.canPreview && !onSharedDevice ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setPreviewing(true)
              }}
              className="flex h-11 w-full items-center gap-2 rounded-sm px-3 text-left hover:bg-surface-2 lg:h-9"
            >
              <Eye className="size-4 text-text-2" aria-hidden="true" />
              Preview as a role
            </button>
          ) : null}
          {onSharedDevice ? null : (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setTwoStep(true)
              }}
              className="flex h-11 w-full items-center gap-2 rounded-sm px-3 text-left hover:bg-surface-2 lg:h-9"
            >
              <ShieldCheck className="size-4 text-text-2" aria-hidden="true" />
              <span className="grow">Two-step sign-in</span>
              <span className="text-sm text-text-3">{me.data?.twoStep ? 'On' : 'Off'}</span>
            </button>
          )}
          {onSharedDevice ? null : (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setSettingPin(true)
              }}
              className="flex h-11 w-full items-center gap-2 rounded-sm px-3 text-left hover:bg-surface-2 lg:h-9"
            >
              <KeyRound className="size-4 text-text-2" aria-hidden="true" />
              {me.data?.hasPin ? 'Change staff PIN' : 'Set staff PIN'}
            </button>
          )}
          <button
            type="button"
            onClick={signOut}
            className="flex h-11 w-full items-center gap-2 rounded-sm px-3 text-left hover:bg-surface-2 lg:h-9"
          >
            <LogOut className="size-4 text-text-2" aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
      <PreviewRoleDialog open={previewing} onClose={() => setPreviewing(false)} />
      <TwoStepDialog
        open={twoStep}
        onClose={() => setTwoStep(false)}
        isOn={me.data?.twoStep ?? false}
      />
      <SetPinDialog
        open={settingPin}
        onClose={() => setSettingPin(false)}
        hasPin={me.data?.hasPin ?? false}
      />
    </div>
  )
}
