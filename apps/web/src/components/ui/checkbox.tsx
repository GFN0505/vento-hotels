// Checkbox matching `.check` in the designs: 16px, 4px corners, violet with a white tick when on.
// A real <input type="checkbox">, so keyboard, forms and screen readers work as usual.
import { Check } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Checkbox({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <span className={cn('relative inline-grid size-4 flex-none place-items-center', className)}>
      <input
        type="checkbox"
        className={cn(
          'peer size-4 cursor-pointer appearance-none rounded-[4px] border border-input bg-surface',
          'checked:border-pri checked:bg-pri',
        )}
        {...props}
      />
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100"
      />
    </span>
  )
}
