// The country list (names and demonyms) loads on its own the first time it's needed, so the
// list and detail pages don't carry it.
import type { Country } from '@vento/shared/countries'
import { useEffect, useState } from 'react'

let loaded: readonly Country[] | undefined

export function useCountries(): readonly Country[] | undefined {
  const [countries, setCountries] = useState(loaded)
  useEffect(() => {
    if (loaded) return
    let live = true
    void import('@vento/shared/countries').then((module) => {
      loaded = module.COUNTRIES
      if (live) setCountries(loaded)
    })
    return () => {
      live = false
    }
  }, [])
  return countries
}
