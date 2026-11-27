// Dates & guests: the hotel (only under All hotels: "Which hotel?"), arrival and departure, adults
// and children. Arrival starts on the business date, departure a night later.
import type { Property } from '@vento/shared'
import { addDays } from '@vento/shared'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { datesSummary } from '../format'
import { type Draft, updateDraft } from './booking-draft'
import type { Problems } from './booking-model'

type Props = {
  draft: Draft
  // The hotels to choose from under All hotels; undefined when one hotel is chosen.
  hotels: Property[] | undefined
  hotel: Property | undefined
  problems: Problems
}

export function StepDates({ draft, hotels, hotel, problems }: Props) {
  const valid = Object.keys(problems).length === 0
  return (
    <section aria-labelledby="dates-heading" className="flex flex-col gap-5">
      <h3 id="dates-heading" className="text-[15px] font-semibold">
        Dates &amp; guests
      </h3>
      {hotels ? (
        <SelectField
          label="Hotel"
          value={draft.hotelId ?? ''}
          placeholder="Which hotel?"
          options={hotels.map((h) => ({ value: h.id, label: h.name }))}
          error={draft.hotelId ? undefined : problems.hotel}
          hint={draft.hotelId ? undefined : 'Which hotel?'}
          onChange={(event) => {
            const chosen = hotels.find((h) => h.id === event.target.value)
            updateDraft({
              hotelId: event.target.value || undefined,
              roomTypeId: undefined,
              ratePlanId: undefined,
              discount: undefined,
              ...(chosen && draft.arrival < chosen.businessDate
                ? { arrival: chosen.businessDate, departure: addDays(chosen.businessDate, 1) }
                : {}),
            })
          }}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Arrival"
          type="date"
          value={draft.arrival}
          min={hotel?.businessDate}
          error={problems.arrival}
          onChange={(event) => {
            const arrival = event.target.value
            updateDraft({
              arrival,
              // Keep the stay's length when the arrival moves past the departure.
              ...(arrival && draft.departure <= arrival ? { departure: addDays(arrival, 1) } : {}),
            })
          }}
          className="max-lg:h-11"
        />
        <Field
          label="Departure"
          type="date"
          value={draft.departure}
          min={draft.arrival ? addDays(draft.arrival, 1) : undefined}
          error={problems.departure}
          onChange={(event) => updateDraft({ departure: event.target.value })}
          className="max-lg:h-11"
        />
        <Field
          label="Adults"
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          value={String(draft.adults)}
          error={problems.adults}
          onChange={(event) =>
            updateDraft({ adults: Math.max(0, Number(event.target.value) || 0) })
          }
          className="max-lg:h-11"
        />
        <Field
          label="Children"
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={String(draft.children)}
          error={problems.children}
          onChange={(event) =>
            updateDraft({ children: Math.max(0, Number(event.target.value) || 0) })
          }
          className="max-lg:h-11"
        />
      </div>
      {valid ? (
        <p className="num rounded-sm bg-surface-2 px-3 py-2 font-medium">
          {datesSummary(draft.arrival, draft.departure, draft.adults, draft.children)}
        </p>
      ) : null}
    </section>
  )
}
