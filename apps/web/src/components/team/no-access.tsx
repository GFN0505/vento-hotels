// What someone sees on a settings page their role can't use (design: Access · no access).
import { Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function NoAccess({ what }: { what: string }) {
  return (
    <Card className="flex flex-col items-start gap-2 p-6">
      <Lock className="size-5 text-text-3" aria-hidden="true" />
      <h1 className="text-lg font-semibold">You don't have access to {what}</h1>
      <p className="text-text-2">Ask an owner if you need it.</p>
    </Card>
  )
}
