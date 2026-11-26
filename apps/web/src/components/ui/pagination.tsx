// "1–100 of 240 · Previous · Next" under a server-paginated list (non-negotiable 8).
import { Button } from './button'

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  if (total <= pageSize) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return (
    <nav aria-label="Pages" className="flex items-center justify-end gap-3">
      <span className="num text-sm text-text-2">
        {first}–{last} of {total}
      </span>
      <Button
        size="sm"
        className="max-lg:h-11"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <Button
        size="sm"
        className="max-lg:h-11"
        disabled={last >= total}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}
