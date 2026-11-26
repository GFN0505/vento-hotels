// "Schedule a change" and "Add a tax or charge" (design #27 TaxSchedule, with the spec's
// departures): a new rate or a stop, from a business date after today's, with the source and a
// required reason, and a live example computed by the same `taxLines` every bill uses.
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  addDays,
  TAX_CATEGORY_LABELS,
  TAXABLE_CATEGORIES,
  type TaxableCategory,
  type TaxBase,
  type TaxRuleInForce,
  type TaxSetup,
  type TaxView,
  taxLines,
} from '@vento/shared'
import { type FormEvent, type KeyboardEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { dateLabel } from '@/components/hotels/format'
import { NEEDS_CONNECTION } from '@/components/settings/offline-note'
import { Button } from '@/components/ui/button'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Field } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorData, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { naira, ratePercentProblem } from './format'

type Props = {
  setup: TaxSetup
  // Absent: add a tax or charge.
  tax?: TaxView | undefined
  onSaved: (setup: TaxSetup) => void
  onClose: () => void
}

type Problems = Partial<
  Record<'rate' | 'categories' | 'startsOn' | 'source' | 'reason' | 'name' | 'form', string>
>

const text = (min: number, message: string) => (value: string) =>
  value.trim().length < min ? message : undefined
const sourceProblem = text(3, 'Name the act, law or decision, and the section')
const reasonProblem = text(3, 'Give a reason of at least 3 characters')

