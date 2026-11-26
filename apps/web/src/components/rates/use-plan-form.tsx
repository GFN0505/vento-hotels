// The plan editor's state and saving. Each save sends the version the form started from, so it
// never overwrites someone else's change ("Sade changed Best available at 14:02. Reload…"). Saves
// that remove date prices or room types from followers ask first; after go-live a save that lowers
// tonight's price asks for a reason (REASON_REQUIRED, with what would go down).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type {
  CreateRatePlanInput,
  LoweredTonight,
  RatePlanView,
  RatesOverview,
} from '@vento/shared'
import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, orpc } from '@/lib/api'
import { errorCode, errorData, problemMessage } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { ConfirmDialog } from './confirm-dialog'
import { listNames, plural } from './format'
import { LoweredDialog, loweredFrom } from './lowered-dialog'
import * as F from './plan-form-model'
import { useRatesRefresh } from './queries'

const FIELD_FOR_CODE: Record<string, string> = {
  PLAN_NAME_TAKEN: 'name',
  PLAN_CODE_TAKEN: 'code',
  PARENT_NOT_OWN: 'parentId',
  PARENT_ARCHIVED: 'parentId',
  ROOM_TYPE_NOT_ON_PARENT: 'roomTypes',
  MEAL_ALLOCATION_ABOVE_PRICE: 'mealAllocation',
}

type Args = {
  overview: RatesOverview
  // The plan being edited (latest from the server), or the plan being copied for a new one.
  plan: RatePlanView | undefined
  copy?: boolean
  addRoomTypes?: readonly string[]
}

type Confirm = { title: string; label: string; lines: string[] }
// One save: the checked form, and what the person has already agreed to.
type Payload = { data: CreateRatePlanInput; reason?: string; cells?: number }

