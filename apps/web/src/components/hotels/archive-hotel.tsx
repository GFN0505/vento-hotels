// Archive a hotel (spec: "Archive a hotel"), at the foot of its settings for people who manage
// setup. The dialog says what archiving does from the API's preview, lists anything that blocks
// it, and always asks why.
import { type UseQueryResult, useMutation, useQuery } from '@tanstack/react-query'
import type { ArchivePreview, Property } from '@vento/shared'
import { Archive } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { toast } from 'sonner'
import { useProperty } from '@/components/shell/property-context'
import { Button } from '@/components/ui/button'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { archiveSummary } from './format'
import { useSetupRefresh } from './queries'

export function ArchiveHotel({ hotel, online }: { hotel: Property; online: boolean }) {
  const [asking, setAsking] = useState(false)
  const aboutId = useId()
  return (
    <section
      aria-labelledby={`${aboutId}-title`}
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-ro-dot/40 bg-surface p-4 sm:px-5"
    >
      <div className="flex min-w-0 grow basis-72 flex-col gap-0.5">
        <h2 id={`${aboutId}-title`} className="font-semibold text-ro">
          Archive hotel
        </h2>
        <p id={aboutId} className="text-text-2">
          For a hotel that has closed. It leaves the hotel switch; its rooms, history and reports
          are kept, and you can restore it.
        </p>
      </div>
      <Button
        variant="danger"
        className="max-lg:h-11"
        disabled={!online}
        aria-describedby={aboutId}
        onClick={() => setAsking(true)}
      >
        <Archive className="size-4" aria-hidden="true" />
        Archive hotel
      </Button>
      {asking ? <ArchiveDialog hotel={hotel} onClose={() => setAsking(false)} /> : null}
    </section>
  )
}

function ArchiveDialog({ hotel, onClose }: { hotel: Property; onClose: () => void }) {
  const me = useMe()
  const refresh = useSetupRefresh()
  const { properties, canSeeAll, select, selectAll } = useProperty()
  const preview = useQuery(orpc.properties.archivePreview.queryOptions({ input: { id: hotel.id } }))
  const archive = useMutation({
    mutationFn: (reason: string) => api.properties.archive({ id: hotel.id, reason }),
    onSuccess: async (archived) => {
      const remaining = properties.filter((p) => p.id !== hotel.id)
      await refresh()
      toast.success(`${archived.name} archived`)
      onClose()
      // The switch leaves the archived hotel: the whole group, or the one hotel left.
      if (canSeeAll && remaining.length > 1) selectAll()
      else if (remaining[0]) select(remaining[0].id)
    },
  })
  const group = me.data?.organization.name ?? 'The group'
  const data = preview.data
  const blocked = Boolean(data && (data.lastHotel || data.blockers.length > 0))

  return (
    <ReasonDialog
      open
      title={`Archive ${hotel.name}?`}
      label="Reason for archiving"
      confirmLabel={`Archive ${hotel.name}`}
      destructive
      blocked={blocked || preview.isError}
      pending={archive.isPending}
      error={archive.error ? problemMessage(archive.error) : undefined}
      onConfirm={(reason) => archive.mutate(reason)}
      onClose={onClose}
    >
      <ArchivePreviewBody hotel={hotel} preview={preview} group={group} />
    </ReasonDialog>
  )
}

function ArchivePreviewBody({
  hotel,
  preview,
  group,
}: {
  hotel: Property
  preview: UseQueryResult<ArchivePreview>
  group: string
}) {
  const data = preview.data
  if (!data) {
    return preview.isError ? (
      <p role="alert" className="text-ro">
        {problemMessage(preview.error)}
      </p>
    ) : (
      <div
        role="status"
        aria-label="Checking what archiving affects"
        className="flex flex-col gap-2"
      >
        {['w-full', 'w-11/12', 'w-3/4'].map((width) => (
          <span key={width} className={`h-4 ${width} animate-pulse rounded-sm bg-surface-2`} />
        ))}
      </div>
    )
  }
  if (data.lastHotel) {
    return (
      <p role="alert" className="rounded-sm bg-am-bg px-3 py-2 text-am">
        {group} needs at least one hotel.
      </p>
    )
  }
  if (data.blockers.length > 0) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-sm bg-am-bg px-3 py-2.5 text-am">
        <p className="font-medium">{hotel.name} can't be archived yet:</p>
        <ul className="list-disc pl-5">
          {data.blockers.map((blocker) => (
            <li key={blocker.code}>{blocker.label}</li>
          ))}
        </ul>
      </div>
    )
  }
  const [lead, ...effects] = archiveSummary(data)
  return (
    <div className="flex flex-col gap-2 text-text-2">
      <p>{lead}</p>
      <ul className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 px-3.5 py-2.5">
        {effects.map((line) => (
          <li key={line}>{withCount(line)}</li>
        ))}
      </ul>
    </div>
  )
}

// "Its 72 rooms, history…" with "72 rooms" in semibold, so the counts stand out.
function withCount(line: string): ReactNode {
  const match = /\d[\d,]* \w+/.exec(line)
  if (!match) return line
  return (
    <>
      {line.slice(0, match.index)}
      <span className="font-semibold text-text">{match[0]}</span>
      {line.slice(match.index + match[0].length)}
    </>
  )
}
