// What someone sees on a page their role can't use (design: Access · no access): the same header
// as every page (scope line, focusable title), then who to ask.
import { Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

export function NoAccess({
  what,
  ask = 'Ask an owner if you need it.',
}: {
  what: string
  ask?: string
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`You don't have access to ${what}`} />
      <Card className="flex items-start gap-3 p-5">
        <Lock className="mt-0.5 size-5 flex-none text-text-3" aria-hidden="true" />
        <p className="text-text-2">{ask}</p>
      </Card>
    </div>
  )
}