export function usePlanForm({ overview, plan, copy = false, addRoomTypes = [] }: Args) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refresh = useRatesRefresh()
  const typeIds = overview.roomTypes.map((t) => t.id)
  const editing = plan && !copy ? plan : undefined
  const start = () => {
    const form = F.formFrom(plan, typeIds, { copy })
    for (const id of addRoomTypes) if (form.rows[id]) form.rows[id] = { ...form.rows[id], on: true }
    return form
  }
  const [base, setBase] = useState(editing)
  const [initial, setInitial] = useState(() => F.formFrom(plan, typeIds, { copy }))
  const [form, setForm] = useState(start)
  const [problems, setProblems] = useState<F.Problems>({})
  const [stale, setStale] = useState(false)
  const [confirm, setConfirm] = useState<Confirm & { payload: Payload }>()
  const [lowered, setLowered] = useState<{ payload: Payload; rows: LoweredTonight[] }>()
  const [reasonError, setReasonError] = useState<string>()
  const dirty = F.isDirty(initial, form)

  // Fresh data arrives: while nothing is being edited, show it. A newer version waits while the
  // person types, so the save is checked against the version the form started from.
  useEffect(() => {
    if (!editing || dirty || editing.version === base?.version) return
    setBase(editing)
    setInitial(F.formFrom(editing, typeIds, {}))
    setForm(F.formFrom(editing, typeIds, {}))
  })

  function adopt(saved: RatePlanView) {
    queryClient.setQueryData(orpc.ratePlans.get.queryKey({ input: { id: saved.id } }), saved)
    setBase(saved)
    setInitial(F.formFrom(saved, typeIds, {}))
    setForm(F.formFrom(saved, typeIds, {}))
    setProblems({})
    setStale(false)
  }

  const save = useMutation({
    mutationFn: ({ data, reason, cells }: Payload) => {
      if (!base) return api.ratePlans.create({ ...data, ...(reason ? { reason } : {}) })
      const { propertyId: _, ...fields } = data
      return api.ratePlans.update({
        ...fields,
        id: base.id,
        version: base.version,
        reason,
        ...(cells === undefined ? {} : { confirmDateCellsRemoved: cells }),
      })
    },
    onSuccess: async (saved) => {
      setLowered(undefined)
      toast.success(`${saved.name} saved`)
      if (base) adopt(saved)
      else {
        setInitial(form)
        void navigate({ to: '/rates/plans/$planId', params: { planId: saved.id }, replace: true })
      }
      await refresh()
    },
    onError: (error, payload) => {
      const code = errorCode(error) ?? ''
      const message = problemMessage(error)
      if (code === 'REASON_REQUIRED') {
        if (lowered) setReasonError(message)
        else setLowered({ payload, rows: loweredFrom(error) })
        return
      }
      // The save would delete dated prices or restrictions: the server counts them, the person
      // agrees, and the save goes again with that count.
      const count = errorData(error).count
      if (code === 'DATE_CELLS_REMOVED' && typeof count === 'number') {
        setLowered(undefined)
        const ask = confirmFor(true)
        return setConfirm({
          title: ask?.title ?? `Save ${base?.name ?? 'the plan'}?`,
          label: ask?.label ?? 'Save plan',
          lines: [message.replace(/\s*Confirm to save\.$/, ''), ...(ask?.lines ?? [])],
          payload: { ...payload, cells: count },
        })
      }
      setLowered(undefined)
      setStale(code === 'STALE_VERSION')
      if (code === 'DERIVED_NOT_POSITIVE') {
        return setProblems({ [form.percent.trim() ? 'percent' : 'offset']: message })
      }
      setProblems({ [FIELD_FOR_CODE[code] ?? 'form']: message })
    },
  })

  // What a save removes, in words. Before saving it only asks when plans that follow lose a room
  // type; the server asks (DATE_CELLS_REMOVED) when dated prices or restrictions would go.
  function confirmFor(always = false): Confirm | undefined {
    if (!base) return undefined
    const switching = base.pricing === 'own' && form.pricing === 'derived'
    const removed = overview.roomTypes.filter(
      (t) => base.roomTypes.some((r) => r.roomTypeId === t.id) && !form.rows[t.id]?.on,
    )
    const names = listNames(removed.map((t) => t.name))
    const lines =
      removed.length > 0 && base.followers.length > 0
        ? [
            `${removed.length === 1 ? 'It' : 'They'} also stop on ${listNames(base.followers.map((f) => f.name))}.`,
          ]
        : []
    if (!always && lines.length === 0) return undefined
    if (switching)
      return { title: `Switch ${base.name} to derived prices?`, label: 'Switch to derived', lines }
    if (removed.length > 0) {
      return {
        title: `Remove ${names} from ${base.name}?`,
        label: `Remove ${removed.length === 1 ? names : plural(removed.length, 'room type')}`,
        lines,
      }
    }
    return { title: `Save ${base.name}?`, label: 'Save plan', lines }
  }

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const result = F.check(form, overview.property.id, typeIds)
    setProblems(result.problems)
    if (!result.data) {
      const el = event?.currentTarget ?? document.querySelector<HTMLFormElement>('#plan-form')
      if (el) focusFirstProblem(el, F.fieldOrder(typeIds), result.problems)
      return
    }
    const ask = confirmFor()
    if (ask) setConfirm({ ...ask, payload: { data: result.data } })
    else save.mutate({ data: result.data })
  }

  const dialogs = (
    <>
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.label}
          destructive
          onConfirm={() => {
            save.mutate(confirm.payload)
            setConfirm(undefined)
          }}
          onClose={() => setConfirm(undefined)}
        >
          {confirm.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </ConfirmDialog>
      ) : null}
      {lowered ? (
        <LoweredDialog
          lowered={lowered.rows}
          confirmLabel="Save plan"
          basePlanName={overview.basePlan?.name}
          pending={save.isPending}
          error={reasonError}
          onConfirm={(reason) => save.mutate({ ...lowered.payload, reason })}
          onClose={() => {
            setLowered(undefined)
            setReasonError(undefined)
          }}
        />
      ) : null}
    </>
  )

  return {
    base,
    form,
    problems,
    stale,
    dirty,
    saving: save.isPending,
    typeIds,
    set: (change: Partial<F.PlanForm>) => setForm((f) => ({ ...f, ...change })),
    setRow: (id: string, change: Partial<F.PriceRow>) =>
      setForm((f) => {
        const row = f.rows[id] ?? { on: false, weekday: '', weekend: '' }
        return { ...f, rows: { ...f.rows, [id]: { ...row, ...change } } }
      }),
    submit,
    discard: () => setForm(initial),
    reloaded: (fresh: RatePlanView) => adopt(fresh),
    dialogs,
  }
}

export type PlanFormState = ReturnType<typeof usePlanForm>
