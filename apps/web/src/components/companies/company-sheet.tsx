// Add or edit a company (design #25 SetEntities; spec: "Add or edit a company"). Read-only when the
// company also owns hotels outside the person's access, or is archived.
import { useMutation } from '@tanstack/react-query'
import { type Entity, normalizeRcNumber, normalizeTin } from '@vento/shared'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { dateLabel } from '@/components/hotels/format'
import { useSetupRefresh } from '@/components/hotels/queries'
import { NEEDS_CONNECTION } from '@/components/settings/offline-note'
import { Button } from '@/components/ui/button'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Field } from '@/components/ui/field'
import { REASON_HINT, reasonProblem } from '@/components/ui/reason-dialog'
import { Sheet } from '@/components/ui/sheet'
import { YesNo } from '@/components/ui/yes-no'
import { api } from '@/lib/api'
import { errorCode, problemMessage } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { useOnline } from '@/offline/connection'
import { ArchiveCompany } from './company-archive'
import * as F from './company-form-model'

type Props = {
  company?: Entity | undefined
  onClose: () => void
  // A new company, e.g. to choose it as a hotel's owner.
  onCreated?: (company: Entity) => void
}

const FIELD_FOR_CODE: Record<string, keyof F.CompanyForm> = {
  NAME_TAKEN: 'name',
  NAME_ARCHIVED: 'name',
  RC_NUMBER_TAKEN: 'rcNumber',
  TIN_TAKEN: 'tin',
  REASON_REQUIRED: 'reason',
}

