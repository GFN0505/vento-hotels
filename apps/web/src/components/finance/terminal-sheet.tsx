// Add or edit a POS terminal (spec: "Terminal sheet"): provider, what staff call it, the terminal ID
// printed on every slip, and the naira account it settles into.
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  type PaymentSetup,
  POS_PROVIDERS,
  type PosTerminalView,
  terminalIdSchema,
} from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { NEEDS_CONNECTION } from '@/components/settings/offline-note'
import { Button } from '@/components/ui/button'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Field } from '@/components/ui/field'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { SelectField } from '@/components/ui/select-field'
import { Sheet } from '@/components/ui/sheet'
import { api, orpc } from '@/lib/api'
import { errorCode, errorData, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'

type Props = {
  setup: PaymentSetup
  terminal?: PosTerminalView | undefined
  onSaved: () => Promise<unknown>
  onClose: () => void
}

type Problems = Partial<
  Record<'provider' | 'name' | 'terminalId' | 'bankAccountId' | 'reason' | 'form', string>
>

const idProblem = (value: string) =>
  terminalIdSchema.safeParse(value).success
    ? undefined
    : 'Enter the terminal ID: up to 20 letters and digits'

export function TerminalSheet({ setup, terminal, onSaved, onClose }: Props) {
  const formId = useId()
  const listId = useId()
  const online = useOnline()
  const accounts = useQuery(
    orpc.bankAccounts.list.queryOptions({
      input: { propertyId: setup.property.id, status: 'active' },
    }),
  )
  const naira = (accounts.data?.items ?? []).filter((a) => a.currency === 'NGN')
  const [provider, setProvider] = useState(terminal?.provider ?? '')
  const [name, setName] = useState(terminal?.name ?? '')
  const [terminalId, setTerminalId] = useState(terminal?.terminalId ?? '')
  const [bankAccountId, setBankAccountId] = useState(
    terminal?.bankAccountId ?? setup.guestTransferAccount?.id ?? '',
  )
  const [reason, setReason] = useState('')
  const [askReason, setAskReason] = useState(setup.property.live)
  const [problems, setProblems] = useState<Problems>({})
  const [archiving, setArchiving] = useState(false)
  const readOnly = !setup.canEdit || terminal?.status === 'archived'
  const dirty = terminal
    ? provider !== terminal.provider ||
      name !== terminal.name ||
      terminalId.toUpperCase() !== terminal.terminalId ||
      bankAccountId !== terminal.bankAccountId
    : Boolean(provider || name || terminalId)
  const guard = useDiscardGuard(dirty, onClose)

  const input = () => ({
    propertyId: setup.property.id,
    provider: provider.trim(),
    name: name.trim(),
    terminalId,
    bankAccountId: bankAccountId || (naira[0]?.id ?? ''),
    reason: reason.trim() || undefined,
  })
  const save = useMutation({
    mutationFn: () =>
      terminal
        ? api.posTerminals.update({ ...input(), id: terminal.id, version: terminal.version })
        : api.posTerminals.create(input()),
    onSuccess: async (saved) => {
      await onSaved()
      toast.success(
        terminal
          ? `${saved.provider} · ${saved.name} saved`
          : `${saved.provider} · ${saved.name} added`,
      )
      onClose()
    },
    onError: (error) => {
      if (errorCode(error) === 'REASON_REQUIRED') setAskReason(true)
      const field = errorData(error).field
      const key: keyof Problems =
        field === 'terminalId' || field === 'bankAccountId' || field === 'reason' ? field : 'form'
      setProblems({ [key]: problemMessage(error) })
    },
  })
  const archive = useMutation({
    mutationFn: (why: string) =>
      api.posTerminals.archive({
        propertyId: setup.property.id,
        id: terminal?.id ?? '',
        reason: why,
      }),
    onSuccess: async (saved) => {
      await onSaved()
      toast.success(`${saved.provider} · ${saved.name} archived`)
      onClose()
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {}
    if (provider.trim().length < 2) found.provider = 'Name the provider'
    if (!name.trim()) found.name = 'Name it the way staff do, e.g. Desk 1'
    const idIssue = idProblem(terminalId)
    if (idIssue) found.terminalId = idIssue
    if (!input().bankAccountId)
      found.bankAccountId = `Add one of ${setup.property.entityName}'s naira accounts first.`
    if (askReason && reason.trim().length < 3)
      found.reason = 'Give a reason of at least 3 characters'
    setProblems(found)
    if (Object.keys(found).length > 0) {
      event.currentTarget.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    save.mutate()
  }

  return (
    <Sheet
      open
      onClose={() => (save.isPending ? undefined : guard.close())}
      title={
        terminal
          ? `${terminal.provider} · ${terminal.name}`
          : `Add POS terminal · ${setup.property.name}`
      }
      description="Only terminals registered here can take the hotel's card payments in Vento."
      footer={
        guard.bar ?? (
          <>
            {terminal && !readOnly ? (
              <Button
                variant="danger"
                className="max-lg:h-11"
                disabled={!online}
                onClick={() => setArchiving(true)}
              >
                Archive terminal
              </Button>
            ) : null}
            <span className="grow" />
            {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
            <Button onClick={guard.close} disabled={save.isPending}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {readOnly ? null : (
              <Button
                type="submit"
                form={formId}
                variant="primary"
                disabled={!online || (Boolean(terminal) && !dirty)}
                loading={save.isPending}
              >
                {terminal ? 'Save terminal' : 'Add terminal'}
              </Button>
            )}
          </>
        )
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {problems.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problems.form}
          </p>
        ) : null}
        <Field
          label="Provider"
          name="provider"
          value={provider}
          list={listId}
          maxLength={60}
          placeholder="e.g. Moniepoint"
          disabled={readOnly}
          error={problems.provider}
          onChange={(event) => setProvider(event.target.value)}
          className="max-lg:h-11"
          data-autofocus
        />
        <datalist id={listId}>
          {POS_PROVIDERS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            name="name"
            value={name}
            maxLength={60}
            hint="What staff call it, e.g. Desk 1"
            disabled={readOnly}
            error={problems.name}
            onChange={(event) => setName(event.target.value)}
            className="max-lg:h-11"
          />
          <Field
            label="Terminal ID"
            name="terminalId"
            value={terminalId}
            maxLength={20}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            hint="Printed on the terminal and on every slip"
            disabled={readOnly}
            error={problems.terminalId}
            validate={idProblem}
            onChange={(event) => setTerminalId(event.target.value.toUpperCase())}
            className="num max-lg:h-11"
          />
        </div>
        <SelectField
          label="Settles into"
          value={bankAccountId || (naira[0]?.id ?? '')}
          {...(naira.length === 0 ? { placeholder: 'No naira accounts yet' } : {})}
          options={naira.map((a) => ({ value: a.id, label: `${a.bankName} ••••${a.last4}` }))}
          disabled={readOnly}
          error={problems.bankAccountId}
          onChange={(event) => setBankAccountId(event.target.value)}
          className="max-lg:h-11"
        />
        {askReason && !readOnly ? (
          <Field
            label="Reason"
            name="reason"
            value={reason}
            maxLength={500}
            hint="Recorded with your name. This shows in the owner's daily report."
            error={problems.reason}
            onChange={(event) => setReason(event.target.value)}
            className="max-lg:h-11"
          />
        ) : null}
      </form>
      <ReasonDialog
        open={archiving}
        title="Archive terminal"
        description={
          terminal
            ? `Archive ${terminal.provider} · ${terminal.name}? Payments can't name it once archived.`
            : undefined
        }
        label="Reason"
        confirmLabel="Archive terminal"
        destructive
        pending={archive.isPending}
        error={archive.error ? problemMessage(archive.error) : undefined}
        onConfirm={(why) => archive.mutate(why)}
        onClose={() => {
          archive.reset()
          setArchiving(false)
        }}
      />
    </Sheet>
  )
}
