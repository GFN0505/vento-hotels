// "Mark VAT 7.5% verified" (spec: "Mark verified"): the legal source, pre-filled with what's there,
// recorded with the person's name and today's date. Audited only.
import { useMutation } from '@tanstack/react-query'
import type { TaxRateView, TaxSetup, TaxView } from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { rateLabel } from './format'

type Props = {
  tax: TaxView
  rate: TaxRateView
  propertyId: string
  onSaved: (setup: TaxSetup) => void
  onClose: () => void
}

const sourceProblem = (value: string) =>
  value.trim().length < 3 ? 'Name the act, law or decision, and the section' : undefined

export function VerifyDialog({ tax, rate, propertyId, onSaved, onClose }: Props) {
  const formId = useId()
  const [source, setSource] = useState(rate.source.startsWith('Vento default') ? '' : rate.source)
  const [problem, setProblem] = useState<string>()
  const label = `${tax.name} ${rateLabel(rate)}`
  const verify = useMutation({
    mutationFn: () => api.taxes.verify({ propertyId, rateId: rate.id, source: source.trim() }),
    onSuccess: (setup) => {
      onSaved(setup)
      toast.success(`${label} marked verified`)
      onClose()
    },
    onError: (error) => setProblem(problemMessage(error)),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = sourceProblem(source)
    setProblem(found)
    if (found) event.currentTarget.querySelector('input')?.focus()
    else verify.mutate()
  }

  return (
    <Dialog
      open
      onClose={() => (verify.isPending ? undefined : onClose())}
      title={`Mark ${label} verified`}
      description="Recorded with your name and today's date."
      footer={
        <>
          <Button onClick={onClose} disabled={verify.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={verify.isPending}>
            Mark verified
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field
          label="Source"
          name="source"
          value={source}
          maxLength={300}
          hint={
            tax.kind === 'service_charge'
              ? 'The decision, e.g. board meeting, 20 Oct 2026'
              : 'Act, law or circular and section, e.g. Nigeria Tax Act 2025, s. …'
          }
          error={problem}
          validate={sourceProblem}
          onChange={(event) => setSource(event.target.value)}
          className="max-lg:h-11"
          data-autofocus
        />
      </form>
    </Dialog>
  )
}
