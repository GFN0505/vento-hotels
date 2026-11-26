// Permissions and limits (design #26): every role × action, from Vento's default plus this
// group's changes. Owners change a rule with a reason; it's in the audit log. Phones show one role
// at a time (PermRoleM).

import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  MEMBER_ROLES,
  type MemberRole,
  PERMISSION_GROUPS,
  type Permission,
  type PermissionRuleView,
  ROLE_INFO,
} from '@vento/shared'
import { useState } from 'react'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { EditRuleDialog } from '@/components/team/edit-rule-dialog'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SelectField } from '@/components/ui/select-field'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { useMediaQuery } from '@/lib/media'
import { formatLimit } from '@/lib/team'

export const Route = createFileRoute('/_app/settings/permissions')({
  // The tab title as soon as navigation starts (components/shell/route-title.ts).
  staticData: { title: 'Permissions and limits', groupWide: true },
  component: PermissionsPage,
})

type Rules = Map<string, PermissionRuleView>
const keyOf = (role: MemberRole, permission: Permission) => `${role}:${permission}`

// How a rule reads, and what a screen reader says for it.
function describeRule(rule: PermissionRuleView): { short: string; spoken: string } {
  if (!rule.allowed) return { short: '–', spoken: 'Not allowed' }
  if (rule.limit !== null) {
    const short = formatLimit(rule.limitKind, rule.limit)
    return { short, spoken: `Allowed up to ${short.replace('≤', '')}` }
  }
  return { short: '✓', spoken: 'Allowed' }
}

