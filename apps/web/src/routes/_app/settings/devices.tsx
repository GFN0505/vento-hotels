// Settings › Devices (design #25, SetDevices; decision 0022). The page follows the hotel switch.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { DevicesPage } from '@/components/devices/devices-page'

// ?register=<hotel id> opens "Register this device" bound to that hotel (a new hotel's next steps).
export const Route = createFileRoute('/_app/settings/devices')({
  validateSearch: (search: Record<string, unknown>): { register?: string | undefined } =>
    typeof search.register === 'string' && search.register
      ? { register: search.register.slice(0, 40) }
      : {},
  component: DevicesRoute,
})

function DevicesRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <DevicesPage
      register={search.register}
      onRegistered={() => void navigate({ search: (prev) => ({ ...prev, register: undefined }) })}
    />
  )
}
