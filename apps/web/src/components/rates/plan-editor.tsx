// The rate plan editor (design #33): price, room types and standard prices, terms and who can book
// on the left; the live preview, change history and archive on the right. One Save for the page
// (⌘S), in the header on wider screens and in a bar at the foot on phones.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { RatePlanView, RatesOverview } from '@vento/shared'
import { Copy, Info, Link2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { LeaveConfirm } from '@/components/hotels/leave-confirm'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { useOnline } from '@/offline/connection'
import { EditorAudience } from './editor-audience'
import { EditorDanger } from './editor-danger'
import { EditorHistory } from './editor-history'
import { EditorPreview, useParentPrices } from './editor-preview'
import { EditorPrice } from './editor-price'
import { EditorRoomTypes } from './editor-room-types'
import { EditorTerms } from './editor-terms'
import { CHANGE_DENIED, NEEDS_CONNECTION } from './format'
import { BackToPlans } from './plan-editor-page'
import { PlanBadges } from './plan-row'
import { ownPricesFromPreview, previewRows } from './preview-model'
import { RatesOffline } from './states'
import { usePlanForm } from './use-plan-form'

type Props = {
  overview: RatesOverview
  plan: RatePlanView | undefined
  copy: boolean
  plans: readonly RatePlanView[]
  addRoomTypes: readonly string[]
}

const FORM_ID = 'plan-form'

export function PlanEditor({ overview, plan, copy, plans, addRoomTypes }: Props) {
  const online = useOnline()
  const state = usePlanForm({ overview, plan, copy, addRoomTypes })
  const { base, form, problems } = state
  const canEdit = overview.canEdit
  const readOnly = !canEdit || !online || Boolean(base?.archivedAt)
  const parents = plans.filter((p) => p.pricing === 'own' && !p.archivedAt && p.id !== base?.id)
  const parent =
    form.pricing === 'derived' ? parents.find((p) => p.id === form.parentId) : undefined
  const fresh = useQuery({
    ...orpc.ratePlans.get.queryOptions({ input: { id: base?.id ?? '' } }),
    enabled: false,
  })
  const tonight = useParentPrices(overview, parent?.id)
  const fillOwnPrices = () => {
    const prices = ownPricesFromPreview(previewRows(form, state.typeIds, tonight.prices))
    for (const [id, weekday] of Object.entries(prices)) {
      if (!form.rows[id]?.weekday) state.setRow(id, { weekday })
    }
  }
  const banner = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (problems.form) banner.current?.focus()
  }, [problems.form])
  // ⌘S / Ctrl+S saves, as in the design.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (!readOnly && !state.saving) state.submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const title = base ? `Rate plan · ${base.name}` : copy ? 'New rate plan · copy' : 'New rate plan'
  const subtitle = base?.parent
    ? `Derived from ${base.parent.name}`
    : base
      ? 'Own prices'
      : 'Own prices, or derived from a plan you already have'
  const saveButton = (wide: boolean) => (
    <Button
      type="submit"
      form={FORM_ID}
      variant="primary"
      size="lg"
      className={wide ? 'max-md:hidden' : 'grow'}
      disabled={readOnly || state.stale}
      loading={state.saving}
      aria-keyshortcuts="Meta+S Control+S"
    >
      Save plan
      {wide ? (
        <span
          aria-hidden="true"
          className="num ml-1 rounded-[4px] bg-black/20 px-1 text-xs text-white"
        >
          ⌘S
        </span>
      ) : null}
    </Button>
  )
  return (
    <div className="flex flex-col gap-5">
      <BackToPlans />
      <PageHeader
        title={<span className="break-words">{title}</span>}
        badge={
          base ? (
            <span className="flex flex-wrap gap-1.5">
              {base.archivedAt ? <StatusBadge>Archived</StatusBadge> : null}
              <PlanBadges plan={base} />
            </span>
          ) : null
        }
        description={
          <span className="inline-flex items-center gap-1.5">
            {base?.parent ? <Link2 className="size-3.5 text-text-3" aria-hidden="true" /> : null}
            {subtitle}
          </span>
        }
        actions={
          canEdit ? (
            <>
              {base && !base.archivedAt ? (
                <Link
                  to="/rates/plans/new"
                  search={{ copy: base.id }}
                  className="inline-flex h-11 items-center gap-1.5 rounded-sm px-3 font-medium text-text-2 hover:bg-surface-3 lg:h-10"
                >
                  <Copy className="size-4" aria-hidden="true" />
                  Duplicate
                </Link>
              ) : null}
              {state.dirty && !readOnly ? (
                <span className="self-center text-sm text-text-2 max-md:hidden" role="status">
                  Unsaved changes
                </span>
              ) : null}
              {saveButton(true)}
            </>
          ) : null
        }
      />
      <RatesOffline />
      {canEdit ? null : (
        <p className="-mt-2 flex items-start gap-2 text-text-2">
          <Info className="mt-0.5 size-4 flex-none text-text-3" aria-hidden="true" />
          {CHANGE_DENIED}
        </p>
      )}
      {problems.form ? (
        <div
          ref={banner}
          tabIndex={-1}
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-ro-bg px-4 py-3 text-ro outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="grow">{problems.form}</p>
          {state.stale && base ? (
            <Button
              className="max-lg:h-11"
              loading={fresh.isFetching}
              onClick={async () => {
                const result = await fresh.refetch()
                if (result.data) state.reloaded(result.data)
              }}
            >
              Reload
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form
          id={FORM_ID}
          onSubmit={state.submit}
          noValidate
          className="flex min-w-0 flex-col gap-5"
        >
          <EditorPrice
            state={state}
            parents={parents}
            readOnly={readOnly}
            onOwnPrices={fillOwnPrices}
          />
          <EditorRoomTypes
            state={state}
            roomTypes={overview.roomTypes}
            parent={parent}
            readOnly={readOnly}
          />
          <EditorTerms state={state} readOnly={readOnly} />
          <EditorAudience state={state} readOnly={readOnly} />
        </form>
        <div className="flex flex-col gap-5 lg:sticky lg:top-4">
          <EditorPreview overview={overview} form={form} parent={parent} />
          {base && canEdit ? <EditorHistory planId={base.id} /> : null}
          {base && canEdit ? <EditorDanger plan={base} canWrite={online} /> : null}
        </div>
      </div>
      {canEdit ? (
        <div className="sticky bottom-0 z-20 -mx-4 flex items-center gap-3 border-t border-border bg-surface px-4 py-3 md:hidden">
          {!online ? <p className="text-text-2">{NEEDS_CONNECTION}</p> : null}
          {saveButton(false)}
        </div>
      ) : null}
      <LeaveConfirm
        dirty={state.dirty && !state.saving}
        name={base?.name ?? 'the new plan'}
        onDiscard={state.discard}
      />
      {state.dialogs}
    </div>
  )
}
