// A hotel's logo beside its name, or its initials until it has one. Decorative: the name is always
// next to it, so screen readers don't hear it twice.
import type { Property } from '@vento/shared'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/team'

const SIZES = {
  sm: { box: 'size-9 text-xs', px: 36 },
  md: { box: 'size-11 text-sm', px: 44 },
  lg: { box: 'size-14 text-base', px: 56 },
} as const

export function HotelMark({
  hotel,
  size = 'md',
}: {
  hotel: Pick<Property, 'name' | 'logo'>
  size?: keyof typeof SIZES
}) {
  // A signed link can expire on a page left open for long; initials stand in until a refresh.
  const [broken, setBroken] = useState(false)
  const { box, px } = SIZES[size]
  if (hotel.logo && !broken) {
    return (
      <img
        src={hotel.logo.url}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cn('flex-none rounded-lg bg-surface object-contain ring-1 ring-border', box)}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid flex-none place-items-center rounded-lg bg-linear-to-br from-pri-soft to-surface-2 font-semibold text-pri-ink ring-1 ring-pri-line/60',
        box,
      )}
    >
      {initials(hotel.name)}
    </span>
  )
}
