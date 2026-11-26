// Payment methods (spec: "Payment methods"): a fixed list, each on or off, reversible at once with
// Undo. Cash takes naira plus any foreign currency ticked under Edit.
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  FX_CURRENCIES,
  FX_CURRENCY_LABELS,
  type FxCurrency,
  PAYMENT_METHOD_INFO,
  type PaymentMethod,
  type PaymentSetup,
} from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { NEEDS_CONNECTION } from '@/components/settings/offline-note'
import { TD, TH } from '@/components/settings/table-styles'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/ui/status-badge'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'

type Props = { setup: PaymentSetup; canWrite: boolean; onSaved: (setup: PaymentSetup) => void }

export function MethodsCard({ setup, canWrite, onSaved }: Props) {
  const [editingCash, setEditingCash] = useState(false)
  const propertyId = setup.property.id
  const set = useMutation({
    mutationFn: (input: {
      method: PaymentMethod
      enabled: boolean
      foreignCurrencies?: FxCurrency[]
    }) => api.paymentMethods.set({ propertyId, ...input }),
    onError: (error) => toast.error(problemMessage(error)),
  })

  function toggle(method: PaymentMethod, enabled: boolean) {
    set.mutate(
      { method, enabled },
      {
        onSuccess: (next) => {
          onSaved(next)
          const label = PAYMENT_METHOD_INFO[method].label
          toast.success(`${label} ${enabled ? 'on' : 'off'}`, {
            action: {
              label: 'Undo',
              onClick: () => set.mutate({ method, enabled: !enabled }, { onSuccess: onSaved }),
            },
          })
        },
      },
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3.5 sm:px-5">
        <h2 className="font-semibold">Payment methods</h2>
      </div>
      <table className="w-full border-separate border-spacing-0 text-left max-md:block">
        <thead className="max-md:sr-only">
          <tr>
            <th scope="col" className={cn(TH, 'pl-5')}>
              Method
            </th>
            <th scope="col" className={TH}>
              Currencies
            </th>
            <th scope="col" className={TH}>
              Reference taken
            </th>
            <th scope="col" className={cn(TH, 'pr-5 text-right')}>
              On
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block max-md:divide-y max-md:divide-border">
          {setup.methods.map((row) => {
            const info = PAYMENT_METHOD_INFO[row.method]
            return (
              <tr
                key={row.method}
                className="max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-4 max-md:gap-y-1.5 max-md:px-4 max-md:py-3 md:[&>td]:border-b md:[&>td]:border-border md:last:[&>td]:border-0"
              >
                <td className={cn(TD, 'pl-5 font-medium max-md:grow')}>
                  {info.label}
                  {row.warnings.map((warning) => (
                    <span key={warning} className="mt-1 block font-normal">
                      <StatusBadge tone="amber" className="whitespace-normal">
                        {warning}
                      </StatusBadge>
                      {warning.includes('FX rates') ? (
                        <Link
                          to="/settings/fx-rates"
                          className="ml-2 text-sm text-pri-ink hover:underline"
                        >
                          FX rates
                        </Link>
                      ) : null}
                    </span>
                  ))}
                </td>
                <td className={cn(TD, 'num text-text-2')}>
                  {info.comingLater ? (
                    <span className="text-text-3">{info.comingLater}</span>
                  ) : (
                    row.currencies.join(' · ')
                  )}
                  {row.method === 'cash' && setup.canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 max-lg:h-11"
                      disabled={!canWrite}
                      onClick={() => setEditingCash(true)}
                    >
                      Edit
                    </Button>
                  ) : null}
                </td>
                <td className={cn(TD, 'text-text-2 max-md:basis-full')}>{info.reference}</td>
                <td className={cn(TD, 'pr-5 text-right')}>
                  <Switch
                    label={`${info.label} on`}
                    checked={row.enabled}
                    disabled={!canWrite || Boolean(info.comingLater) || set.isPending}
                    onChange={(enabled) => toggle(row.method, enabled)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {setup.canEdit && !canWrite ? (
        <p className="border-t border-border px-5 py-2 text-sm text-text-3">{NEEDS_CONNECTION}</p>
      ) : null}
      {editingCash ? (
        <CashSheet setup={setup} onSaved={onSaved} onClose={() => setEditingCash(false)} />
      ) : null}
    </Card>
  )
}

function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 items-center disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-0"
    >
      <span
        className={cn(
          'relative inline-block h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-pri' : 'bg-surface-3 ring-1 ring-border-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  )
}

function CashSheet({
  setup,
  onSaved,
  onClose,
}: {
  setup: PaymentSetup
  onSaved: (setup: PaymentSetup) => void
  onClose: () => void
}) {
  const formId = useId()
  const cash = setup.methods.find((m) => m.method === 'cash')
  const [ticked, setTicked] = useState<FxCurrency[]>(cash?.foreignCurrencies ?? [])
  const save = useMutation({
    mutationFn: () =>
      api.paymentMethods.set({
        propertyId: setup.property.id,
        method: 'cash',
        enabled: cash?.enabled ?? true,
        foreignCurrencies: ticked,
      }),
    onSuccess: (next) => {
      const added = ticked.filter((c) => !cash?.foreignCurrencies.includes(c))
      onSaved(next)
      toast.success(
        added.length > 0 ? `Cash now takes ${added.join(', ')}` : 'Cash currencies saved',
      )
      onClose()
    },
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }
  return (
    <Sheet
      open
      onClose={() => (save.isPending ? undefined : onClose())}
      title="Cash · currencies"
      description="Foreign cash is taken at the day's CBN rate and posted in naira."
      footer={
        <>
          <span className="grow" />
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-1">
        {save.error ? (
          <p role="alert" className="mb-2 rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problemMessage(save.error)}
          </p>
        ) : null}
        <label htmlFor={`${formId}-NGN`} className="flex min-h-11 items-center gap-3 text-text-2">
          <Checkbox id={`${formId}-NGN`} checked disabled />
          Naira (always)
        </label>
        {FX_CURRENCIES.map((code) => (
          <label
            key={code}
            htmlFor={`${formId}-${code}`}
            className="flex min-h-11 items-center gap-3"
          >
            <Checkbox
              id={`${formId}-${code}`}
              checked={ticked.includes(code)}
              onChange={(event) =>
                setTicked((list) =>
                  event.target.checked ? [...list, code] : list.filter((c) => c !== code),
                )
              }
            />
            {FX_CURRENCY_LABELS[code]}
          </label>
        ))}
      </form>
    </Sheet>
  )
}
