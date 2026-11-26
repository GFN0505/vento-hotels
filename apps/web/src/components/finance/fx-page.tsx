// Settings › FX rates (spec: "FX rates"; pattern from the FX rate field in DSComponents): a
// group-wide page, the same whichever hotel is selected. The GM or finance types the day's CBN rates
// each morning; a rate far from the last one asks to check it, and replacing one asks why.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FX_CURRENCIES,
  FX_CURRENCY_LABELS,
  FX_SYMBOLS,
  type FxCurrency,
  type FxSummary,
  formatFxRate,
  fxRateValueSchema,
} from '@vento/shared'
import { ExternalLink } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { dateLabel } from '@/components/hotels/format'
import { RowsSkeleton } from '@/components/settings/load-states'
import { NEEDS_CONNECTION, SettingsOffline } from '@/components/settings/offline-note'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { api, orpc } from '@/lib/api'
import { errorCode, errorData, problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { useOnline } from '@/offline/connection'
import { FxHistory } from './fx-history'
import { FxTrend } from './fx-trend'
import { FinanceLoadError } from './load-error'

// The CBN publishes its official rates here; Vento doesn't fetch them yet (decision 4).
const CBN_RATES = 'https://www.cbn.gov.ng/rates/ExchRateByCurrency.html'

export function FxRatesPage() {
  useScopedTitle('FX rates')
  const me = useMe()
  const summary = useQuery({
    ...orpc.fxRates.summary.queryOptions(),
    enabled: me.can('finance.setup') || me.can('rooms.setup') || me.can('fx.enter'),
  })
  if (me.isPending) return <RowsSkeleton rows={4} label="Loading FX rates" />
  if (!(me.can('finance.setup') || me.can('rooms.setup') || me.can('fx.enter'))) {
    return <NoAccess what="FX rates" ask="Only a GM, finance or the owner can enter FX rates." />
  }
  const group = me.data?.organization.name ?? ''
  return (
    <div className="flex flex-col gap-5">
      <SettingsOffline note="FX rates are read-only offline." />
      <PageHeader
        scope="group-wide"
        title="FX rates"
        description={`${group} · same for every hotel · ₦ per unit, CBN official rate`}
      />
      {summary.isPending ? (
        <Card>
          <RowsSkeleton rows={4} label="Loading FX rates" />
        </Card>
      ) : summary.isError && !summary.data ? (
        <FinanceLoadError
          title="Couldn't load FX rates"
          body="Nothing changed. Payments keep using the latest saved rates."
          onRetry={() => summary.refetch()}
          retrying={summary.isFetching}
        />
      ) : (
        <>
          {summary.data.canEnter ? <EntryCard summary={summary.data} /> : null}
          <div className="grid gap-4 md:grid-cols-3">
            {summary.data.currencies.map((entry) => (
              <CurrencyCard key={entry.currency} entry={entry} />
            ))}
          </div>
          <FxHistory />
        </>
      )}
    </div>
  )
}

function CurrencyCard({ entry }: { entry: FxSummary['currencies'][number] }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-sm font-medium text-text-2">{FX_CURRENCY_LABELS[entry.currency]}</p>
      {entry.latest ? (
        <>
          <p className="num text-[22px] leading-tight font-semibold">
            ₦{formatFxRate(entry.latest.rate)}
            <span className="ml-1 text-sm font-normal text-text-3">
              per {FX_SYMBOLS[entry.currency]}1
            </span>
          </p>
          <p className="text-sm text-text-2">
            {dateLabel(entry.latest.rateDate)} · {entry.latest.enteredByName}
          </p>
        </>
      ) : (
        <p className="text-text-2">No rate yet.</p>
      )}
      <FxTrend currency={entry.currency} points={entry.recent} />
    </Card>
  )
}

