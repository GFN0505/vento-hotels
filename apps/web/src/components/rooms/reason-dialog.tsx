// Asked only once the hotel is live (its first night audit has run): changes that move sellable
// rooms carry a reason, recorded with the person's name and shown in the owner's daily report.
import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'

export const REASON_HINT = 'Recorded with your name.'

export function reasonProblem(value: string): string | undefined {
  return value.trim().length < 3 ? 'Say why, in a few words' : undefined
}

type Props = {
  open: boolean
  title: string
  description?: ReactNode
  label: string
  confirmLabel: string
  pending: boolean
  error?: string | undefined
  destructive?: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}

export function ReasonDialog({
  open,
  title,
  description,
  label,
  confirmLabel,
  pending,
  error,
  destructive,
  onConfirm,
  onClose,
}: Props) {
  const formId = useId()
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string>()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = reasonProblem(reason)
    setProblem(found)
    if (found) {
      event.currentTarget.querySelector('input')?.focus()
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose()
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <Field
          label={label}
          value={reason}
          maxLength={500}
          hint={REASON_HINT}
          error={problem}
          validate={reasonProblem}
          onChange={(event) => setReason(event.target.value)}
          data-autofocus
        />
      </form>
    </Dialog>
  )
}
