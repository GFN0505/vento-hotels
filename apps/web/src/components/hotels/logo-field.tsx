// The hotel's logo in settings (design #25 SetProperty, Identity): a preview, what it's used for,
// Upload and Remove. The new file shows at once while it uploads.
import { LOGO_CONTENT_TYPES, type Property } from '@vento/shared'
import { ImageIcon, Loader2 } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useLogo } from './use-logo'

type Props = {
  hotel: Property
  canChange: boolean
  online: boolean
  onChange: (hotel: Property) => void
}

export function LogoField({ hotel, canChange, online, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const logo = useLogo(hotel, onChange)
  const shown = logo.preview ?? hotel.logo?.url
  return (
    <div className="flex items-start gap-4">
      <div
        className={cn(
          'relative grid size-[72px] flex-none place-items-center overflow-hidden rounded-xl',
          shown
            ? 'bg-surface ring-1 ring-border'
            : 'border border-dashed border-border-strong bg-surface-2 text-text-3',
        )}
      >
        {shown ? (
          <img
            src={shown}
            alt={`${hotel.name} logo`}
            width={72}
            height={72}
            className="size-full object-contain"
          />
        ) : (
          <ImageIcon className="size-6" aria-hidden="true" strokeWidth={1.6} />
        )}
        {logo.uploading ? (
          <span className="absolute inset-0 grid place-items-center bg-[var(--overlay)]">
            <Loader2 className="size-5 animate-spin text-white" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">Hotel logo</span>
        <span className="text-sm text-text-2">
          Used on invoices, receipts, the booking engine and the guest app. Not on Vento screens.
        </span>
        <span className="text-sm text-text-3">PNG, JPEG or WebP, up to 10 MB</span>
        {canChange ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              accept={LOGO_CONTENT_TYPES.join(',')}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) logo.upload(file)
              }}
            />
            <Button
              size="sm"
              className="max-lg:h-11"
              disabled={!online || logo.busy}
              loading={logo.uploading}
              onClick={() => input.current?.click()}
            >
              {hotel.logo ? 'Replace' : 'Upload'}
            </Button>
            {hotel.logo ? (
              <Button
                size="sm"
                variant="ghost"
                className="max-lg:h-11"
                disabled={!online || logo.busy}
                loading={logo.removing}
                onClick={logo.remove}
                aria-label={`Remove ${hotel.name} logo`}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}
        <p aria-live="polite" className="text-sm text-ro empty:hidden">
          {logo.problem}
        </p>
      </div>
    </div>
  )
}
