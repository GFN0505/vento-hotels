// Closing a sheet with unsaved changes asks first (engineering standard: warn about unsaved
// changes on dialogs). The question replaces the sheet's buttons, so nothing pops over it.
import { useState } from 'react'
import { Button } from './button'

export function useDiscardGuard(dirty: boolean, onClose: () => void) {
  const [asking, setAsking] = useState(false)
  return {
    asking,
    close: () => {
      if (dirty && !asking) setAsking(true)
      else onClose()
    },
    bar: asking ? (
      <div className="flex w-full flex-wrap items-center gap-2" role="alert">
        <p className="grow font-medium">Discard your changes?</p>
        <Button onClick={() => setAsking(false)} data-autofocus>
          Keep editing
        </Button>
        <Button variant="danger" onClick={onClose}>
          Discard
        </Button>
      </div>
    ) : null,
  }
}
