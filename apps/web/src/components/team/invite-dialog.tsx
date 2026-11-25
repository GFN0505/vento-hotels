// Invite people (design #25, SetInvite): emails, one role, which hotels. Email only for now;
// WhatsApp invites wait on a provider (docs/DOMAIN.md open questions).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type AccessChoice, type MemberRole, ROLE_INFO } from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { SelectField } from '@/components/ui/select-field'
import { api, orpc } from '@/lib/api'
import { emailProblem } from '@/lib/email'
import { problemMessage } from '@/lib/errors'
import { assignableRoles, roleOptions, splitEmails } from '@/lib/team'
import { AccessPicker } from './access-picker'

type InviteDialogProps = {
  open: boolean
  onClose: () => void
  myRole: MemberRole | undefined
  canGrantWholeGroup: boolean
}

const MAX_INVITES = 20

export function InviteDialog({ open, onClose, myRole, canGrantWholeGroup }: InviteDialogProps) {
  const queryClient = useQueryClient()
  const formId = useId()
  const emailsId = useId()
  const emailsHelpId = useId()
  const [emailsText, setEmailsText] = useState('')
  const [role, setRole] = useState<MemberRole>('front_desk')
  const [access, setAccess] = useState<AccessChoice>(
    canGrantWholeGroup ? { allProperties: true } : { allProperties: false, propertyIds: [] },
  )
  const [problems, setProblems] = useState<{
    emails?: string | undefined
    access?: string | undefined
    form?: string | undefined
  }>({})

  const emails = splitEmails(emailsText)
  const invite = useMutation({
    mutationFn: () => api.invitations.create({ emails, role, access }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: orpc.invitations.key() })
      if (result.invited > 0) {
        toast.success(
          result.invited === 1
            ? `Invite sent to ${emails.find((e) => !result.alreadyMembers.includes(e) && !result.notSent.includes(e))}`
            : `${result.invited} invites sent`,
        )
      }
      if (result.notSent.length > 0) {
        toast.warning(
          `Saved, but we couldn't email ${result.notSent.join(', ')}. Use Resend under Invited.`,
        )
      }
      if (result.alreadyMembers.length > 0) {
        toast.info(`Already in your group: ${result.alreadyMembers.join(', ')}`)
      }
      reset()
      onClose()
    },
    onError: (error) => setProblems({ form: problemMessage(error) }),
  })

  function reset() {
    setEmailsText('')
    setProblems({})
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const bad = emails.filter((email) => emailProblem(email))
    const found = {
      emails:
        emails.length === 0
          ? 'Enter at least one email'
          : bad.length > 0
            ? bad.length === 1
              ? `${bad[0]} isn't a valid email address. Fix or remove it.`
              : `These aren't valid email addresses: ${bad.join(', ')}. Fix or remove them.`
            : emails.length > MAX_INVITES
              ? `Invite up to ${MAX_INVITES} people at a time`
              : undefined,
      access:
        !access.allProperties && access.propertyIds.length === 0
          ? 'Choose at least one hotel'
          : undefined,
    }
    setProblems(found)
    if (found.emails) {
      document.getElementById(emailsId)?.focus()
      return
    }
    if (found.access) return
    invite.mutate()
  }

  // Only addresses that look right count towards the button's "Send 3 invites".
  const count = emails.filter((email) => !emailProblem(email)).length
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!invite.isPending) onClose()
      }}
      title="Invite people"
      description="They'll get an email with a link to join. Invites expire in 7 days."
      footer={
        <>
          <Button onClick={onClose} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={invite.isPending}>
            {count > 1 ? `Send ${Math.min(count, MAX_INVITES)} invites` : 'Send invite'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {problems.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problems.form}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailsId} className="text-sm font-medium text-text-2">
            Emails
          </label>
          <textarea
            id={emailsId}
            value={emailsText}
            onChange={(event) => {
              setEmailsText(event.target.value)
              if (problems.emails) setProblems((p) => ({ ...p, emails: undefined }))
            }}
            rows={3}
            // Ready to type or paste as soon as the dialog opens.
            data-autofocus
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. ada.nwosu@korahotels.ng, chidi.eze@korahotels.ng"
            aria-invalid={problems.emails ? true : undefined}
            aria-describedby={emailsHelpId}
            className="w-full resize-y rounded-sm border border-input bg-surface px-2.5 py-2 text-[16px] text-text placeholder:text-text-3 focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none aria-invalid:border-ro-dot lg:text-base"
          />
          <p
            id={emailsHelpId}
            className={problems.emails ? 'text-sm text-ro' : 'text-sm text-text-3'}
            aria-live="polite"
          >
            {problems.emails ?? 'Separate several with commas or new lines, up to 20.'}
          </p>
        </div>
        <SelectField
          label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as MemberRole)}
          options={roleOptions(assignableRoles(myRole))}
          hint={
            <>
              {ROLE_INFO[role].summary} Details in{' '}
              <Link
                to="/settings/permissions"
                className="text-pri-ink underline underline-offset-2"
              >
                Permissions and limits
              </Link>
              .
            </>
          }
        />
        <AccessPicker
          role={role}
          value={access}
          onChange={(value) => {
            setAccess(value)
            if (problems.access) setProblems((p) => ({ ...p, access: undefined }))
          }}
          canGrantWholeGroup={canGrantWholeGroup}
          error={problems.access}
        />
      </form>
    </Dialog>
  )
}
