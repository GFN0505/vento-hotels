// Edit a member (design #25): role and hotels in one save, and Remove from group behind a
// confirmation that says what happens.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type AccessChoice,
  isGroupAdmin,
  type MemberRole,
  type MemberView,
  type Property,
  ROLE_INFO,
} from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { SelectField } from '@/components/ui/select-field'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { assignableRoles, roleOptions } from '@/lib/team'
import { AccessPicker } from './access-picker'

type EditMemberDialogProps = {
  member: MemberView
  groupName: string
  // The hotel in view, if one is chosen: saving someone out of it says so.
  hotel?: Pick<Property, 'id' | 'name'> | undefined
  myRole: MemberRole | undefined
  canGrantWholeGroup: boolean
  onClose: () => void
}

export function EditMemberDialog({
  member,
  groupName,
  hotel,
  myRole,
  canGrantWholeGroup,
  onClose,
}: EditMemberDialogProps) {
  const queryClient = useQueryClient()
  const formId = useId()
  const [role, setRole] = useState<MemberRole>(member.role)
  const [access, setAccess] = useState<AccessChoice>(
    member.allProperties
      ? { allProperties: true }
      : { allProperties: false, propertyIds: member.properties.map((p) => p.id) },
  )
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [problem, setProblem] = useState<{ access?: string; form?: string }>({})

  const done = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: orpc.members.key() })
    toast.success(message)
    onClose()
  }
  const save = useMutation({
    mutationFn: () => api.members.update({ memberId: member.id, role, access }),
    onSuccess: () => {
      // No longer works at the hotel in view: the row leaves this list; their other hotels stay.
      const stays =
        !hotel ||
        isGroupAdmin(role) ||
        access.allProperties ||
        access.propertyIds.includes(hotel.id)
      return done(stays ? `${member.name} updated` : `${member.name} removed from ${hotel.name}`)
    },
    onError: (error) => setProblem({ form: problemMessage(error) }),
  })
  const remove = useMutation({
    mutationFn: () => api.members.remove({ memberId: member.id }),
    onSuccess: () => done(`${member.name} removed from ${groupName}`),
    onError: (error) => setProblem({ form: problemMessage(error) }),
  })
  const resetPin = useMutation({
    mutationFn: () => api.pins.reset({ memberId: member.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.members.key() })
      toast.success(`${member.name}'s PIN is reset. They set a new one from their account menu.`)
    },
    onError: (error) => setProblem({ form: problemMessage(error) }),
  })
  const busy = save.isPending || remove.isPending

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!access.allProperties && access.propertyIds.length === 0) {
      setProblem({ access: 'Choose at least one hotel' })
      return
    }
    save.mutate()
  }

  // An owner or admin can only be changed by an owner; the role list reflects that.
  const roles = assignableRoles(myRole)
  const options = roles.includes(member.role) ? roles : [member.role, ...roles]

  if (confirmingRemove) {
    return (
      <Dialog
        open
        onClose={() => (busy ? undefined : setConfirmingRemove(false))}
        title={`Remove ${member.name} from ${groupName}?`}
        description="They're signed out of this group at once. Their name stays on everything they did, and you can invite them again later."
        footer={
          <>
            <Button onClick={() => setConfirmingRemove(false)} disabled={busy}>
              Keep {member.name.split(' ')[0]}
            </Button>
            <Button
              variant="danger"
              className="border-ro-dot"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Remove from group
            </Button>
          </>
        }
      >
        {problem.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problem.form}
          </p>
        ) : (
          <p className="text-text-2">
            {member.email} · {ROLE_INFO[member.role].label}
          </p>
        )}
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onClose={() => (busy ? undefined : onClose())}
      title={member.name}
      description={member.email}
      footer={
        <>
          <Button
            variant="ghost"
            className="text-ro sm:mr-auto"
            onClick={() => {
              setProblem({})
              setConfirmingRemove(true)
            }}
            disabled={busy}
          >
            Remove from group
          </Button>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {problem.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problem.form}
          </p>
        ) : null}
        <SelectField
          label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as MemberRole)}
          options={roleOptions(options)}
          hint={ROLE_INFO[role].summary}
          data-autofocus
        />
        <AccessPicker
          role={role}
          value={access}
          onChange={(value) => {
            setAccess(value)
            setProblem({})
          }}
          canGrantWholeGroup={canGrantWholeGroup}
          error={problem.access}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-2">Staff PIN</span>
          {member.hasPin && !resetPin.isSuccess ? (
            confirmingReset ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-text-2">
                  Reset {member.name.split(' ')[0]}'s PIN? They'll set a new one.
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  className="max-lg:h-11"
                  loading={resetPin.isPending}
                  onClick={() => resetPin.mutate()}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="max-lg:h-11"
                  onClick={() => setConfirmingReset(false)}
                >
                  Keep
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-text-2">Set. Used on shared devices.</span>
                <Button size="sm" className="max-lg:h-11" onClick={() => setConfirmingReset(true)}>
                  Reset PIN
                </Button>
              </div>
            )
          ) : (
            <span className="text-text-2">
              Not set. They set it from their account menu after signing in.
            </span>
          )}
        </div>
      </form>
    </Dialog>
  )
}
