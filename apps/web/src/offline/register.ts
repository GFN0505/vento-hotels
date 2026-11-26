// Installs the service worker in production builds (sw/sw.js) and offers a new version when one is
// ready, so an update never lands in the middle of someone's work. Loaded after first paint.
import { toast } from 'sonner'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      const offer = (worker: ServiceWorker) => {
        toast('A new version of Vento is ready', {
          id: 'vento-update',
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: 'Reload',
            onClick: () => {
              navigator.serviceWorker.addEventListener('controllerchange', () =>
                window.location.reload(),
              )
              worker.postMessage('vento:update')
            },
          },
        })
      }
      // Only offer an update when a version was already running: the very first install is silent.
      if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting)
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker)
        })
      })
    })
    .catch(() => {
      // Without it the app still works online; nothing to tell the person.
    })
}