export function ScheduleSheet({ setup, tax, onSaved, onClose }: Props) {
  const formId = useId()
  const online = useOnline()
  const { property } = setup
  const hasServiceCharge = setup.taxes.some((t) => t.kind === 'service_charge')
  const current = tax?.rates.find((r) => r.status === 'current')
  const [kind, setKind] = useState<'state_tax' | 'service_charge'>(
    hasServiceCharge ? 'state_tax' : 'service_charge',
  )
  const isServiceCharge = tax ? tax.kind === 'service_charge' : kind === 'service_charge'
  const earliest = tax?.earliestStart ?? addDays(property.businessDate, 1)
  const [stop, setStop] = useState(false)
  const [rate, setRate] = useState('')
  const [name, setName] = useState('')
  const [paidTo, setPaidTo] = useState('')
  const [categories, setCategories] = useState<TaxableCategory[]>(
    current?.categories ?? ['accommodation', 'food', 'beverage', 'events'],
  )
  const [base, setBase] = useState<TaxBase>(current?.base ?? 'net')
  const [startsOn, setStartsOn] = useState(earliest)
  const [source, setSource] = useState('')
  const [reason, setReason] = useState('')
  const [problems, setProblems] = useState<Problems>({})
  const dirty = Boolean(rate || name || source || reason || stop)
  const guard = useDiscardGuard(dirty, onClose)
  const inForce = useQuery(orpc.taxes.inForce.queryOptions({ input: { propertyId: property.id } }))

  const save = useMutation({
    mutationFn: () => {
      const common = {
        propertyId: property.id,
        startsOn,
        source: source.trim(),
        reason: reason.trim(),
      }
      if (tax) {
        return api.taxes.schedule(
          stop
            ? { ...common, taxId: tax.id, version: tax.version, stop: true }
            : {
                ...common,
                taxId: tax.id,
                version: tax.version,
                stop: false,
                ratePercent: rate.trim(),
                categories,
                base,
              },
        )
      }
      return api.taxes.create({
        ...common,
        kind,
        name: isServiceCharge ? 'Service charge' : name.trim(),
        paidTo: isServiceCharge ? undefined : paidTo.trim(),
        ratePercent: rate.trim(),
        categories,
        base,
      })
    },
    onSuccess: (next) => {
      onSaved(next)
      toast.success(
        tax
          ? `${tax.name} change scheduled for ${dateLabel(startsOn)}`
          : `${isServiceCharge ? 'Service charge' : name.trim()} added`,
      )
      onClose()
    },
    onError: (error) => {
      const field = errorData(error).field
      const key = field === 'startsOn' || field === 'reason' || field === 'name' ? field : 'form'
      setProblems({ [key]: problemMessage(error) })
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {}
    if (!stop) {
      const rateIssue = ratePercentProblem(rate)
      if (rateIssue) found.rate = rateIssue
      if (categories.length === 0) found.categories = 'Pick at least one kind of charge.'
    }
    if (!tax && !isServiceCharge && name.trim().length < 2) found.name = 'Name the tax'
    if (startsOn < earliest)
      found.startsOn = `Changes start after the business date. The earliest is ${dateLabel(earliest)}.`
    const sourceIssue = sourceProblem(source)
    if (sourceIssue) found.source = sourceIssue
    const reasonIssue = reasonProblem(reason)
    if (reasonIssue) found.reason = reasonIssue
    setProblems(found)
    if (Object.keys(found).length > 0) {
      event.currentTarget
        .querySelector<HTMLElement>('[aria-invalid="true"], [data-problem]')
        ?.focus()
      return
    }
    save.mutate()
  }

  // ⌘↵ / Ctrl+Enter saves, as the button says.
  function shortcut(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
      event.currentTarget.requestSubmit()
  }

  const example = exampleLine({
    tax,
    rules: inForce.data?.rules ?? [],
    rate,
    stop,
    categories,
    base,
  })
  const title = tax ? `Schedule a change · ${tax.name}` : 'Add a tax or charge'

  return (
    <Sheet
      open
      onClose={() => (save.isPending ? undefined : guard.close())}
      title={title}
      description={
        tax
          ? `${tax.scope}. Charges from the start date use the new rate, including stays already booked.`
          : `For ${property.name}. Recorded with your name.`
      }
      footer={
        guard.bar ?? (
          <>
            <span className="grow" />
            {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
            <Button onClick={guard.close} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              disabled={!online}
              loading={save.isPending}
            >
              {tax ? 'Schedule change' : 'Add'}
              <kbd className="ml-1 hidden font-sans text-xs opacity-75 lg:inline">⌘↵</kbd>
            </Button>
          </>
        )
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        onKeyDown={shortcut}
        noValidate
        className="flex flex-col gap-5"
      >
        {problems.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problems.form}
          </p>
        ) : null}
        {tax ? null : (
          <Choice
            legend="What to add"
            value={kind}
            onChange={(value) => setKind(value as typeof kind)}
            options={[
              { value: 'state_tax', label: `A ${property.stateName ?? 'state'} tax or levy` },
              ...(hasServiceCharge ? [] : [{ value: 'service_charge', label: 'A service charge' }]),
            ]}
          />
        )}
        {!tax && !isServiceCharge ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              name="name"
              value={name}
              maxLength={80}
              placeholder={`e.g. ${property.stateName ?? 'State'} consumption tax`}
              error={problems.name}
              onChange={(event) => setName(event.target.value)}
              className="max-lg:h-11"
              data-autofocus
            />
            <Field
              label="Paid to"
              name="paidTo"
              value={paidTo}
              maxLength={80}
              placeholder="e.g. the state's revenue service"
              onChange={(event) => setPaidTo(event.target.value)}
              className="max-lg:h-11"
            />
          </div>
        ) : null}
        {tax ? (
          <Choice
            legend="Change"
            value={stop ? 'stop' : 'rate'}
            onChange={(value) => setStop(value === 'stop')}
            options={[
              { value: 'rate', label: 'New rate' },
              { value: 'stop', label: 'Stop charging it' },
            ]}
          />
        ) : null}
        {stop ? null : (
          <>
            <Field
              label={tax ? 'New rate' : 'Rate'}
              name="rate"
              value={rate}
              inputMode="decimal"
              maxLength={6}
              placeholder={current?.ratePercent ?? '10'}
              hint="Per cent, up to 2 decimals"
              error={problems.rate}
              validate={ratePercentProblem}
              onChange={(event) => setRate(event.target.value)}
              className="num max-lg:h-11"
              data-autofocus={tax ? true : undefined}
            />
            <fieldset
              className="flex flex-col gap-2"
              data-problem={problems.categories ? true : undefined}
              tabIndex={-1}
            >
              <legend className="mb-1 text-sm font-medium text-text-2">Applies to</legend>
              <div className="flex flex-wrap gap-1.5">
                {TAXABLE_CATEGORIES.map((category) => {
                  const on = categories.includes(category)
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setCategories((list) =>
                          on ? list.filter((c) => c !== category) : [...list, category],
                        )
                      }
                      className={cn(
                        'h-11 rounded-full border px-3 text-sm font-medium lg:h-8',
                        on
                          ? 'border-pri bg-pri-soft text-pri-ink'
                          : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2',
                      )}
                    >
                      {TAX_CATEGORY_LABELS[category]}
                    </button>
                  )
                })}
              </div>
              {problems.categories ? (
                <p role="alert" className="text-sm text-ro">
                  {problems.categories}
                </p>
              ) : null}
            </fieldset>
            {isServiceCharge ? null : (
              <Choice
                legend="Calculated on"
                value={base}
                onChange={(value) => setBase(value as TaxBase)}
                options={[
                  { value: 'net', label: 'The charge' },
                  { value: 'net_plus_service_charge', label: 'The charge plus service charge' },
                ]}
              />
            )}
          </>
        )}
        <Field
          label="Starts on"
          name="startsOn"
          type="date"
          value={startsOn}
          min={earliest}
          hint={`The earliest is ${dateLabel(earliest)}${tax?.latestHotel ? ` (${tax.latestHotel}'s business date)` : ''}. Charges from then use the new rate, including stays already booked.`}
          error={problems.startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
          className="num max-lg:h-11"
        />
        <Field
          label="Source"
          name="source"
          value={source}
          maxLength={300}
          hint={
            isServiceCharge
              ? 'The decision, e.g. board meeting, 20 Oct 2026'
              : 'Act, law or circular and section, e.g. Nigeria Tax Act 2025, s. …'
          }
          error={problems.source}
          validate={sourceProblem}
          onChange={(event) => setSource(event.target.value)}
          className="max-lg:h-11"
        />
        <Field
          label="Reason"
          name="reason"
          value={reason}
          maxLength={500}
          hint="Recorded with your name. This shows in the owner's daily report."
          error={problems.reason}
          validate={reasonProblem}
          onChange={(event) => setReason(event.target.value)}
          className="max-lg:h-11"
        />
        {example ? (
          <p
            className="num rounded-md bg-surface-2 px-3 py-2.5 text-sm text-text-2"
            aria-live="polite"
          >
            {example}
          </p>
        ) : null}
      </form>
    </Sheet>
  )
}

function Choice({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-text-2">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-2 lg:min-h-0">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="size-4 accent-pri"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// "Example: ₦150,000.00 room → service charge ₦18,750.00 instead of ₦15,000.00."
function exampleLine(input: {
  tax: TaxView | undefined
  rules: readonly TaxRuleInForce[]
  rate: string
  stop: boolean
  categories: TaxableCategory[]
  base: TaxBase
}): string | null {
  const { tax, rules, stop } = input
  if (!stop && ratePercentProblem(input.rate)) return null
  const category: TaxableCategory = input.categories.includes('accommodation')
    ? 'accommodation'
    : (input.categories[0] ?? 'accommodation')
  const amount = category === 'accommodation' ? '150000' : '10000'
  const word = category === 'accommodation' ? 'room' : TAX_CATEGORY_LABELS[category].toLowerCase()
  const taxId = tax?.id ?? 'new'
  const others = rules.filter((rule) => rule.taxId !== taxId)
  const lineFor = (list: readonly TaxRuleInForce[]) =>
    taxLines({ amount, currency: 'NGN', pricing: 'exclusive', category, rules: list }).lines.find(
      (line) => line.taxId === taxId,
    )?.amount
  const before = lineFor(rules)
  const after = stop
    ? undefined
    : lineFor([
        ...others,
        {
          taxId,
          rateId: taxId,
          kind: tax?.kind ?? 'state_tax',
          name: tax?.name ?? 'new tax',
          ratePercent: input.rate.trim(),
          categories: input.categories,
          base: input.base,
        },
      ])
  const what = tax?.kind === 'service_charge' ? 'service charge' : (tax?.name ?? 'the new tax')
  const now = after ? `${what} ${naira(after)}` : `no ${what}`
  return `Example: ${naira(amount)} ${word} → ${now}${before ? ` instead of ${naira(before)}` : ''}.`
}