function PermissionsPage() {
  // Group-wide: permissions are per role, the same at every hotel (spec: hotel switch).
  useScopedTitle('Permissions and limits', { groupWide: true })
  const me = useMe()
  const canView = me.can('setup.manage') || me.can('permissions.manage')
  const canEdit = me.can('permissions.manage')
  const rules = useQuery({ ...orpc.permissions.list.queryOptions(), enabled: canView })
  const [view, setView] = useState<'grid' | 'role'>('grid')
  const wide = useMediaQuery('(min-width: 1024px)')
  const [editing, setEditing] = useState<PermissionRuleView>()

  if (me.isPending) return <Skeleton />
  if (!canView) return <NoAccess what="permissions and limits" />

  const byKey: Rules = new Map(
    (rules.data?.items ?? []).map((rule) => [keyOf(rule.role, rule.permission), rule]),
  )
  const changed = rules.data?.items.filter((rule) => !rule.isDefault).length ?? 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        scope="group-wide"
        title="Permissions and limits"
        description={
          <>
            What each role may do, and how far. {MEMBER_ROLES.length} roles,{' '}
            {PERMISSION_GROUPS.flatMap((g) => g.permissions).length} actions
            {changed > 0 ? `, ${changed} changed from Vento's default` : ''}.
            <span className="mt-1 block">
              Permissions are set per role and apply at every hotel. Which hotels each person sees
              is set in{' '}
              <Link to="/settings/members" className="text-pri-ink underline underline-offset-2">
                Members and roles
              </Link>
              .
            </span>
          </>
        }
        actions={
          <fieldset className="hidden gap-1 lg:flex">
            <legend className="sr-only">View</legend>
            {(
              [
                ['grid', 'Grid'],
                ['role', 'By role'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                aria-pressed={view === value}
                className={cn(view === value && 'border-pri bg-pri-soft text-pri-ink')}
                onClick={() => setView(value)}
              >
                {label}
              </Button>
            ))}
          </fieldset>
        }
      />
      <p className="rounded-sm bg-bl-bg px-3 py-2 text-bl">
        {canEdit
          ? 'Only owners can change these. Every change needs a reason and is recorded in the audit log.'
          : 'Only owners can change these. Ask an owner if a role needs more, or less.'}
      </p>

      {rules.isPending ? (
        <Skeleton />
      ) : rules.isError ? (
        <Card className="flex flex-col items-start gap-3 p-5" role="alert">
          <p className="font-medium">We couldn't load permissions.</p>
          <p className="text-text-2">
            {problemMessage(rules.error)} Nothing changed: staff keep the limits in force.
          </p>
          <Button onClick={() => rules.refetch()}>Try again</Button>
        </Card>
      ) : (
        <>
          <Legend showCodes={wide && view === 'grid'} />
          {/* Phones only ever get one role at a time; the 384-cell grid isn't even rendered. */}
          {wide && view === 'grid' ? (
            <Grid rules={byKey} canEdit={canEdit} onEdit={setEditing} />
          ) : (
            <ByRole rules={byKey} canEdit={canEdit} onEdit={setEditing} />
          )}
        </>
      )}

      {editing ? (
        <EditRuleDialog
          key={keyOf(editing.role, editing.permission)}
          rule={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  )
}

type ViewProps = { rules: Rules; canEdit: boolean; onEdit: (rule: PermissionRuleView) => void }

function Grid({ rules, canEdit, onEdit }: ViewProps) {
  return (
    <div className="relative">
      <Card className="relative overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Permissions by role. Columns are roles, rows are actions.
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-sm font-medium text-text-3"
              >
                Action
              </th>
              {MEMBER_ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  title={ROLE_INFO[role].label}
                  className="px-1.5 py-2.5 text-center text-xs font-semibold text-text-2"
                >
                  <span aria-hidden="true">{ROLE_INFO[role].code}</span>
                  <span className="sr-only">{ROLE_INFO[role].label}</span>
                </th>
              ))}
            </tr>
          </thead>
          {PERMISSION_GROUPS.map((group) => (
            <tbody key={group.label}>
              <tr>
                <th
                  colSpan={MEMBER_ROLES.length + 1}
                  scope="colgroup"
                  className="bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-[0.05em] text-text-3 uppercase"
                >
                  {group.label}
                </th>
              </tr>
              {group.permissions.map((permission) => {
                const label = rules.get(keyOf('owner', permission))?.label ?? permission
                return (
                  <tr key={permission} className="border-t border-border">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 w-56 min-w-56 bg-surface px-4 py-1.5 font-normal"
                    >
                      {label}
                    </th>
                    {MEMBER_ROLES.map((role) => {
                      const rule = rules.get(keyOf(role, permission))
                      return (
                        <td key={role} className="px-0.5 py-0.5 text-center">
                          {rule ? (
                            <RuleCell
                              rule={rule}
                              canEdit={canEdit && role !== 'owner'}
                              onEdit={onEdit}
                            />
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </Card>
      {/* A soft edge says there are more roles to scroll to. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-md bg-linear-to-l from-surface to-transparent"
      />
    </div>
  )
}

function RuleCell({
  rule,
  canEdit,
  onEdit,
}: {
  rule: PermissionRuleView
  canEdit: boolean
  onEdit: (rule: PermissionRuleView) => void
}) {
  const { short, spoken } = describeRule(rule)
  const content = (
    <>
      <span aria-hidden="true" className={cn(!rule.allowed && 'text-text-3')}>
        {short}
      </span>
      {rule.isDefault ? null : (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 size-1.5 rounded-full bg-am-dot"
        />
      )}
    </>
  )
  const name = `${ROLE_INFO[rule.role].label}, ${rule.label}: ${spoken}${rule.isDefault ? '' : ", changed from Vento's default"}`
  const className = cn(
    'num relative inline-grid h-8 min-w-12 place-items-center rounded-sm px-1.5 text-sm whitespace-nowrap',
    rule.allowed && rule.limit !== null && 'bg-am-bg text-am',
    rule.allowed && rule.limit === null && 'text-em',
  )
  if (!canEdit) {
    return (
      <span className={className}>
        {content}
        <span className="sr-only">{name}</span>
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onEdit(rule)}
      aria-label={`${name}. Change`}
      className={cn(className, 'hover:ring-2 hover:ring-pri-line')}
    >
      {content}
    </button>
  )
}

function ByRole({ rules, canEdit, onEdit }: ViewProps) {
  const [role, setRole] = useState<MemberRole>('front_desk')
  return (
    <div className="flex flex-col gap-4">
      <div className="sm:max-w-xs">
        <SelectField
          label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as MemberRole)}
          options={MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_INFO[r].label }))}
        />
      </div>
      {PERMISSION_GROUPS.map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold tracking-[0.05em] text-text-3 uppercase">
            {group.label}
          </h2>
          <Card>
            <ul className="divide-y divide-border">
              {group.permissions.map((permission) => {
                const rule = rules.get(keyOf(role, permission))
                if (!rule) return null
                const { short, spoken } = describeRule(rule)
                return (
                  <li key={permission} className="flex min-h-12 items-center gap-3 px-4 py-2">
                    <span className="grow">{rule.label}</span>
                    {rule.isDefault ? null : <span className="text-xs text-am">Changed</span>}
                    <span
                      className={cn(
                        'num text-sm whitespace-nowrap',
                        !rule.allowed && 'text-text-3',
                      )}
                    >
                      <span aria-hidden="true">{short}</span>
                      <span className="sr-only">{spoken}</span>
                    </span>
                    {canEdit && role !== 'owner' ? (
                      <Button
                        size="sm"
                        className="max-lg:h-11"
                        onClick={() => onEdit(rule)}
                        aria-label={`Change ${rule.label} for ${ROLE_INFO[role].label}`}
                      >
                        Change
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}

function Legend({ showCodes }: { showCodes: boolean }) {
  return (
    <div className="flex flex-col gap-3 text-sm text-text-2">
      <p className="flex flex-wrap gap-x-5 gap-y-1">
        <span>
          <span className="text-em">✓</span> allowed
        </span>
        <span>
          <span className="rounded-sm bg-am-bg px-1 text-am">≤10%</span> allowed up to the limit;
          above it a manager approves
        </span>
        <span>– not allowed</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-am-dot" aria-hidden="true" /> changed from
          Vento's default
        </span>
      </p>
      <p className={cn('flex-wrap gap-x-4 gap-y-1 text-text-3', showCodes ? 'flex' : 'hidden')}>
        {MEMBER_ROLES.map((role) => (
          <span key={role} className="whitespace-nowrap">
            <span className="font-semibold text-text-2">{ROLE_INFO[role].code}</span>{' '}
            {ROLE_INFO[role].label}
          </span>
        ))}
      </p>
    </div>
  )
}

function Skeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading permissions" className="flex flex-col gap-2 p-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-6 animate-pulse rounded-sm bg-surface-2" />
      ))}
    </Card>
  )
}
