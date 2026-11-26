// Add or edit a room type (spec: room types): name and code, bed, who it sleeps, size and
// amenities. Removing a type is only possible once it has no rooms.
import { useMutation } from '@tanstack/react-query'
import {
  type Property,
  ROOM_TYPE_AMENITY_SUGGESTIONS,
  type RoomTypeView,
  suggestCode,
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
import { BED_OPTIONS, errorCode, NEEDS_CONNECTION, plural } from './format'
import { OccupancyFields } from './occupancy-fields'
import { useRoomsRefresh } from './queries'
import * as F from './room-type-form'

type Props = { hotel: Property; type: RoomTypeView | undefined; onClose: () => void }

export function RoomTypeSheet({ hotel, type, onClose }: Props) {
  const formId = useId()
  const online = useOnline()
  const refresh = useRoomsRefresh()
  const [initial] = useState(() => F.formFrom(type))
  const [form, setForm] = useState(initial)
  const [problems, setProblems] = useState<Record<string, string | undefined>>({})
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const guard = useDiscardGuard(dirty, onClose)
  const set = (change: Partial<F.TypeForm>) => setForm((f) => ({ ...f, ...change }))

  const save = useMutation({
    mutationFn: () => {
      const input = F.toInput(form, hotel.id)
      if (!type) return api.roomTypes.create(input)
      const { propertyId: _, ...changes } = input
      return api.roomTypes.update({ id: type.id, ...changes })
    },
    onSuccess: async (saved) => {
      await refresh()
      toast.success(`${saved.name} saved`)
      onClose()
    },
    onError: (error) => {
      const code = errorCode(error)
      const message = problemMessage(error)
      if (code === 'TYPE_NAME_TAKEN') setProblems({ name: message })
      else if (code === 'TYPE_CODE_TAKEN') setProblems({ code: message })
      else setProblems({ form: message })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.roomTypes.archive({ id: type?.id ?? '' }),
    onSuccess: async (removed) => {
      await refresh()
      toast.success(`${removed.name} removed`)
      onClose()
    },
    onError: (error) => setProblems({ form: problemMessage(error) }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = F.check(form, hotel.id)
    setProblems(result.problems)
    if (!result.ok) return focusFirstProblem(event.currentTarget, F.FIELD_ORDER, result.problems)
    save.mutate()
  }

  const busy = save.isPending || remove.isPending
  const rooms = type?.roomCount ?? 0
  return (
    <Sheet
      open
      onClose={() => {
        if (!busy) guard.close()
      }}
      title={type ? type.name : 'Add room type'}
      description={type ? `${plural(rooms, 'room')} · code ${type.code}` : `At ${hotel.name}`}
      footer={
        guard.bar ?? (
          <>
            {type && !type.archivedAt ? (
              <Button
                variant="danger"
                className="mr-auto"
                disabled={!online || busy || rooms > 0}
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Remove
              </Button>
            ) : null}
            <span className="grow" />
            {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
            <Button onClick={guard.close} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              disabled={!online}
              loading={save.isPending}
            >
              Save room type
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
        {type && rooms > 0 ? (
          <p className="rounded-sm bg-surface-2 px-3 py-2 text-sm text-text-2">
            To remove {type.name}, move or remove its {plural(rooms, 'room')} first.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
          <Field
            label="Name"
            name="name"
            value={form.name}
            maxLength={60}
            placeholder="e.g. Deluxe King"
            error={problems.name}
            validate={F.nameProblem}
            onChange={(event) => {
              const name = event.target.value
              set(form.codeEdited ? { name } : { name, code: suggestCode(name) })
            }}
            data-autofocus
          />
          <Field
            label="Code"
            name="code"
            value={form.code}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            hint={type ? undefined : 'For imports and channels'}
            error={problems.code}
            validate={F.codeProblem}
            onChange={(event) => set({ code: event.target.value.toUpperCase(), codeEdited: true })}
            className="num uppercase"
          />
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <SelectField
            label="Bed"
            value={form.bed}
            options={BED_OPTIONS}
            onChange={(event) => set({ bed: event.target.value as F.TypeForm['bed'] })}
          />
          <label htmlFor={`${formId}-sofa`} className="flex h-11 items-center gap-2.5 text-text-2">
            <Checkbox
              id={`${formId}-sofa`}
              checked={form.sofaBed}
              onChange={(event) => set({ sofaBed: event.target.checked })}
            />
            Sofa bed as well
          </label>
        </div>
        <OccupancyFields form={form} problems={problems} onChange={set} />
        <Field
          label="Size in m² (optional)"
          name="sizeSqm"
          value={form.sizeSqm}
          inputMode="decimal"
          placeholder="e.g. 32"
          error={problems.sizeSqm}
          validate={F.sizeProblem}
          onChange={(event) => set({ sizeSqm: event.target.value })}
          className="num sm:max-w-40"
        />
        <ChipInput
          label="Amenities"
          placeholder="e.g. Bathrobes"
          value={form.amenities}
          suggestions={ROOM_TYPE_AMENITY_SUGGESTIONS}
          onChange={(amenities) => set({ amenities })}
        />
      </form>
    </Sheet>
  )
}
