// Shown across the top while an owner previews the app as another role, so it's never mistaken
// for their own view, with a one-click way back.
import { ROLE_INFO } from '@vento/shared'
import { Eye } from 'lucide-react'
import { useMe } from '@/lib/me'
import { useViewAs } from '@/lib/view-as'

export function PreviewBanner() {
  const me = useMe()
  const { setViewAs } = useViewAs()
  if (!me.previewing) return null
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center gap-3 bg-am-bg px-4 py-1.5 text-am sm:px-6"
    >
      <Eye className="size-4 flex-none" aria-hidden="true" />
      <span className="min-w-0 grow truncate">
        <span className="font-semibold">Viewing as {ROLE_INFO[me.previewing].label}.</span>
        <span className="max-sm:hidden">
          {' '}
          Menus and pages as they'd see them. Anything you do still uses your own access.
        </span>
      </span>
      <button
        type="button"
        onClick={() => setViewAs(undefined)}
        aria-label="Stop previewing"
        className="inline-flex min-h-11 flex-none items-center font-semibold underline underline-offset-2 lg:min-h-8"
      >
        <span className="sm:hidden" aria-hidden="true">
          Stop
        </span>
        <span className="max-sm:hidden" aria-hidden="true">
          Stop previewing
        </span>
      </button>
    </div>
  )
}
