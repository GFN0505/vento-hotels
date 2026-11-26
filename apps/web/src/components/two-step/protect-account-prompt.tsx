// On Home for owners and group admins without two-step sign-in: one calm card, dismissible for
// this browser (decision 0023). Their password opens the whole group, so it's worth two minutes.
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useMe } from '@/lib/me'
import { TwoStepDialog } from './two-step-dialog'

const DISMISSED = 'vento.twoStepPromptDismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

export function ProtectAccountPrompt() {
  const me = useMe()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [open, setOpen] = useState(false)
  const role = me.real.role
  const show =
    !dismissed &&
    !me.data?.device &&
    me.data?.twoStep === false &&
    (role === 'owner' || role === 'group_admin')
  if (!show && !open) return null

  return (
    <>
      {show ? (
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
          <ShieldCheck className="size-5 flex-none text-pri-ink" aria-hidden="true" />
          <div className="flex min-w-0 grow basis-64 flex-col">
            <span className="font-medium">Protect your account with two-step sign-in</span>
            <span className="text-text-2">
              Your password opens the whole group. A code from your phone stops a stolen password on
              its own.
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="max-lg:h-11"
              onClick={() => {
                setDismissed(true)
                try {
                  localStorage.setItem(DISMISSED, '1')
                } catch {
                  // Storage blocked: it just shows again next time.
                }
              }}
            >
              Not now
            </Button>
            <Button variant="primary" className="max-lg:h-11" onClick={() => setOpen(true)}>
              Turn on
            </Button>
          </div>
        </Card>
      ) : null}
      <TwoStepDialog open={open} onClose={() => setOpen(false)} isOn={false} />
    </>
  )
}
