// The empty Rate plans page (design #19, OnbRate): one weekday price per room type, an optional Fri
// and Sat price, and "Also create a Bed & breakfast plan at +₦18,000". One click after typing creates
// Best available (and Bed & breakfast) with the recommended terms.
import { useMutation } from '@tanstack/react-query'
import { BREAKFAST_SUPPLEMENT, type RatesOverview } from '@vento/shared'
import { Check } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { useOnline } from '@/offline/connection'
import * as M from './first-rate-model'
import { EXCL, formatNaira, NEEDS_CONNECTION, plural } from './format'
import { useRatesRefresh } from './queries'

export function FirstRate({ overview }: { overview: RatesOverview }) {
  const online = useOnline()
  const refresh = useRatesRefresh()
  const types = overview.roomTypes
  const [rows, setRows] = useState<M.FirstRateRows>({})
  const [breakfast, setBreakfast] = useState(true)
  const [problems, setProblems] = useState<Record<string, string | undefined>>({})
  const set = (id: string, change: Partial<M.FirstRateRow>) =>
    setRows((all) => ({ ...all, [id]: { weekday: '', weekend: '', ...all[id], ...change } }))

  const create = useMutation({
    mutationFn: (prices: M.FirstRatePrice[]) =>
      api.ratePlans.createFirst({
        propertyId: overview.property.id,
        prices,
        withBreakfast: breakfast,
      }),
    onSuccess: async (result) => {
      await refresh()
      const names = result.plans.map((plan) => plan.name)
      toast.success(`${names.join(' and ')} created`)
    },
    onError: (error) => setProblems({ form: problemMessage(error) }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = M.checkFirstRate(
      types.map((t) => t.id),
      rows,
    )
    setProblems(result.problems)
    if (!result.prices) return focusFirstProblem(event.currentTarget, result.order, result.problems)
    create.mutate(result.prices)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Your first rate"
        description="One price per room type. Add plans, seasons and conditions whenever you're ready."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {problems.form ? (
            <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
              {problems.form}
            </p>
          ) : null}
          <Card className="overflow-hidden">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2/50 text-xs font-medium text-text-3">
                  <th scope="col" className="px-4 py-2 sm:px-5">
                    Room type
                  </th>
                  <th scope="col" className="w-16 px-3 py-2 text-right max-sm:hidden">
                    Rooms
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Weekday price, excl. taxes
                  </th>
                  <th scope="col" className="w-[34%] px-3 py-2 pr-4 sm:w-40 sm:pr-5">
                    Fri and Sat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {types.map((type) => (
                  <tr key={type.id} className="align-top">
                    <th scope="row" className="px-4 py-3 text-left font-medium sm:px-5">
                      <span className="block pt-2 break-words">{type.name}</span>
                      <span className="num text-sm font-normal text-text-3 sm:hidden">
                        {plural(type.roomCount, 'room')}
                      </span>
                    </th>
                    <td className="num px-3 py-3 pt-5 text-right text-text-2 max-sm:hidden">
                      {type.roomCount}
                    </td>
                    <td className="px-3 py-3">
                      <Field
                        label={`${type.name}, weekday price`}
                        hideLabel
                        name={M.weekdayName(type.id)}
                        prefix="₦"
                        inputMode="numeric"
                        autoComplete="off"
                        className="num"
                        value={rows[type.id]?.weekday ?? ''}
                        error={problems[M.weekdayName(type.id)]}
                        validate={(v) => M.priceProblem(v, true)}
                        onChange={(event) => set(type.id, { weekday: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3 pr-4 sm:pr-5">
                      <Field
                        label={`${type.name}, Friday and Saturday price`}
                        hideLabel
                        name={M.weekendName(type.id)}
                        prefix="₦"
                        placeholder="same"
                        inputMode="numeric"
                        autoComplete="off"
                        className="num"
                        value={rows[type.id]?.weekend ?? ''}
                        error={problems[M.weekendName(type.id)]}
                        validate={(v) => M.priceProblem(v, false)}
                        onChange={(event) => set(type.id, { weekend: event.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <label htmlFor="first-rate-breakfast" className="flex min-h-11 items-center gap-2.5">
            <Checkbox
              id="first-rate-breakfast"
              checked={breakfast}
              onChange={(e) => setBreakfast(e.target.checked)}
            />
            Also create a Bed &amp; breakfast plan at +{formatNaira(BREAKFAST_SUPPLEMENT)}
          </label>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="max-sm:w-full max-lg:h-11"
              disabled={!online}
              loading={create.isPending}
            >
              Create Best available
            </Button>
          </div>
        </form>
        <Defaults breakfast={breakfast} />
      </div>
    </div>
  )
}

// What the new plans come with, so nobody has to guess (the recommended terms, spec OQ 9 and 10).
function Defaults({ breakfast }: { breakfast: boolean }) {
  const lines = [
    'Room only',
    'Free cancellation until 48 hours before arrival, then the first night',
    'Deposit: first night, within 48 hours of booking',
    `Prices ${EXCL}`,
  ]
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-md font-semibold">Best available comes with</h2>
      <ul className="flex flex-col gap-2 text-text-2">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <Check className="mt-0.5 size-4 flex-none text-em" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>
      <p className="text-sm text-text-3">
        {breakfast
          ? `Bed & breakfast follows it at +${formatNaira(BREAKFAST_SUPPLEMENT)} a night, all of it breakfast. `
          : ''}
        Change any of this later in the plan.
      </p>
    </Card>
  )
}
