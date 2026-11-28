// Add or edit a cash drawer (spec: "Drawers"): its name and the POS terminals at it. Archive is
// refused while a shift is open on it and for the hotel's last active drawer; the float left in it
// isn't carried anywhere, so the dialog says to take it to the safe.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type DrawerView, drawerNameSchema, formatMoney, type PaymentSetup } from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { NEEDS_CONNECTION } from '@/components/settings/offline-note'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Field } from '@/components/ui/field'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { Sheet } from '@/components/ui/sheet'
import { api, orpc } from '@/lib/api'
import { errorCode, errorData, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'

type Props = {
  setup: PaymentSetup
  drawer?: DrawerView | undefined
  onSaved: () => Promise<unknown>
  onClose: () => void
}

type Problems = Partial<Record<'name' | 'posTerminalIds' | 'reason' | 'form', string>>

const nameProblem = (value: string) =>
  drawerNameSchema.safeParse(value).success ? undefined : 'Name the drawer, e.g. Desk 2'

export function DrawerSheet({ setup, drawer, onSaved, onClose }: Props) {
  const formId = useId()
  const online = useOnline()
  const terminals = useQuery(
    orpc.posTerminals.list.queryOptions({
      input: { propertyId: setup.property.id, status: 'active' },
    }),
  )
  const [name, setName] = useState(drawer?.name ?? '')
  const [picked, setPicked] = useState<string[]>(() => drawer?.terminals.map((t) => t.id) ?? [])
  const [reason, setReason] = useState('')
  const [askReason, setAskReason] = useState(setup.property.live)
  const [problems, setProblems] = useState<Problems>({})
  const [archiving, setArchiving] = useState(false)
  const readOnly = !setup.canEdit || drawer?.status === 'archived'
  const before =
    drawer?.terminals
      .map((t) => t.id)
      .sort()
      .join() ?? ''
  const dirty = drawer
    ? name !== drawer.name || [...picked].sort().join() !== before
    : Boolean(name || picked.length)
  const guard = useDiscardGuard(dirty, onClose)

  const input = () => ({
    propertyId: setup.property.id,
    name: name.trim(),
    posTerminalIds: picked,
    reason: reason.trim() || undefined,
  })
  const save = useMutation({
    mutationFn: () =>
      drawer
        ? api.cash.drawers.update({ ...input(), id: drawer.id, version: drawer.version })
        : api.cash.drawers.create(input()),
    onSuccess: async (saved) => {
      await onSaved()
      toast.success(drawer ? `${saved.name} saved` : `${saved.name} added`)
      onClose()
    },
    onError: (error) => {
      if (errorCode(error) === 'REASON_REQUIRED') setAskReason(true)
      const field = errorData(error).field
      const key: keyof Problems =
        field === 'name' || field === 'posTerminalIds' || field === 'reason' ? field : 'form'
      setProblems({ [key]: problemMessage(error) })
    },
  })
  const archive = useMutation({
    mutationFn: (why: string) =>
      api.cash.drawers.archive({
        propertyId: setup.property.id,
        id: drawer?.id ?? '',
        reason: why,
      }),
    onSuccess: async (saved) => {
      await onSaved()
      toast.success(`${saved.name} archived`)
      onClose()
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {}
    const issue = nameProblem(name.trim())
    if (issue) found.name = issue
    if (askReason && reason.trim().length < 3)
      found.reason = 'Give a reason of at least 3 characters'
    setProblems(found)
    if (Object.keys(found).length > 0) {
      event.currentTarget.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    save.mutate()
  }

  const left =
    drawer?.now.kind === 'free' && drawer.now.floatLeft !== '0.00' ? drawer.now.floatLeft : null

  return (
    <Sheet
      open
      onClose={() => (save.isPending ? undefined : guard.close())}
      title={drawer ? drawer.name : `Add drawer · ${setup.property.name}`}
      description="Where cash is kept at the desk. Each shift is opened on one."
      footer={
        guard.bar ?? (
          <>
            {drawer && !readOnly ? (
              <Button
                variant="danger"
                className="max-lg:h-11"
                disabled={!online}
                onClick={() => setArchiving(true)}
              >
                Archive drawer
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
                disabled={!online || (Boolean(drawer) && !dirty)}
                loading={save.isPending}
              >
                {drawer ? 'Save drawer' : 'Add drawer'}
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
          label="Name"
          name="name"
          value={name}
          maxLength={30}
          placeholder="e.g. Desk 2"
          disabled={readOnly}
          error={problems.name}
          validate={(value) => nameProblem(value.trim())}
          onChange={(event) => setName(event.target.value)}
          className="max-lg:h-11"
          data-autofocus
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-text-2">
            POS terminals at this drawer
          </legend>
          {terminals.isPending ? (
            <span className="h-11 animate-pulse rounded-sm bg-surface-2" />
          ) : (terminals.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-text-3">No POS terminals at {setup.property.name} yet.</p>
          ) : (
            terminals.data?.items.map((terminal) => (
              <label
                key={terminal.id}
                htmlFor={`${formId}-${terminal.id}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 lg:min-h-9"
              >
                <Checkbox
                  id={`${formId}-${terminal.id}`}
                  checked={picked.includes(terminal.id)}
                  disabled={readOnly}
                  onChange={(event) =>
                    setPicked(
                      event.target.checked
                        ? [...picked, terminal.id]
                        : picked.filter((id) => id !== terminal.id),
                    )
                  }
                />
                <span>
                  {terminal.provider} · {terminal.name}{' '}
                  <span className="num text-text-3">TID {terminal.terminalId}</span>
                </span>
              </label>
            ))
          )}
          {problems.posTerminalIds ? (
            <span className="text-sm text-ro">{problems.posTerminalIds}</span>
          ) : null}
        </fieldset>
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
        title="Archive drawer"
        description={
          drawer
            ? left
              ? `${formatMoney({ amount: left, currency: 'NGN' })} float was left in ${drawer.name}. Take it to the safe.`
              : `Archive ${drawer.name}? Shifts can't be opened on it once archived.`
            : undefined
        }
        label="Reason"
        confirmLabel="Archive drawer"
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

// Restore an archived drawer from its row, with a reason.
export function DrawerRestore({ drawer, propertyId }: { drawer: DrawerView; propertyId: string }) {
  const client = useQueryClient()
  const [asking, setAsking] = useState(false)
  const restore = useMutation({
    mutationFn: (reason: string) => api.cash.drawers.restore({ propertyId, id: drawer.id, reason }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: orpc.cash.key() })
      setAsking(false)
      toast.success(`${drawer.name} restored`)
    },
  })
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label={`Restore ${drawer.name}`}
        className="inline-flex min-h-11 flex-none items-center text-sm font-medium text-pri-ink hover:underline md:min-h-0"
      >
        Restore
      </button>
      <ReasonDialog
        open={asking}
        title={`Restore ${drawer.name}`}
        description="Recorded with your name. On a live hotel this shows in the owner's daily report."
        label="Reason"
        confirmLabel="Restore"
        pending={restore.isPending}
        error={restore.error ? problemMessage(restore.error) : undefined}
        onConfirm={(reason) => restore.mutate(reason)}
        onClose={() => {
          restore.reset()
          setAsking(false)
        }}
      />
    </>
  )
}
