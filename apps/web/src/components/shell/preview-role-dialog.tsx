// Pick a role to preview the app as (owners and group admins). Each role shows its one-line
// summary, so it's clear who you're about to see the app as.
import { MEMBER_ROLES, type MemberRole, ROLE_INFO } from '@vento/shared'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { useViewAs } from '@/lib/view-as'

export function PreviewRoleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { viewAs, setViewAs } = useViewAs()
  // Nothing chosen until you pick, unless you're already previewing a role.
  const [role, setRole] = useState<MemberRole | undefined>(viewAs)
  const name = useId()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Preview as a role"
      description="See the menus and pages someone in this role sees. Anything you do still uses your own access."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!role}
            onClick={() => {
              setViewAs(role)
              onClose()
            }}
          >
            {role ? `Preview as ${ROLE_INFO[role].label}` : 'Choose a role'}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Role</legend>
        {MEMBER_ROLES.filter((r) => r !== 'owner').map((r) => (
          <label
            key={r}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-2',
              role === r && 'bg-pri-soft hover:bg-pri-soft',
            )}
          >
            <input
              type="radio"
              name={name}
              checked={role === r}
              onChange={() => setRole(r)}
              className="mt-0.5 size-4 flex-none accent-[var(--pri)]"
              {...(role === r ? { 'data-autofocus': true } : {})}
            />
            <span className="flex flex-col">
              <span className="font-medium">{ROLE_INFO[r].label}</span>
              <span className="text-sm text-text-2">{ROLE_INFO[r].summary}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  )
}
