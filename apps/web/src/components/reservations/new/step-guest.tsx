// Guest (spec: "Guest step"): find a guest of the group by name, phone or email (3+ characters, up
// to 5 matches, phones masked), or add a new one: title, names, phone or email, nationality. Then
// how they booked (the last one used on this device) and notes.
import { useQuery } from '@tanstack/react-query'
import {
  DESK_SOURCES,
  GUEST_TITLES,
  type GuestMatch,
  NOTES_MAX,
  SOURCE_LABELS,
} from '@vento/shared'
import { Search, UserRound } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react'
import { Combobox } from '@/components/ui/combobox'
import { Field, Input } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useCountries } from '../use-countries'
import { type Draft, EMPTY_GUEST, updateDraft } from './booking-draft'
import type { Problems } from './booking-model'

type Props = { draft: Draft; problems: Problems; showErrors: boolean }

export function StepGuest({ draft, problems, showErrors }: Props) {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [tried, setTried] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const countries = useCountries()
  const titlesId = useId()
  const listId = useId()
  const guest = draft.guest
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 200)
    return () => clearTimeout(timer)
  }, [text])
  const search = useQuery({
    ...orpc.guests.search.queryOptions({ input: { q } }),
    enabled: q.length >= 3,
    placeholderData: (previous) => previous,
  })
  const matches = q.length >= 3 ? (search.data ?? []) : []
  const options = useMemo(
    () =>
      (countries ?? []).map((country) => ({
        value: country.code,
        label: `${country.demonym} (${country.name})`,
      })),
    [countries],
  )
  const setGuest = (patch: Partial<Draft['guest']>) =>
    updateDraft({ guest: { ...guest, ...patch } })
  // Contact details come masked; the fields start empty and keep the record's unless typed.
  const pick = (match: GuestMatch) => {
    updateDraft({
      guest: {
        picked: match,
        title: match.title ?? '',
        firstName: match.firstName,
        lastName: match.lastName,
        phone: '',
        email: '',
        nationality: match.nationality,
      },
    })
    setOpen(false)
    setActive(-1)
  }
  const shown = (field: string) => (tried || showErrors ? problems[field] : undefined)
  const optionId = (index: number) => `${listId}-${index}`
  const expanded = open && q.length >= 3 && search.data !== undefined
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (matches.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current + step + matches.length) % matches.length)
    } else if (event.key === 'Enter' && expanded && active >= 0) {
      event.preventDefault()
      const match = matches[active]
      if (match) pick(match)
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <section aria-labelledby="guest-heading" className="flex flex-col gap-5">
      <h3 id="guest-heading" className="text-[15px] font-semibold">
        Guest
      </h3>
      <div className="relative flex flex-col gap-2" data-no-enter>
        <label htmlFor="find-guest" className="text-sm font-medium text-text-2">
          Find a guest
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3"
            aria-hidden="true"
          />
          <Input
            id="find-guest"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
            placeholder="Name, phone or email"
            value={text}
            autoComplete="off"
            onChange={(event) => {
              setText(event.target.value)
              setOpen(true)
              setActive(-1)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            className="h-11 pl-9 lg:h-9"
          />
        </div>
        <p role="status" aria-live="polite" className="text-sm text-text-3">
          {q.length < 3
            ? ''
            : search.data === undefined
              ? ''
              : matches.length === 0
                ? `No guest matches “${q}”. Add them below.`
                : `${matches.length} ${matches.length === 1 ? 'guest' : 'guests'} found`}
        </p>
        <div
          id={listId}
          role="listbox"
          aria-label="Guests found"
          hidden={!expanded || matches.length === 0}
          className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface"
        >
          {matches.map((match, index) => (
            <div
              key={match.id}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(match)}
              onKeyDown={() => undefined}
              className={cn(
                'flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-surface-2',
                index === active && 'bg-pri-soft',
              )}
            >
              <UserRound className="size-4 flex-none text-text-3" aria-hidden="true" />
              <span className="flex min-w-0 grow flex-col">
                <span className="truncate font-medium">
                  {[match.title, match.firstName, match.lastName].filter(Boolean).join(' ')}
                </span>
                <span className="num truncate text-sm text-text-2">
                  {[match.nationality, match.maskedPhone, match.maskedEmail]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </div>
          ))}
        </div>
        {guest.picked ? (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-2">
            Booking for {guest.picked.firstName} {guest.picked.lastName}, already a guest of the
            group. Changes you type update their record.
            <button
              type="button"
              className="inline-flex min-h-11 items-center font-medium text-pri-ink hover:underline lg:min-h-0"
              onClick={() => updateDraft({ guest: EMPTY_GUEST })}
            >
              Add a new guest instead
            </button>
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]">
        <Field
          label="Title"
          list={titlesId}
          value={guest.title}
          maxLength={20}
          onChange={(event) => setGuest({ title: event.target.value })}
          className="max-lg:h-11"
        />
        <datalist id={titlesId}>
          {GUEST_TITLES.map((title) => (
            <option key={title} value={title} />
          ))}
        </datalist>
        <Field
          label="First name"
          value={guest.firstName}
          maxLength={60}
          autoComplete="off"
          error={shown('firstName')}
          onBlur={() => setTried(true)}
          onChange={(event) => setGuest({ firstName: event.target.value })}
          className="max-lg:h-11"
        />
        <Field
          label="Last name"
          value={guest.lastName}
          maxLength={60}
          autoComplete="off"
          error={shown('lastName')}
          onBlur={() => setTried(true)}
          onChange={(event) => setGuest({ lastName: event.target.value })}
          className="max-lg:h-11"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone"
          type="tel"
          inputMode="tel"
          value={guest.phone}
          maxLength={30}
          autoComplete="off"
          hint={
            guest.picked?.maskedPhone
              ? `Leave empty to keep ${guest.picked.maskedPhone}, or type a new number`
              : 'With country code for foreign numbers, e.g. +44 7700 900123'
          }
          error={shown('phone')}
          onBlur={() => setTried(true)}
          onChange={(event) => setGuest({ phone: event.target.value })}
          className="max-lg:h-11"
        />
        <Field
          label="Email"
          type="email"
          hint={
            guest.picked?.maskedEmail
              ? `Leave empty to keep ${guest.picked.maskedEmail}`
              : undefined
          }
          value={guest.email}
          maxLength={254}
          autoComplete="off"
          error={shown('email')}
          onBlur={() => setTried(true)}
          onChange={(event) => setGuest({ email: event.target.value })}
          className="max-lg:h-11"
        />
      </div>
      <Combobox
        label="Nationality"
        value={guest.nationality}
        options={options}
        placeholder="Type a country"
        onChange={(nationality) => setGuest({ nationality })}
      />
      <Segmented
        label="How they booked"
        value={draft.source}
        options={DESK_SOURCES.map((source) => ({ value: source, label: SOURCE_LABELS[source] }))}
        onChange={(source) => updateDraft({ source })}
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-2">Notes</span>
        <textarea
          value={draft.notes}
          maxLength={NOTES_MAX}
          rows={2}
          placeholder="e.g. Quiet room, late arrival around 22:00"
          onChange={(event) => updateDraft({ notes: event.target.value })}
          className="rounded-sm border border-input bg-surface px-3 py-2 text-[16px] focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:text-base"
        />
        <span className="num text-right text-xs text-text-3">
          {draft.notes.length}/{NOTES_MAX}
        </span>
      </label>
    </section>
  )
}
