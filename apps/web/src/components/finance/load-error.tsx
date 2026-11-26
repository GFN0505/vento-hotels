// The finance pages' load error (design #27 TaxError): what failed, that nothing changed, and Try again.
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = { title: string; body: string; onRetry: () => void; retrying: boolean }

export function FinanceLoadError({ title, body, onRetry, retrying }: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-card"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-ro-bg text-ro ring-1 ring-border">
        <AlertTriangle className="size-5" aria-hidden="true" strokeWidth={1.8} />
      </span>
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="max-w-sm text-text-2">{body}</p>
      <Button onClick={onRetry} loading={retrying} className="max-lg:h-11">
        Try again
      </Button>
    </div>
  )
}