function EntryCard({ summary }: { summary: FxSummary }) {
  const formId = useId()
  const online = useOnline()
  const client = useQueryClient()
  const [rateDate, setRateDate] = useState(summary.today)
  const [values, setValues] = useState<Record<FxCurrency, string>>({ USD: '', GBP: '', EUR: '' })
  const [problems, setProblems] = useState<
    Partial<Record<FxCurrency | 'form' | 'rateDate', string>>
  >({})
  const [check, setCheck] = useState<string>()
  const [replace, setReplace] = useState<string>()
  // The rates the person said were right with "Save anyway"; only those exact values skip the check.
  const [confirmed, setConfirmed] = useState<{ currency: FxCurrency; rate: string }[]>([])
  // Any edit means the figures on screen are no longer the ones checked or confirmed.
  const edited = () => {
    setCheck(undefined)
    setReplace(undefined)
    setConfirmed([])
  }

  const entries = () =>
    FX_CURRENCIES.filter((c) => values[c].trim()).map((currency) => ({
      currency,
      rate: values[currency],
    }))
  const save = useMutation({
    mutationFn: (options: {
      confirmed: { currency: FxCurrency; rate: string }[]
      replaceReason?: string
    }) => api.fxRates.enter({ rateDate, rates: entries(), ...options }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: orpc.fxRates.key() }),
        client.invalidateQueries({ queryKey: orpc.paymentMethods.key() }),
      ])
      toast.success(`FX rates for ${dateLabel(rateDate)} saved`)
      setValues({ USD: '', GBP: '', EUR: '' })
      edited()
    },
    onError: (error) => {
      const code = errorCode(error)
      if (code === 'FX_RATE_CHECK') setCheck(problemMessage(error))
      else if (code === 'FX_RATE_EXISTS') setReplace(problemMessage(error))
      else if (errorData(error).field === 'rateDate')
        setProblems({ rateDate: problemMessage(error) })
      else setProblems({ form: problemMessage(error) })
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: typeof problems = {}
    for (const currency of FX_CURRENCIES) {
      const value = values[currency].trim()
      if (value && !fxRateValueSchema.safeParse(value).success) {
        found[currency] = 'Enter the naira rate, like 1620 or 1620.50'
      }
    }
    if (entries().length === 0) found.form = 'Enter at least one rate'
    if (rateDate > summary.today) found.rateDate = "Rates can't be entered for future dates."
    setProblems(found)
    setCheck(undefined)
    if (Object.keys(found).length === 0) save.mutate({ confirmed })
  }

  return (
    <Card className="p-4 sm:p-5">
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Rates for {dateLabel(rateDate)}</h2>
          <a
            href={CBN_RATES}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-pri-ink hover:underline lg:min-h-0"
          >
            Open the CBN rates page
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
        {problems.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problems.form}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Rate date"
            name="rateDate"
            type="date"
            value={rateDate}
            max={summary.today}
            hint="Today, or an earlier day you missed"
            error={problems.rateDate}
            onChange={(event) => {
              edited()
              setRateDate(event.target.value || summary.today)
            }}
            className="num max-lg:h-11"
          />
          {FX_CURRENCIES.map((currency, index) => (
            <Field
              key={currency}
              label={FX_CURRENCY_LABELS[currency]}
              name={currency}
              value={values[currency]}
              inputMode="decimal"
              maxLength={16}
              hint={`₦ per ${FX_SYMBOLS[currency]}1`}
              error={problems[currency]}
              onChange={(event) => {
                edited()
                setValues((v) => ({ ...v, [currency]: event.target.value }))
              }}
              className="num max-lg:h-11"
              data-autofocus={index === 0 ? true : undefined}
            />
          ))}
        </div>
        {check ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-sm bg-am-bg px-3 py-2 text-am"
          >
            <p className="grow">{check}</p>
            <Button
              size="sm"
              className="max-lg:h-11"
              loading={save.isPending}
              onClick={() => {
                const now = entries()
                setConfirmed(now)
                save.mutate({ confirmed: now })
              }}
            >
              Save anyway
            </Button>
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-3">
          {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="max-lg:h-11"
            disabled={!online}
            loading={save.isPending && !check}
          >
            Save rates
          </Button>
        </div>
      </form>
      <ReasonDialog
        open={replace !== undefined}
        title="Replace rate"
        description={replace}
        label="Reason"
        confirmLabel="Replace rate"
        pending={save.isPending}
        onConfirm={(reason) => save.mutate({ confirmed, replaceReason: reason })}
        onClose={() => setReplace(undefined)}
      />
    </Card>
  )
}
