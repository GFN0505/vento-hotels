// Add or edit one room: number, floor, type, features, accessible and connecting rooms. Once the
// hotel is live, a type change asks for a reason right here (spec: reason after go-live).
import { useMutation } from '@tanstack/react-query'
import {
  type Property,
  ROOM_FEATURE_SUGGESTIONS,
  type RoomDetail,
  type RoomTypeView,
} from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { Sheet } from '@/components/ui/sheet'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { useOnline } from '@/offline/connection'
import { ChipInput } from './chip-input'
import { ConnectingPicker } from './connecting-picker'
import { errorCode, NEEDS_CONNECTION } from './format'
import { HistoryButton } from './history-button'
import { useRoomsRefresh } from './queries'
import { REASON_HINT, reasonProblem } from './reason-dialog'
import * as M from './room-form-model'
import type { useRoomActions } from './use-room-actions'

type Props = {
  hotel: Property
  room: RoomDetail | undefined
  types: readonly RoomTypeView[]
  live: boolean
  featureSuggestions: readonly string[]
  actions: ReturnType<typeof useRoomActions>
  onClose: () => void
}

export function RoomForm({
  hotel,
  room,
  types,
  live,
  featureSuggestions,
  actions,
  onClose,
}: Props) {
  const formId = useId()
  const online = useOnline()
  const refresh = useRoomsRefresh()
  const [initial] = useState(() => M.formFrom(room, { typeId: types[0]?.id ?? '' }))
  const [form, setForm] = useState(initial)
  const [problems, setProblems] = useState<Record<string, string | undefined>>({})
  const guard = useDiscardGuard(JSON.stringify(form) !== JSON.stringify(initial), onClose)
  const set = (change: Partial<M.RoomForm>) => setForm((f) => ({ ...f, ...change }))
  const typeChanged = room !== undefined && form.roomTypeId !== room.roomTypeId
  const askReason = live && typeChanged

  const save = useMutation({
    mutationFn: () =>
      room
        ? api.rooms.update(M.changes(room, form, live))
        : api.rooms.create({
            propertyId: hotel.id,
            number: form.number.trim().toUpperCase(),
            floor: Number(form.floor),
            roomTypeId: form.roomTypeId,
            features: form.features,
            accessible: form.accessible,
            connectingRoomIds: form.connecting.map((r) => r.id),
          }),
    onSuccess: async (saved) => {
      await refresh()
      toast.success(`Room ${saved.number} ${room ? 'saved' : 'added'}`)
      onClose()
    },
    onError: (error) => {
      const code = errorCode(error)
      const message = problemMessage(error)
      if (code === 'ROOM_NUMBER_TAKEN' || code === 'ROOM_ARCHIVED') setProblems({ number: message })
      else if (code === 'REASON_REQUIRED') setProblems({ reason: message })
      else setProblems({ form: message })
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = {
      number: M.numberProblem(form.number),
      floor: M.floorProblem(form.floor),
      reason: askReason ? reasonProblem(form.reason) : undefined,
    }
    setProblems(found)
    if (found.number || found.floor || found.reason) {
      return focusFirstProblem(event.currentTarget, M.FIELD_ORDER, found)
    }
    if (room && Object.keys(M.changes(room, form, live)).length === 1) return onClose()
    save.mutate()
  }

  const title = room ? `Room ${room.number}` : 'Add room'
  return (
    <Sheet
      open
      onClose={() => {
        if (!save.isPending) guard.close()
      }}
      title={title}
      description={
        room ? (
          <span className="flex flex-wrap items-center gap-x-3">
            <span>
              {room.roomTypeName} · {hotel.name}
            </span>
            <HistoryButton roomId={room.id} title={`Room ${room.number} · ${room.roomTypeName}`} />
          </span>
        ) : (
          `At ${hotel.name}`
        )
      }
      footer={
        guard.bar ?? (
          <>
            {room ? (
              <Button
                variant="danger"
                className="mr-auto"
                disabled={!online || save.isPending}
                loading={actions.pending}
                onClick={() => actions.remove([room], onClose)}
              >
                Remove
              </Button>
            ) : null}
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
              {room ? 'Save room' : 'Add room'}
            </Button>
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
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Number"
            name="number"
            value={form.number}
            maxLength={10}
            placeholder="e.g. 412"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            error={problems.number}
            validate={M.numberProblem}
            onChange={(event) => set({ number: event.target.value })}
            className="num"
            data-autofocus
          />
          <Field
            label="Floor"
            name="floor"
            value={form.floor}
            maxLength={4}
            inputMode="numeric"
            placeholder="e.g. 4"
            hint="0 for ground"
            error={problems.floor}
            validate={M.floorProblem}
            onChange={(event) => set({ floor: event.target.value })}
            className="num"
          />
        </div>
        <SelectField
          label="Room type"
          value={form.roomTypeId}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(event) => set({ roomTypeId: event.target.value })}
        />
        {askReason ? (
          <Field
            label={`Reason for changing the type of Room ${room.number}`}
            name="reason"
            value={form.reason}
            maxLength={500}
            hint={REASON_HINT}
            error={problems.reason}
            validate={reasonProblem}
            onChange={(event) => set({ reason: event.target.value })}
          />
        ) : null}
        <label
          htmlFor={`${formId}-accessible`}
          className="flex min-h-11 items-start gap-3 rounded-md border border-border px-3.5 py-3 has-checked:border-pri-line has-checked:bg-pri-soft/40"
        >
          <Checkbox
            id={`${formId}-accessible`}
            checked={form.accessible}
            onChange={(event) => set({ accessible: event.target.checked })}
            className="mt-0.5"
          />
          <span className="flex flex-col">
            <span className="font-medium">Accessible</span>
            <span className="text-sm text-text-2">
              Step-free, with room to move a wheelchair. Shown as a feature and a filter.
            </span>
          </span>
        </label>
        <ChipInput
          label="Features"
          value={form.features}
          suggestions={[...new Set([...ROOM_FEATURE_SUGGESTIONS, ...featureSuggestions])]}
          onChange={(features) => set({ features })}
        />
        <ConnectingPicker
          propertyId={hotel.id}
          self={room?.id}
          value={form.connecting}
          onChange={(connecting) => set({ connecting })}
        />
      </form>
    </Sheet>
  )
}
