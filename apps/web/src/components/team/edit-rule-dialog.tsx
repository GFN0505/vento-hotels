// Change one rule (design #26, the side panel): allowed or not, the limit, and a reason. Saved as
// the group's own rule and recorded in the audit log. Approvers above the limit arrive in brick 10.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { defaultRule, type PermissionRuleView, ROLE_INFO } from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { formatLimit } from '@/lib/team'

const LIMIT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/

function limitProblem(kind: PermissionRuleView['limitKind'], value: string): string | undefined {
  const text = value.trim().replace(/,/g, '')
  if (text === '') return undefined
  if (!LIMIT_PATTERN.test(text))
    return kind === 'percent' ? 'Enter a number, like 10' : 'Enter an amount, like 100000'
  if (kind === 'percent' && Number(text) > 100) return 'A percentage can be at most 100'
  return undefined
}

export function EditRuleDialog({
  rule,
  onClose,
}: {
  rule: PermissionRuleView
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const formId = useId()
  const allowedId = useId()
  const [allowed, setAllowed] = useState(rule.allowed)
  const [limit, setLimit] = useState(rule.limit === null ? '' : String(Number(rule.limit)))
  const [reason, setReason] = useState('')
  const [problems, setProblems] = useState<{
    limit?: string | undefined
    reason?: string | undefined
    form?: string | undefined
  }>({})

  const template = defaultRule(rule.role, rule.permission)
  const templateText = !template.allowed
    ? 'not allowed'
    : template.limit
      ? `allowed up to ${formatLimit(rule.limitKind, template.limit).replace('≤', '')}`
      : 'allowed'

  const save = useMutation({
    mutationFn: () =>
      api.permissions.set({
        role: rule.role,
        permission: rule.permission,
        allowed,
        limit: allowed && rule.limitKind && limit.trim() ? limit.trim().replace(/,/g, '') : null,
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.permissions.key() })
      toast.success(`${ROLE_INFO[rule.role].label}: ${rule.label.toLowerCase()} updated`)
      onClose()
    },
    onError: (error) => setProblems({ form: problemMessage(error) }),
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = {
      limit: allowed && rule.limitKind ? limitProblem(rule.limitKind, limit) : undefined,
      reason: reason.trim().length < 3 ? 'Say why this is changing' : undefined,
    }
    setProblems(found)
    const first = found.limit ? 'limit' : found.reason ? 'reason' : undefined
    if (first) {
      ;(event.currentTarget.elements.namedItem(first) as HTMLInputElement | null)?.focus()
      return
    }
    save.mutate()
  }

  return (
    <Dialog
      open
      onClose={() => (save.isPending ? undefined : onClose())}
      title={`${ROLE_INFO[rule.role].label}: ${rule.label}`}
      description={`Vento's default for ${ROLE_INFO[rule.role].label.toLowerCase()}: ${templateText}.`}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending}>
            Save rule
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
        <label htmlFor={allowedId} className="flex min-h-11 items-center gap-2.5 lg:min-h-8">
          <Checkbox
            data-autofocus
            id={allowedId}
            checked={allowed}
            onChange={(event) => setAllowed(event.target.checked)}
          />
          <span className="font-medium">Allowed</span>
        </label>
        {allowed && rule.limitKind ? (
          <Field
            label={rule.limitKind === 'percent' ? 'Up to (%)' : 'Up to (₦)'}
            name="limit"
            inputMode="decimal"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="No limit"
            hint="Leave empty for no limit. Above the limit, a manager with a higher limit approves."
            validate={(value) => limitProblem(rule.limitKind, value)}
            error={problems.limit}
          />
        ) : null}
        <Field
          label="Reason"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Busy season"
          maxLength={500}
          validate={(value) => (value.trim().length < 3 ? 'Say why this is changing' : undefined)}
          error={problems.reason}
          hint="Shown with your name in the audit log."
        />
      </form>
    </Dialog>
  )
}
