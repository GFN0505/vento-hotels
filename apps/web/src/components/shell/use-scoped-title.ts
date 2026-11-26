// The tab title names the page's scope (spec: stage-1-hotel-switch-scope): "Members and roles ·
// Kora Abuja · Vento Hotels", "Devices · All hotels · Vento Hotels", or for a group-wide page the
// group: "Permissions and limits · Kora Hotels Group · Vento Hotels". Kept out of lib/title.ts so
// signed-out pages don't download the API client.
import { useEffect } from 'react'
import { useMe } from '@/lib/me'
import { scopedTitle, scopeName } from '@/lib/scope'
import { useProperty } from './property-context'

export function useScopedTitle(page: string, options?: { groupWide?: boolean }) {
  const { scope } = useProperty()
  const group = useMe().data?.organization.name
  const where = options?.groupWide ? group : scope ? scopeName(scope) : undefined
  const title = scopedTitle(page, where)
  useEffect(() => {
    document.title = title
  }, [title])
}
