// The editor's Price card: name and code, then own prices or derived from a parent plan with an
// offset in naira or a percentage (one or the other: typing one clears the other).
import { type RatePlanView, ratePlanCodeSchema, suggestPlanCode } from '@vento/shared'
import { Field } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { SelectField } from '@/components/ui/select-field'
import { EditorCard } from './editor-card'
import { listNames } from './format'
import { groupTyped } from './money-input'
import type { PlanFormState } from './use-plan-form'

type Props = {
  state: PlanFormState
  // Plans this one can follow: active, with their own prices, not itself.
  parents: readonly RatePlanView[]
  readOnly: boolean
  // Switching from derived to own prices starts from what the plan costs tonight.
  onOwnPrices?: () => void
}

const nameProblem = (value: string) => {
  if (!value.trim()) return 'Enter a name'
  return value.trim().length > 60 ? 'Keep the name under 60 characters' : undefined
}
const codeProblem = (value: string) => {
  const result = ratePlanCodeSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message
}

export function EditorPrice({ state, parents, readOnly, onOwnPrices }: Props) {
  const { form, problems, base } = state
  const followers = base?.followers ?? []
  const parent = parents.find((p) => p.id === form.parentId)
  return (
    <EditorCard title="Price">
      <div className="grid gap-4 @md:grid-cols-[minmax(0,1fr)_160px]">
        <Field
          label="Plan name"
          name="name"
          value={form.name}
          maxLength={60}
          placeholder="e.g. Non-refundable"
          readOnly={readOnly}
          error={problems.name}
          validate={nameProblem}
          onChange={(event) => {
            const name = event.target.value
            state.set(form.codeEdited ? { name } : { name, code: suggestPlanCode(name) })
          }}
        />
        <Field
          label="Code"
          name="code"
          value={form.code}
          maxLength={10}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          hint={base ? undefined : 'For imports and reports'}
          readOnly={readOnly}
          error={problems.code}
          validate={codeProblem}
          onChange={(event) =>
            state.set({ code: event.target.value.toUpperCase(), codeEdited: true })
          }
          className="num uppercase"
        />
      </div>
      <Segmented
        label="Price"
        value={form.pricing}
        disabled={readOnly}
        hint={
          followers.length > 0 && form.pricing === 'own'
            ? `${listNames(followers.map((f) => f.name))} ${followers.length === 1 ? 'follows' : 'follow'} this plan, so it keeps its own prices.`
            : undefined
        }
        options={[
          { value: 'derived', label: 'Derived from a parent plan', disabled: followers.length > 0 },
          { value: 'own', label: 'Own prices' },
        ]}
        onChange={(pricing) => {
          if (pricing === 'own' && form.pricing === 'derived') onOwnPrices?.()
          state.set({ pricing })
        }}
      />
      {form.pricing === 'derived' ? (
        <>
          <div className="grid gap-4 @lg:grid-cols-3">
            <SelectField
              className="lg:h-9 lg:text-base"
              label="Parent plan"
              name="parentId"
              value={form.parentId}
              placeholder="Choose a plan"
              disabled={readOnly}
              error={problems.parentId}
              options={parents.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(event) => state.set({ parentId: event.target.value })}
            />
            <Field
              label="Offset"
              name="offset"
              value={form.offset}
              prefix="₦"
              suffix="per night"
              inputMode="text"
              placeholder="e.g. 18000"
              autoComplete="off"
              readOnly={readOnly}
              error={problems.offset}
              onChange={(event) => state.set({ offset: event.target.value, percent: '' })}
              onBlur={(event) => state.set({ offset: groupTyped(event.target.value) })}
              className="num"
            />
            <Field
              label="Or percentage"
              name="percent"
              value={form.percent}
              suffix="%"
              inputMode="text"
              placeholder="e.g. −10"
              autoComplete="off"
              readOnly={readOnly}
              error={problems.percent}
              onChange={(event) => state.set({ percent: event.target.value, offset: '' })}
              className="num"
            />
          </div>
          <p className="text-sm text-text-2">
            {parent
              ? `When ${parent.name} changes, this plan follows automatically, including closures.`
              : 'This plan follows its parent automatically, including closures.'}{' '}
            Use a minus for less, like −10 or −5000.
          </p>
        </>
      ) : null}
    </EditorCard>
  )
}
