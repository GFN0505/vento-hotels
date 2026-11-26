// Set or change your staff PIN for shared devices (decision 0022). Asks for your password, so
// nobody can set it for you at a computer you left signed in.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pinProblem } from '@vento/shared'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'

type Problems = {
  pin?: string | undefined
  confirm?: string | undefined
  password?: string | undefined
  form?: string | undefined
}

export function SetPinDialog({
  open,
  onClose,
  hasPin,
}: {
  open: boolean
  onClose: () => void
  hasPin: boolean
}) {
  const queryClient = useQueryClient()
  const formId = useId()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [problems, setProblems] = useState<Problems>({})

  const save = useMutation({
    mutationFn: () => api.pins.set({ pin, password }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.organization.key() })
      toast.success('Staff PIN saved')
      close()
    },
    onError: (error) => setProblems({ form: problemMessage(error) }),
  })

  function close() {
    setPin('')
    setConfirm('')
    setPassword('')
    setProblems({})
    onClose()
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {
      pin: pinProblem(pin),
      confirm: confirm !== pin ? "PINs don't match. Type it again." : undefined,
      password: password ? undefined : 'Enter your password',
    }
    setProblems(found)
    const first = (['pin', 'confirm', 'password'] as const).find((key) => found[key])
    if (first) {
      ;(event.currentTarget.elements.namedItem(first) as HTMLInputElement | null)?.focus()
      return
    }
    save.mutate()
  }

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 4)
  return (
    <Dialog
      open={open}
      onClose={() => (save.isPending ? undefined : close())}
      title={hasPin ? 'Change your staff PIN' : 'Set your staff PIN'}
      description="4 digits, for signing in on your hotel's shared tablets, PCs and phones. Keep it to yourself."
      footer={
        <>
          <Button onClick={close} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending}>
            Save PIN
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
        <Field
          label="New PIN"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          revealable
          data-autofocus
          value={pin}
          onChange={(event) => setPin(digitsOnly(event.target.value))}
          hint="Avoid 1234 or one digit repeated."
          validate={(value) => (value ? pinProblem(value) : undefined)}
          error={problems.pin}
        />
        <Field
          label="Type the PIN again"
          name="confirm"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={confirm}
          onChange={(event) => setConfirm(digitsOnly(event.target.value))}
          validate={(value) =>
            value && value !== pin ? "PINs don't match. Type it again." : undefined
          }
          error={problems.confirm}
        />
        <Field
          label="Your password"
          name="password"
          type="password"
          autoComplete="current-password"
          revealable
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={problems.password}
        />
      </form>
    </Dialog>
  )
}
