// "Change dates · Best available" (design #8's Bulk edit; spec: Rates): pick the plan, room types,
// dates and days, then new prices or back to standard, a season name and restrictions. Says how
// many dates change and who follows before Apply.
import { addDays, type RatePlanView, type RatesOverview } from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Sheet } from '@/components/ui/sheet'
import { ChangeDatesFields } from './change-dates-fields'
import * as M from './change-dates-model'
import { listNames, plural } from './format'
import type { RateDates } from './use-rate-dates'

type Props = {
  overview: RatesOverview
  plans: readonly RatePlanView[]
  // What it opens on: a cell's plan (a derived plan opens its parent), night and room type.
  initial: {
    planId?: string | undefined
    date?: string | undefined
    typeId?: string | undefined
    // The first night in view, when no night was picked.
    from?: string | undefined
  }
  rateDates: RateDates
  onClose: () => void
}

function start(props: Props, own: readonly RatePlanView[]): M.DatesForm {
  const { initial, overview } = props
  const asked = props.plans.find((p) => p.id === initial.planId)
  const planId = (asked?.parent?.id ?? asked?.id) || overview.basePlan?.id || own[0]?.id || ''
  const plan = own.find((p) => p.id === planId)
  const onPlan = (plan?.roomTypes ?? []).map((r) => r.roomTypeId)
  const from = initial.date ?? initial.from ?? overview.property.businessDate
  return {
    planId,
    roomTypeIds: initial.typeId && onPlan.includes(initial.typeId) ? [initial.typeId] : onPlan,
    from,
    to: initial.date ?? addDays(from, 6),
    days: [0, 1, 2, 3, 4, 5, 6],
    priceMode: 'keep',
    prices: {},
    season: '',
    minStay: 'keep',
    minStayNights: '2',
    closedToArrival: 'keep',
    closed: 'keep',
  }
}

export function ChangeDatesSheet(props: Props) {
  const { overview, rateDates, onClose } = props
  const formId = useId()
  const own = props.plans.filter((p) => p.pricing === 'own' && !p.archivedAt)
  const [initial] = useState(() => start(props, own))
  const [form, setForm] = useState(initial)
  const [problems, setProblems] = useState<M.DatesProblems>({})
  const guard = useDiscardGuard(JSON.stringify(form) !== JSON.stringify(initial), onClose)
  const plan = own.find((p) => p.id === form.planId)
  const count = M.datesIn(form, overview.property.businessDate).length
  const nothing = M.nothingChosen(form)
  const followers = (plan?.followers ?? []).map((f) => f.name)
  const limits = {
    businessDate: overview.property.businessDate,
    lastRateDate: overview.property.lastRateDate,
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = M.check(form, limits)
    setProblems(found)
    if (M.hasProblems(found)) {
      // After the messages render, focus the first field with one.
      const el = event.currentTarget
      requestAnimationFrame(() => el.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    const priced = form.priceMode !== 'keep'
    rateDates.apply(
      M.toInput(form) as Parameters<RateDates['apply']>[0],
      (dates) =>
        priced ? `Prices changed for ${plural(dates, 'date')}` : `${plural(dates, 'date')} changed`,
      onClose,
    )
  }

  return (
    <Sheet
      open
      onClose={() => {
        if (!rateDates.pending) guard.close()
      }}
      title={plan ? `Change dates · ${plan.name}` : 'Change dates'}
      description="Prices are whole naira, excl. taxes and service charge."
      footer={
        guard.bar ?? (
          <>
            <p className="basis-full text-sm text-text-3 empty:hidden" id={`${formId}-why`}>
              {nothing ? 'Choose a price or a restriction to change' : null}
            </p>
            <Button className="ml-auto" onClick={guard.close} disabled={rateDates.pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              disabled={nothing || count === 0 || !plan}
              aria-describedby={nothing ? `${formId}-why` : undefined}
              loading={rateDates.pending}
            >
              Apply to {plural(count, 'date')}
            </Button>
          </>
        )
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <ChangeDatesFields
          form={form}
          problems={problems}
          plans={own}
          plan={plan}
          overview={overview}
          onChange={(change) => setForm((f) => ({ ...f, ...change }))}
        />
        <p className="rounded-md bg-surface-2 px-3 py-2.5 text-text-2" aria-live="polite">
          {count === 0
            ? 'No dates to change yet.'
            : `${plural(count, 'date')} change for ${plural(form.roomTypeIds.length, 'room type')}.`}
          {followers.length > 0 && count > 0
            ? ` ${listNames(followers)} ${followers.length === 1 ? 'follows' : 'follow'} automatically.`
            : ''}
        </p>
      </form>
    </Sheet>
  )
}
