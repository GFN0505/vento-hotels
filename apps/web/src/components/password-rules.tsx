// Live checklist under a new-password field: each rule turns green with a tick as it's met.
import { PASSWORD_RULES } from '@vento/shared'
import { Check, Circle } from 'lucide-react'
import { cn } from '@/lib/cn'

export function PasswordRules({ password, id }: { password: string; id: string }) {
  return (
    <ul
      id={id}
      className="grid grid-cols-1 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2"
      aria-live="polite"
    >
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <li
            key={rule.id}
            className={cn('flex items-center gap-1.5', met ? 'text-em' : 'text-text-3')}
          >
            {met ? (
              <Check className="size-3.5 flex-none" strokeWidth={3} aria-hidden="true" />
            ) : (
              <Circle className="size-3.5 flex-none" aria-hidden="true" />
            )}
            <span>
              {rule.label}
              <span className="sr-only">{met ? ' (done)' : ' (still needed)'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
