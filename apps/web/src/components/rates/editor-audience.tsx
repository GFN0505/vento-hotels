// "Who can book it" and, behind More options, whether the prices include taxes and service charge
// (on by default, decision 0032: every price is labelled "incl. taxes and service charge"). More
// options opens by itself on a plan priced before taxes, so the exception is never hidden.
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/cn'
import { EditorCard } from './editor-card'
import type { PlanFormState } from './use-plan-form'

export function EditorAudience({ state, readOnly }: { state: PlanFormState; readOnly: boolean }) {
  const { form } = state
  const [more, setMore] = useState(!form.pricesIncludeTaxes)
  const id = useId()
  return (
    <EditorCard title="Who can book it">
      <Segmented
        label="Who can book it"
        hideLabel
        value={form.bookableBy}
        disabled={readOnly}
        hint={
          form.bookableBy === 'corporate_only'
            ? 'Offered only to linked corporate accounts. Linking accounts comes with corporate rates.'
            : 'Offered on every new booking.'
        }
        options={[
          { value: 'anyone', label: 'Anyone' },
          { value: 'corporate_only', label: 'Corporate accounts only' },
        ]}
        onChange={(bookableBy) => state.set({ bookableBy })}
      />
      <div className="border-t border-border pt-3">
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-text-2 hover:text-text lg:min-h-8"
        >
          <ChevronDown
            className={cn('size-4 transition-transform', more && 'rotate-180')}
            aria-hidden="true"
          />
          More options
        </button>
        {more ? (
          <label htmlFor={`${id}-taxes`} className="mt-2 flex items-start gap-2.5">
            <Checkbox
              id={`${id}-taxes`}
              className="mt-0.5"
              checked={form.pricesIncludeTaxes}
              disabled={readOnly}
              onChange={(event) => state.set({ pricesIncludeTaxes: event.target.checked })}
            />
            <span>
              Prices include taxes and service charge
              <span className="block text-sm text-text-3">
                On: the price is what the guest pays, with VAT, consumption tax and service charge
                inside it. Off: they're added on top.
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </EditorCard>
  )
}