export function CompanySheet({ company: given, onClose, onCreated }: Props) {
  const formId = useId()
  const online = useOnline()
  const refresh = useSetupRefresh()
  const [company, setCompany] = useState(given)
  const [form, setForm] = useState(() => F.companyForm(given))
  const [problems, setProblems] = useState<F.CompanyProblems>({})
  const [stale, setStale] = useState(false)
  const dirty = F.companyDirty(form, company)
  const guard = useDiscardGuard(dirty, onClose)
  const set = (change: Partial<F.CompanyForm>) => setForm((f) => ({ ...f, ...change }))
  const readOnly = Boolean(company && (!company.canEdit || company.status === 'archived'))
  const askReason = F.companyNeedsReason(company, form)
  const banner = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (problems.form) banner.current?.focus()
  }, [problems.form])

  const save = useMutation({
    mutationFn: () =>
      company
        ? api.entities.update(F.updateInput(company, form))
        : api.entities.create(F.createInput(form)),
    onSuccess: async (saved) => {
      await refresh()
      toast.success(company ? `${saved.name} saved` : `${saved.name} added`)
      if (!company) onCreated?.(saved)
      onClose()
    },
    onError: (error) => {
      const code = errorCode(error) ?? ''
      setStale(code === 'STALE_VERSION')
      const field = FIELD_FOR_CODE[code] ?? 'form'
      setProblems({ [field]: problemMessage(error) })
    },
  })

  const reload = useMutation({
    mutationFn: () => api.entities.get({ id: company?.id ?? '' }),
    onSuccess: (fresh) => {
      setCompany(fresh)
      setForm(F.companyForm(fresh))
      setProblems({})
      setStale(false)
    },
    onError: (error) => setProblems({ form: problemMessage(error) }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Opened from a hotel's form (Owning company): its submit isn't the hotel's.
    event.stopPropagation()
    const found = F.checkCompany(form, company)
    setProblems(found)
    if (Object.keys(found).length > 0) {
      return focusFirstProblem(event.currentTarget, F.COMPANY_FIELDS, found)
    }
    save.mutate()
  }

  const busy = save.isPending || reload.isPending
  return (
    <Sheet
      open
      onClose={() => (busy ? undefined : guard.close())}
      title={company ? company.name : 'Add a company'}
      description={
        company
          ? companyLine(company)
          : "A legal entity in the group. Companies belong to the group; link hotels to them afterwards, from each hotel's settings."
      }
      footer={
        guard.bar ?? (
          <>
            <span className="grow" />
            {!online && !readOnly ? (
              <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span>
            ) : null}
            <Button onClick={guard.close} disabled={busy}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {readOnly ? null : (
              <Button
                type="submit"
                form={formId}
                variant="primary"
                disabled={!online || stale || (Boolean(company) && !dirty)}
                loading={save.isPending}
              >
                Save company
              </Button>
            )}
          </>
        )
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {company && !company.canEdit ? (
          <p className="rounded-sm bg-surface-2 px-3 py-2 text-text-2">
            {company.name} also owns hotels outside your access. Ask the owner.
          </p>
        ) : null}
        {problems.form ? (
          <div
            ref={banner}
            tabIndex={-1}
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-sm bg-ro-bg px-3 py-2 text-ro"
          >
            <p className="grow">{problems.form}</p>
            {stale ? (
              <Button size="sm" loading={reload.isPending} onClick={() => reload.mutate()}>
                Reload
              </Button>
            ) : null}
          </div>
        ) : null}
        <Field
          label="Legal name"
          name="name"
          value={form.name}
          maxLength={120}
          placeholder="e.g. Kora Hospitality Ltd"
          hint="As on the CAC certificate"
          disabled={readOnly}
          error={problems.name}
          validate={F.nameProblem}
          onChange={(event) => set({ name: event.target.value })}
          className="max-lg:h-11"
          data-autofocus
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="RC number"
            name="rcNumber"
            value={form.rcNumber}
            maxLength={20}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            hint={F.storedAs(form.rcNumber, normalizeRcNumber) ?? 'e.g. RC 1184402 or BN 3456789'}
            disabled={readOnly}
            error={problems.rcNumber}
            validate={F.rcProblem}
            onChange={(event) => set({ rcNumber: event.target.value })}
            className="num max-lg:h-11"
          />
          <Field
            label="TIN"
            name="tin"
            value={form.tin}
            maxLength={20}
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            hint={F.storedAs(form.tin, normalizeTin) ?? 'e.g. 21847390-0001'}
            disabled={readOnly}
            error={problems.tin}
            validate={F.tinProblem}
            onChange={(event) => set({ tin: event.target.value })}
            className="num max-lg:h-11"
          />
        </div>
        <YesNo
          label="VAT registered"
          hint={vatHint(company, form.vatRegistered)}
          value={form.vatRegistered}
          disabled={readOnly}
          onChange={(vatRegistered) => set({ vatRegistered })}
        />
        {askReason ? (
          <Field
            label="Reason for the change"
            name="reason"
            value={form.reason}
            maxLength={500}
            hint={`A hotel it owns is live, so this shows in the owner's daily report. ${REASON_HINT}`}
            error={problems.reason}
            validate={reasonProblem}
            onChange={(event) => set({ reason: event.target.value })}
            className="max-lg:h-11"
          />
        ) : null}
        <dl className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-text-2">Base currency</dt>
          <dd className="num">NGN (₦)</dd>
        </dl>
      </form>
      {company && !readOnly ? (
        // Its own form (the reason), so it sits outside the company's.
        <ArchiveCompany company={company} onDone={onClose} />
      ) : null}
    </Sheet>
  )
}

function companyLine(company: Entity): string {
  if (company.status === 'archived') return 'Archived'
  const hotels = F.hotelsLine(company)
  return hotels === 'No hotels' ? 'Owns no hotels yet' : `Owns ${hotels}`
}

// What a VAT answer does: at once while no hotel it owns is live; from the next business date once
// one is ("Not VAT registered from 27 Nov 2026"), where choosing the current answer cancels a
// waiting change.
function vatHint(company: Entity | undefined, chosen: boolean): string {
  const usual = "Turns VAT on for this company's hotels' charges once taxes are set up"
  if (!company?.ownsLiveHotel) return usual
  const pending = company.pendingVat
  if (pending && chosen === pending.vatRegistered) {
    return `${pending.vatRegistered ? 'VAT registered' : 'Not VAT registered'} from ${dateLabel(pending.from)}. Choose ${company.vatRegistered ? 'Yes' : 'No'} to cancel.`
  }
  if (chosen !== company.vatRegistered) return 'Applies from the next business date.'
  return usual
}
