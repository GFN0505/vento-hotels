// Reservations (designs: the list pattern in DSComponents, ReservationDetail, NewReservation): the
// whole section needs the front desk module (decision 0021).
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'

export const Route = createFileRoute('/_app/reservations')({
  component: () => (
    <FeatureGate feature="front_desk">
      <Outlet />
    </FeatureGate>
  ),
})
