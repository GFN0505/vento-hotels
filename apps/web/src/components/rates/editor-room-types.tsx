// The editor's Room types card: which of the hotel's room types the plan sells and, with its own
// prices, the standard price for each (weekday, and Fri and Sat when different). A derived plan
// can only sell room types its parent sells.
import type { RatePlanView, RatesOverview } from '@vento/shared'
import { type ReactNode, useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { EditorCard } from './editor-card'
import { priceProblem } from './first-rate-model'
import { EXCL } from './format'
import { groupTyped } from './money-input'
import type { PlanFormState } from './use-plan-form'

type Props = {
  state: PlanFormState
  roomTypes: RatesOverview['roomTypes']
  parent: RatePlanView | undefined
  readOnly: boolean
}

export function EditorRoomTypes({ state, roomTypes, parent, readOnly }: Props) {
  const { form, problems } = state
  const id = useId()
  const own = form.pricing === 'own'
  const onParent = (id: string) => !parent || parent.roomTypes.some((r) => r.roomTypeId === id)
  return (
    <EditorCard title="Room types" aside={own ? `Standard prices, ${EXCL}` : undefined}>
      {problems.roomTypes ? (
        <p role="alert" className="text-sm text-ro">
          {problems.roomTypes}
        </p>
      ) : null}
      {own ? (
        <div
          aria-hidden="true"
          className="-mb-3 hidden grid-cols-[minmax(0,1fr)_150px_130px] gap-x-4 text-xs font-medium text-text-3 @md:grid"
        >
          <span>Room type</span>
          <span>Sun–Thu</span>
          <span>Fri and Sat</span>
        </div>
      ) : null}
      <ul className="-my-1 flex flex-col divide-y divide-border" aria-label="Room types">
        {roomTypes.map((type) => {
          const row = form.rows[type.id] ?? { on: false, weekday: '', weekend: '' }
          const missing = !own && !onParent(type.id)
          return (
            <li
              key={type.id}
              className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-4 gap-y-2 py-2.5 @md:grid-cols-[minmax(0,1fr)_150px_130px]"
            >
              <label
                htmlFor={`${id}-${type.id}`}
                className="flex min-h-11 items-center gap-2.5 @md:min-h-9"
              >
                <Checkbox
                  id={`${id}-${type.id}`}
                  checked={row.on}
                  disabled={readOnly || (missing && !row.on)}
                  onChange={(event) => state.setRow(type.id, { on: event.target.checked })}
                />
                <span className="min-w-0 break-words">
                  <span className="font-medium">{type.name}</span>
                  {missing ? (
                    <span className="block text-sm text-text-3">Not on {parent?.name}</span>
                  ) : null}
                </span>
              </label>
              {own && row.on ? (
                <div className="grid grid-cols-2 gap-3 @md:contents">
                  <PriceCell caption="Sun–Thu">
                    <Field
                      label={`${type.name}, weekday price`}
                      hideLabel
                      name={`weekday-${type.id}`}
                      prefix="₦"
                      inputMode="numeric"
                      autoComplete="off"
                      className="num"
                      readOnly={readOnly}
                      value={row.weekday}
                      error={problems[`weekday-${type.id}`]}
                      validate={(v) => priceProblem(v, true)}
                      onChange={(event) => state.setRow(type.id, { weekday: event.target.value })}
                      onBlur={(event) =>
                        state.setRow(type.id, { weekday: groupTyped(event.target.value) })
                      }
                    />
                  </PriceCell>
                  <PriceCell caption="Fri and Sat">
                    <Field
                      label={`${type.name}, Friday and Saturday price`}
                      hideLabel
                      name={`weekend-${type.id}`}
                      prefix="₦"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="same"
                      className="num"
                      readOnly={readOnly}
                      value={row.weekend}
                      error={problems[`weekend-${type.id}`]}
                      validate={(v) => priceProblem(v, false)}
                      onChange={(event) => state.setRow(type.id, { weekend: event.target.value })}
                      onBlur={(event) =>
                        state.setRow(type.id, { weekend: groupTyped(event.target.value) })
                      }
                    />
                  </PriceCell>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {own ? (
        <p className="text-sm text-text-3">
          Weekday is Sunday to Thursday nights. Leave Fri and Sat blank for the same price. Seasons
          and single dates are set in the Rate calendar.
        </p>
      ) : null}
    </EditorCard>
  )
}

// On phones each price has a small caption above it; wider cards use the header row instead.
function PriceCell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span aria-hidden="true" className="text-xs font-medium text-text-3 @md:hidden">
        {caption}
      </span>
      {children}
    </div>
  )
}
