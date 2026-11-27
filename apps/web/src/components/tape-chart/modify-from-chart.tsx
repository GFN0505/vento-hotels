// Modify (brick 6's dialog) opened from the chart (E, or the bar card): loads the reservation it
// needs first.
import { useQuery } from '@tanstack/react-query'
import { ModifyDialog } from '@/components/reservations/modify-dialog'
import { orpc } from '@/lib/api'

export function ModifyFromChart({
  reservationId,
  onClose,
}: {
  reservationId: string
  onClose: () => void
}) {
  const detail = useQuery(orpc.reservations.get.queryOptions({ input: { id: reservationId } }))
  if (!detail.data) return null
  return <ModifyDialog detail={detail.data} onClose={onClose} />
}
