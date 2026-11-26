// Hotel settings' form state and saving. Each save sends the version the form started from, so it
// never overwrites someone else's change ("Tunde changed Kora Victoria Island at 14:02. Reload…").
// Fresh data from the server replaces the form only while nothing is being edited.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, orpc } from '@/lib/api'
import { errorCode, errorData, problemMessage } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import * as F from './hotel-form-model'
import { useSetupRefresh } from './queries'

const FIELD_FOR_CODE: Record<string, keyof F.HotelForm> = {
  NAME_TAKEN: 'name',
  NAME_ARCHIVED: 'name',
  LGA_NOT_IN_STATE: 'lga',
  TIME_ZONE_FIXED: 'timeZone',
  REASON_REQUIRED: 'reason',
  ENTITY_ARCHIVED: 'entityId',
  ENTITY_NOT_FOUND: 'entityId',
}

// "Adaeze changed …" reads oddly to Adaeze: her own save from another window says so instead.
export function staleMessage(error: unknown, hotelName: string, myName: string): string {
  const data = errorData(error)
  const by = typeof data.changedBy === 'string' ? data.changedBy : undefined
  const at = typeof data.changedAt === 'string' ? data.changedAt : undefined
  if (by && at && by === myName.split(' ')[0]) {
    return `You changed ${hotelName} in another window at ${at}. Reload to see the change, then save again.`
  }
  return problemMessage(error)
}

export function useHotelForm(
  latest: Property,
  reload: () => Promise<Property | undefined>,
  myName: string,
) {
  const queryClient = useQueryClient()
  const refresh = useSetupRefresh()
  const [base, setBase] = useState(latest)
  const [form, setForm] = useState(() => F.formFrom(latest))
  const [problems, setProblems] = useState<F.Problems>({})
  const [stale, setStale] = useState(false)
  const dirty = F.isDirty(base, form)

  // Fresh data arrives. Nothing's being edited: show it all. Something is, and the hotel's fields
  // haven't changed (same version): take what's around them, e.g. its company's details now
  // complete. A newer version waits, so the save is checked against the one the form started from.
  useEffect(() => {
    if (!dirty) {
      setBase(latest)
      if (latest.version !== base.version) setForm(F.formFrom(latest))
    } else if (latest.version === base.version) {
      setBase(latest)
    }
  }, [latest, base.version, dirty])

  function adopt(saved: Property, keepTyping = false) {
    queryClient.setQueryData(orpc.properties.get.queryKey({ input: { id: saved.id } }), saved)
    setBase(saved)
    setForm((typed) =>
      keepTyping
        ? { ...typed, entityId: F.formFrom(saved).entityId, reason: '' }
        : F.formFrom(saved),
    )
    setProblems({})
    setStale(false)
  }

  const save = useMutation({
    mutationFn: () =>
      api.properties.update({ id: base.id, version: base.version, ...F.changesFrom(base, form) }),
    onSuccess: async (saved) => {
      adopt(saved)
      toast.success(`${saved.name} saved`)
      await refresh()
    },
    onError: (error) => {
      const code = errorCode(error) ?? ''
      setStale(code === 'STALE_VERSION')
      setProblems({
        [FIELD_FOR_CODE[code] ?? 'form']:
          code === 'STALE_VERSION' ? staleMessage(error, base.name, myName) : problemMessage(error),
      })
    },
  })

  const cancelChange = useMutation({
    mutationFn: (reason: string) =>
      api.properties.cancelEntityChange({ id: base.id, version: base.version, reason }),
    onSuccess: async (saved) => {
      adopt(saved, true)
      toast.success(`${saved.name} stays with ${saved.entityName}`)
      await refresh()
    },
    onError: (error) => {
      const stale = errorCode(error) === 'STALE_VERSION'
      setStale(stale)
      setProblems({ form: stale ? staleMessage(error, base.name, myName) : problemMessage(error) })
    },
  })

  const reloading = useMutation({
    mutationFn: reload,
    onSuccess: (fresh) => (fresh ? adopt(fresh) : undefined),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = F.checkChanges(base, form)
    setProblems(found)
    if (Object.keys(found).length > 0) {
      return focusFirstProblem(event.currentTarget, F.FIELD_ORDER, found)
    }
    save.mutate()
  }

  return {
    base,
    form,
    problems,
    stale,
    dirty,
    saving: save.isPending,
    set: (change: Partial<F.HotelForm>) => setForm((typed) => ({ ...typed, ...change })),
    // A logo change doesn't touch the fields or the version; keep what's typed.
    setLogo: (saved: Property) => {
      queryClient.setQueryData(orpc.properties.get.queryKey({ input: { id: saved.id } }), saved)
      setBase((before) => ({ ...before, logo: saved.logo }))
      void refresh()
    },
    submit,
    cancelChange: (reason: string, onDone: () => void) =>
      cancelChange.mutate(reason, { onSuccess: onDone }),
    cancelling: cancelChange.isPending,
    reload: () => reloading.mutate(),
    reloadPending: reloading.isPending,
    discard: () => setForm(F.formFrom(base)),
  }
}

export type HotelFormState = ReturnType<typeof useHotelForm>
