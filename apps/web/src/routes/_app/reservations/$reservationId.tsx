// One reservation (design #5 ReservationDetail; read-only in this brick).
import { createFileRoute } from '@tanstack/react-router'
import { ReservationDetailPage } from '@/components/reservations/reservation-detail-page'

export const Route = createFileRoute('/_app/reservations/$reservationId')({
  staticData: { title: 'Reservation' },
  component: ReservationRoute,
})

function ReservationRoute() {
  const { reservationId } = Route.useParams()
  return <ReservationDetailPage id={reservationId} />
}
