// Sets the browser tab title for a screen, e.g. "Sign in · Vento Hotels", so tabs, history and
// screen readers say where you are.
import { useEffect } from 'react'

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Vento Hotels`
  }, [title])
}
