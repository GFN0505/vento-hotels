// The 4-digit PIN pad of the lock screen (design #22) and the approval prompt: dots that shake on a
// wrong PIN (not for reduced motion), big keys for busy hands, and a physical keyboard (digits,
// Backspace, Enter, Escape) for front desk PCs. It holds no PIN itself: the caller keeps it, so a
// fourth digit can submit at once (lock screen) or wait for a button (approval).
import { PIN_LENGTH } from '@vento/shared'
import { Delete } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

type Props = {
  length: number
  onDigit: (digit: string) => void
  onErase: () => void
  // Changes on every wrong PIN, to replay the shake.
  shake: number
  error?: boolean
  disabled?: boolean
  // Listen to the keyboard while the pad is on screen (one pad at a time).
  keyboard?: boolean
  onEnter?: () => void
  onEscape?: () => void
  // The bottom-left key, empty by default so a thumb aiming for 0 can't do anything else.
  corner?: ReactNode
  size?: 'lg' | 'md'
}

export function PinPad({
  length,
  onDigit,
  onErase,
  shake,
  error,
  disabled,
  keyboard = true,
  onEnter,
  onEscape,
  corner,
  size = 'lg',
}: Props) {
  // The latest handlers, so the keyboard listener is added once.
  const handlers = useRef({ onDigit, onErase, onEnter, onEscape, disabled })
  handlers.current = { onDigit, onErase, onEnter, onEscape, disabled }
  useEffect(() => {
    if (!keyboard) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const h = handlers.current
      if (/^\d$/.test(event.key)) {
        if (!h.disabled) h.onDigit(event.key)
      } else if (event.key === 'Backspace') h.onErase()
      else if (event.key === 'Enter' && h.onEnter) {
        event.preventDefault()
        h.onEnter()
      } else if (event.key === 'Escape') h.onEscape?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard])

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div key={shake} className={cn('flex gap-3', shake > 0 && 'pin-shake')} aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions, never reordered
            key={i}
            className={cn(
              'size-4 rounded-full border-2',
              i < length ? 'border-pri bg-pri' : 'border-border-strong',
              error && 'border-ro-dot',
              disabled && 'opacity-40',
            )}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {length} of {PIN_LENGTH} digits entered
      </p>
      <div
        className={cn('grid w-full grid-cols-3', size === 'lg' ? 'gap-3' : 'max-w-[236px] gap-2.5')}
      >
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <Key key={digit} size={size} onPress={() => onDigit(digit)} disabled={disabled}>
            {digit}
          </Key>
        ))}
        {corner ?? <span aria-hidden="true" />}
        <Key size={size} onPress={() => onDigit('0')} disabled={disabled}>
          0
        </Key>
        <Key size={size} ariaLabel="Delete last digit" onPress={onErase} disabled={length === 0}>
          <Delete className="size-5" aria-hidden="true" />
        </Key>
      </div>
    </div>
  )
}

function Key({
  children,
  ariaLabel,
  onPress,
  disabled,
  size,
}: {
  children: ReactNode
  ariaLabel?: string
  onPress: () => void
  disabled?: boolean | undefined
  size: 'lg' | 'md'
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onPress}
      disabled={disabled}
      className={cn(
        'num grid place-items-center rounded-md border border-border bg-surface font-medium text-text hover:bg-surface-2 active:bg-pri-soft disabled:opacity-45',
        size === 'lg' ? 'h-16 text-2xl' : 'h-14 text-xl',
      )}
    >
      {children}
    </button>
  )
}
