// The editor's "What's included and rules" card: meal plan with its allocation, cancellation
// policy, deposit rule, min stay and the extra adult charge (own prices only).
import { MEAL_PLANS } from '@vento/shared'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { EditorCard } from './editor-card'
import { MEAL_PLAN_LABELS } from './format'
import { groupTyped } from './money-input'
import type { PlanFormState } from './use-plan-form'

type Props = { state: PlanFormState; readOnly: boolean }

const MEALS = MEAL_PLANS.map((value) => ({ value, label: MEAL_PLAN_LABELS[value] }))

export function EditorTerms({ state, readOnly }: Props) {
  const { form, problems } = state
  const free = form.cancelKind === 'free_until'
  const deposit = form.depositKind !== 'none'
  return (
    <EditorCard title="What's included and rules">
      <div className="grid gap-4 @md:grid-cols-2">
        <SelectField
          className="lg:h-9 lg:text-base"
          label="Meal plan"
          value={form.mealPlan}
          disabled={readOnly}
          options={MEALS}
          onChange={(event) => state.set({ mealPlan: event.target.value as typeof form.mealPlan })}
        />
        {form.mealPlan === 'room_only' ? null : (
          <Field
            label="Meal allocation"
            name="mealAllocation"
            prefix="₦"
            suffix="per night"
            inputMode="numeric"
            autoComplete="off"
            className="num"
            placeholder={
              form.pricing === 'derived' && form.offset ? 'Same as the offset' : 'e.g. 18000'
            }
            hint="The part of the price that is food revenue, per room per night"
            readOnly={readOnly}
            value={form.mealAllocation}
            error={problems.mealAllocation}
            onChange={(event) => state.set({ mealAllocation: event.target.value })}
            onBlur={(event) => state.set({ mealAllocation: groupTyped(event.target.value) })}
          />
        )}
      </div>
      <div className="grid items-start gap-4 @md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
        <SelectField
          className="lg:h-9 lg:text-base"
          label="Cancellation policy"
          value={form.cancelKind}
          disabled={readOnly}
          options={[
            { value: 'free_until', label: 'Free until a set time' },
            { value: 'non_refundable', label: 'Non-refundable' },
          ]}
          onChange={(event) =>
            state.set({ cancelKind: event.target.value as typeof form.cancelKind })
          }
        />
        {free ? (
          <>
            <Field
              label="Hours before arrival"
              name="cancelHours"
              inputMode="numeric"
              className="num"
              readOnly={readOnly}
              value={form.cancelHours}
              error={problems.cancelHours}
              onChange={(event) => state.set({ cancelHours: event.target.value })}
            />
            <SelectField
              className="lg:h-9 lg:text-base"
              label="Then charge"
              value={form.penalty}
              disabled={readOnly}
              options={[
                { value: 'first_night', label: 'The first night' },
                { value: 'percent_of_stay', label: 'A % of the stay' },
                { value: 'full_stay', label: 'The full stay' },
              ]}
              onChange={(event) =>
                state.set({ penalty: event.target.value as typeof form.penalty })
              }
            />
          </>
        ) : null}
      </div>
      {free && form.penalty === 'percent_of_stay' ? (
        <Field
          label="Share of the stay charged"
          name="penaltyPercent"
          suffix="%"
          inputMode="decimal"
          className="num @md:max-w-48"
          readOnly={readOnly}
          value={form.penaltyPercent}
          error={problems.penaltyPercent}
          onChange={(event) => state.set({ penaltyPercent: event.target.value })}
        />
      ) : null}
      <p className="-mt-2 text-sm text-text-3">
        Counted back from check-in time on the arrival day. A no-show pays the same as a late
        cancellation.
      </p>
      <div className="grid items-start gap-4 @md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px]">
        <SelectField
          className="lg:h-9 lg:text-base"
          label="Deposit rule"
          value={form.depositKind}
          disabled={readOnly}
          options={[
            { value: 'none', label: 'No deposit' },
            { value: 'first_night', label: 'First night' },
            { value: 'percent_of_stay', label: 'A % of the stay' },
            { value: 'full_stay', label: 'Full stay' },
          ]}
          onChange={(event) =>
            state.set({ depositKind: event.target.value as typeof form.depositKind })
          }
        />
        {deposit ? (
          <SelectField
            className="lg:h-9 lg:text-base"
            label="Due"
            value={form.dueKind}
            disabled={readOnly}
            options={[
              { value: 'at_booking', label: 'At booking' },
              { value: 'within_hours', label: 'Within a set time' },
            ]}
            onChange={(event) => state.set({ dueKind: event.target.value as typeof form.dueKind })}
          />
        ) : null}
        {deposit && form.dueKind === 'within_hours' ? (
          <Field
            label="Hours after booking"
            name="dueHours"
            inputMode="numeric"
            className="num"
            readOnly={readOnly}
            value={form.dueHours}
            error={problems.dueHours}
            onChange={(event) => state.set({ dueHours: event.target.value })}
          />
        ) : null}
      </div>
      {deposit && form.depositKind === 'percent_of_stay' ? (
        <Field
          label="Share of the stay as deposit"
          name="depositPercent"
          suffix="%"
          inputMode="decimal"
          className="num @md:max-w-48"
          readOnly={readOnly}
          value={form.depositPercent}
          error={problems.depositPercent}
          onChange={(event) => state.set({ depositPercent: event.target.value })}
        />
      ) : null}
      <div className="grid items-start gap-4 @md:grid-cols-2">
        <Field
          label="Min stay"
          name="minStay"
          suffix="nights"
          inputMode="numeric"
          className="num"
          hint="Dates in the Rate calendar can ask for more, never less"
          readOnly={readOnly}
          value={form.minStay}
          error={problems.minStay}
          onChange={(event) => state.set({ minStay: event.target.value })}
        />
        {form.pricing === 'own' ? (
          <Field
            label="Extra adult, per night (optional)"
            name="extraAdult"
            prefix="₦"
            inputMode="numeric"
            autoComplete="off"
            className="num"
            hint="For each adult above the room's base occupancy"
            readOnly={readOnly}
            value={form.extraAdult}
            error={problems.extraAdult}
            onChange={(event) => state.set({ extraAdult: event.target.value })}
            onBlur={(event) => state.set({ extraAdult: groupTyped(event.target.value) })}
          />
        ) : (
          <p className="self-center text-sm text-text-3">
            Extra adults pay the parent plan's charge.
          </p>
        )}
      </div>
    </EditorCard>
  )
}
