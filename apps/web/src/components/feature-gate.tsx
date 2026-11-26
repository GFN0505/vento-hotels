// Wraps a module's pages: if the module isn't switched on for this group, show a plain message
// instead (decision 0021). The API refuses its calls too; this just keeps people out of a dead end.

import { Link } from '@tanstack/react-router'
import type { Feature } from '@vento/shared'
import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { useMe } from '@/lib/me'

export function FeatureGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const me = useMe()
  if (me.isPending) return null
  if (me.has(feature)) return <>{children}</>
  return (
    <Card className="flex max-w-xl flex-col items-start gap-2 p-6">
      <Sparkles className="size-5 text-text-3" aria-hidden="true" />
      <h1 className="text-lg font-semibold">This isn't switched on for your group</h1>
      <p className="text-text-2">Ask Vento if you'd like to use it.</p>
      <Link to="/" className="inline-flex min-h-11 items-center text-pri-ink hover:underline">
        Go to home
      </Link>
    </Card>
  )
}
