// Appearance: Light, Dark or System, as a three-way switch (a radio group, so arrow keys move
// between the options and screen readers announce the choice).
import { Monitor, Moon, Sun } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '@/lib/cn'
import { readTheme, setTheme, type ThemeChoice } from '@/lib/theme'

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme)
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-2 px-3 py-2">
      <legend className="mb-2 text-sm text-text-2">Appearance</legend>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-2 p-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              'relative flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-sm text-sm font-medium text-text-2 transition-colors lg:h-8',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
              choice === value && 'bg-surface text-text shadow-card',
            )}
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={choice === value}
              onChange={() => {
                setChoice(value)
                setTheme(value)
              }}
              // Covers the whole option, so the tap target is the full button.
              className="absolute inset-0 cursor-pointer appearance-none rounded-sm"
            />
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
