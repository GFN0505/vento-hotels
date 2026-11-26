// Move the selected rooms to another room type. Once the hotel is live this moves sellable rooms
// between types, so it carries a reason like a removal.
import { useMutation } from '@tanstack/react-query'
import type { Property, RoomTypeView } from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { plural } from './format'
import { useRoomsRefresh } from './queries'
import { REASON_HINT, reasonProblem } from './reason-dialog'

type Props = {
  hotel: Property
  live: boolean
  rooms: readonly { id: string; number: string }[]
  types: readonly RoomTypeView[]
  onDone: () => void
  onClose: () => void
}

export function ChangeTypeDialog({ hotel, live, rooms, types, onDone, onClose }: Props) {
  const formId = useId()
  const refresh = useRoomsRefresh()
  const [typeId, setTypeId] = useState('')
  const [reason, setReason] = useState('')
  const [problems, setProblems] = useState<Record<string, string | undefined>>({})
  const what = rooms.length === 1 ? `Room ${rooms[0]?.number}` : plural(rooms.length, 'room')
  const target = types.find((type) => type.id === typeId)

  const change = useMutation({
    mutationFn: () =>
      api.rooms.changeType({
        propertyId: hotel.id,
        ids: rooms.map((room) => room.id),
        roomTypeId: typeId,
        reason: live ? reason.trim() : undefined,
      }),
    onSuccess: async () => {
      await refresh()
      toast.success(`${what} moved to ${target?.name ?? 'the new type'}`)
      onDone()
    },
    onError: (error) => setProblems({ form: problemMessage(error) }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = {
      type: typeId ? undefined : 'Choose a room type',
      reason: live ? reasonProblem(reason) : undefined,
    }
    setProblems(found)
    if (found.type || found.reason) return
    change.mutate()
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!change.isPending) onClose()
      }}
      title={`Change type of ${what}`}
      description={
        live
          ? "Rooms you can sell move between types, so the owner's daily report shows it."
          : undefined
      }
      footer={
        <>
          <Button onClick={onClose} disabled={change.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={change.isPending}>
            Change type
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {problems.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problems.form}
          </p>
        ) : null}
        <SelectField
          label="New room type"
          value={typeId}
          placeholder="Choose a room type"
          options={types.map((type) => ({ value: type.id, label: type.name }))}
          hint={problems.type ? <span className="text-ro">{problems.type}</span> : undefined}
          onChange={(event) => setTypeId(event.target.value)}
          data-autofocus
        />
        {live ? (
          <Field
            label={`Reason for changing the type of ${what}`}
            value={reason}
            maxLength={500}
            hint={REASON_HINT}
            error={problems.reason}
            validate={reasonProblem}
            onChange={(event) => setReason(event.target.value)}
          />
        ) : null}
      </form>
    </Dialog>
  )
}
