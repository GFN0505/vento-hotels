// Active / Archived chips above a settings list (spec: hotels and companies lists).
import { cn } from '@/lib/cn'

export type Show = 'archived' | undefined

export function StatusChips({ show, onShow }: { show: Show; onShow: (show: Show) => void }) {
  return (
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">Show</legend>
      {(
        [
          { value: undefined, label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ] as const
      ).map((option) => {
        const active = show === option.value
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            onClick={() => onShow(option.value)}
            className={cn(
              'h-11 rounded-full border px-3 text-sm font-medium lg:h-7',
              active
                ? 'border-pri bg-pri-soft text-pri-ink'
                : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </fieldset>
  )
}
