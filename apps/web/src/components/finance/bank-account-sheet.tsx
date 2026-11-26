// Add or edit a bank account (spec: "Bank account sheet"): the bank, the 10-digit account number,
// the name as the bank shows it, the currency, and whether this hotel's guests transfer into it.
// The full number shows here only; lists mask it.
import { useMutation } from '@tanstack/react-query'
import {
  accountNumberSchema,
  type BankAccountView,
  bankAccountLabel,
  NIGERIAN_BANKS,
  type PaymentSetup,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { NEEDS_CONNECTION } from '@/components/settings/offline-note'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Field } from '@/components/ui/field'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { SelectField } from '@/components/ui/select-field'
import { Sheet } from '@/components/ui/sheet'
import { api } from '@/lib/api'
import { errorCode, errorData, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'

type Props = {
  setup: PaymentSetup
  account?: BankAccountView | undefined
  onSaved: () => Promise<unknown>
  onClose: () => void
}

const OTHER = 'Other'
type Problems = Partial<
  Record<'bank' | 'accountNumber' | 'accountName' | 'currency' | 'reason' | 'form', string>
>

const numberProblem = (value: string) =>
  accountNumberSchema.safeParse(value).success ? undefined : 'Enter the 10-digit account number.'
const nameProblem = (value: string) =>
  value.trim().length < 2 ? 'Enter the account name as the bank shows it' : undefined

export function BankAccountSheet({ setup, account, onSaved, onClose }: Props) {
  const formId = useId()
  const online = useOnline()
  const hotel = setup.property.name
  const known = account ? (NIGERIAN_BANKS as readonly string[]).includes(account.bankName) : true
  const [bank, setBank] = useState(account ? (known ? account.bankName : OTHER) : '')
  const [otherBank, setOtherBank] = useState(account && !known ? account.bankName : '')
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '')
  const [accountName, setAccountName] = useState(account?.accountName ?? setup.property.entityName)
  const [currency, setCurrency] = useState<SupportedCurrency>(account?.currency ?? 'NGN')
  const isTransfer = Boolean(account?.guestTransferFor.some((h) => h.id === setup.property.id))
  const [guestTransfer, setGuestTransfer] = useState(
    account ? isTransfer : !setup.guestTransferAccount,
  )
  const [reason, setReason] = useState('')
  const [askReason, setAskReason] = useState(setup.property.live)
  const [problems, setProblems] = useState<Problems>({})
  const [archiving, setArchiving] = useState(false)
  const readOnly = Boolean(account && (!account.canEdit || account.status === 'archived'))
  const bankName = bank === OTHER ? otherBank.trim() : bank
  const dirty = account
    ? bankName !== account.bankName ||
      accountNumber !== account.accountNumber ||
      accountName !== account.accountName ||
      currency !== account.currency ||
      guestTransfer !== isTransfer
    : Boolean(bank || accountNumber)
  const guard = useDiscardGuard(dirty, onClose)

  const fields = () => ({
    propertyId: setup.property.id,
    bankName,
    accountNumber,
    accountName: accountName.trim(),
    currency,
    guestTransfer: currency === 'NGN' && guestTransfer,
    reason: reason.trim() || undefined,
  })
  const save = useMutation({
    mutationFn: () =>
      account
        ? api.bankAccounts.update({ ...fields(), id: account.id, version: account.version })
        : api.bankAccounts.create(fields()),
    onSuccess: async (saved) => {
      await onSaved()
      toast.success(
        account ? `${bankAccountLabel(saved)} saved` : `${saved.bankName} ••••${saved.last4} added`,
      )
      onClose()
    },
    onError: (error) => {
      const code = errorCode(error)
      if (code === 'REASON_REQUIRED') setAskReason(true)
      const field = errorData(error).field
      const key = typeof field === 'string' && field in FIELD_KEYS ? FIELD_KEYS[field] : 'form'
      setProblems({ [key ?? 'form']: problemMessage(error) })
    },
  })
  const archive = useMutation({
    mutationFn: (why: string) =>
      api.bankAccounts.archive({
        propertyId: setup.property.id,
        id: account?.id ?? '',
        reason: why,
      }),
    onSuccess: async (saved) => {
      await onSaved()
      toast.success(`${bankAccountLabel(saved)} archived`)
      onClose()
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {}
    if (bankName.length < 2) found.bank = 'Choose the bank'
    const numberIssue = numberProblem(accountNumber)
    if (numberIssue) found.accountNumber = numberIssue
    const nameIssue = nameProblem(accountName)
    if (nameIssue) found.accountName = nameIssue
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
        account
          ? `${account.bankName} ••••${account.last4}`
          : `Add bank account · ${setup.property.entityName}`
      }
      description={
        account?.alsoUsedBy.length
          ? `${setup.property.entityName}'s account. Also used by ${account.alsoUsedBy.join(', ')}.`
          : `${setup.property.entityName}'s account, shared by every hotel it owns.`
      }
      footer={
        guard.bar ?? (
          <>
            {account && !readOnly && account.status === 'active' ? (
              <Button
                variant="danger"
                className="max-lg:h-11"
                disabled={!online}
                onClick={() => setArchiving(true)}
              >
                Archive account
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
                disabled={!online || (Boolean(account) && !dirty)}
                loading={save.isPending}
              >
                {account ? 'Save account' : 'Add account'}
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
        {account && !account.canEdit ? (
          <p className="rounded-sm bg-surface-2 px-3 py-2 text-text-2">
            {setup.property.entityName} also owns hotels outside your access. Ask someone with
            access to all of them.
          </p>
        ) : null}
        <SelectField
          label="Bank"
          value={bank}
          placeholder="Choose the bank"
          options={[...NIGERIAN_BANKS, OTHER]}
          disabled={readOnly}
          error={problems.bank}
          onChange={(event) => setBank(event.target.value)}
          className="max-lg:h-11"
        />
        {bank === OTHER ? (
          <Field
            label="Bank name"
            name="otherBank"
            value={otherBank}
            maxLength={60}
            disabled={readOnly}
            onChange={(event) => setOtherBank(event.target.value)}
            className="max-lg:h-11"
          />
        ) : null}
        <Field
          label="Account number"
          name="accountNumber"
          value={accountNumber}
          inputMode="numeric"
          autoComplete="off"
          maxLength={13}
          hint="10 digits"
          disabled={readOnly}
          error={problems.accountNumber}
          validate={numberProblem}
          onChange={(event) => setAccountNumber(event.target.value.replace(/[^\d]/g, ''))}
          className="num max-lg:h-11"
        />
        <Field
          label="Account name"
          name="accountName"
          value={accountName}
          maxLength={120}
          hint="As the bank shows it to someone sending money"
          disabled={readOnly}
          error={problems.accountName}
          validate={nameProblem}
          onChange={(event) => setAccountName(event.target.value)}
          className="max-lg:h-11"
        />
        <SelectField
          label="Currency"
          value={currency}
          options={[...SUPPORTED_CURRENCIES]}
          disabled={readOnly}
          error={problems.currency}
          onChange={(event) => setCurrency(event.target.value as SupportedCurrency)}
          className="max-lg:h-11"
        />
        {currency === 'NGN' ? (
          <label htmlFor={`${formId}-transfer`} className="flex min-h-11 items-start gap-3">
            <Checkbox
              id={`${formId}-transfer`}
              className="mt-1"
              checked={guestTransfer}
              disabled={readOnly}
              onChange={(event) => setGuestTransfer(event.target.checked)}
            />
            <span>
              Guests at {hotel} pay transfers into this account
              {setup.guestTransferAccount &&
              setup.guestTransferAccount.id !== account?.id &&
              guestTransfer ? (
                <span className="block text-sm text-text-3">
                  Replaces {setup.guestTransferAccount.bankName} ••••
                  {setup.guestTransferAccount.last4}.
                </span>
              ) : null}
            </span>
          </label>
        ) : null}
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
        title="Archive account"
        description={
          account
            ? `Archive ${account.bankName} ••••${account.last4}? You can restore it later.`
            : undefined
        }
        label="Reason"
        confirmLabel="Archive account"
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

const FIELD_KEYS: Record<string, keyof Problems> = {
  accountNumber: 'accountNumber',
  currency: 'currency',
  reason: 'reason',
}
