import { createFileRoute, redirect } from '@tanstack/react-router'

// Rooms is the only page of Rates & channels so far.
export const Route = createFileRoute('/_app/rates/')({
  beforeLoad: () => {
    throw redirect({ to: '/rates/rooms', replace: true })
  },
})
