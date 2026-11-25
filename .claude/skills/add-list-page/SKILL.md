---
name: add-list-page
description: Recipe for a standard list screen in apps/web — route with URL-synced property/search/filter/sort/pagination, DataTable, create/edit FormDialog, cancel/archive confirm, toasts, loading/empty/error/offline states. Use when building any page that lists records.
---

# Add a list page

Example: Reservations. Assumes the module's contract already exists in `packages/shared`.

## Files
```
apps/web/src/routes/_app/reservations/index.tsx                route + search-param schema + loader
apps/web/src/features/reservations/columns.tsx                 TanStack Table column defs
apps/web/src/features/reservations/ReservationFormDialog.tsx   create + edit in one dialog
apps/web/src/features/reservations/ReservationFormFields.tsx   fields (reused on detail pages)
apps/web/src/features/reservations/queries.ts                  orpc query/mutation options
```

## Route
```tsx
const search = listReservationsInput.pick({
  page: true, pageSize: true, q: true, sort: true, status: true, source: true, arrivalFrom: true, arrivalTo: true,
})

export const Route = createFileRoute('/_app/reservations/')({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(reservationQueries.list({ ...deps, propertyId: context.property.id })),
  component: ReservationsPage,
})
```
- All table state (page, size, search, sort, filters) lives in the URL. Use `Route.useSearch()` / `navigate({ search })`. No `useState` copies.
- The current property comes from the property switcher in the top bar (route context), not a filter on each page. Members limited to one property never see the switcher. Group-level pages (guests, companies) show a "Property" filter instead, listing only the properties the member can access.
- Debounce the search input (300 ms) before updating the URL, and reset `page` to 1 when filters change. Search matches guest name, confirmation number, OTA reference and phone.
- Date filters default to the property's **business date** (e.g. "Arrivals today" = arrival on the business date), never the device clock.

## Page layout (match every other list page)
```
<PageHeader title="Reservations" description="…" actions={<Button><Plus/> New reservation</Button>} />
<DataTableToolbar search filters />     // search left, filter pills (status, source, arrival dates), column picker right
<DataTable columns data total isLoading />   // inside a Card
<ReservationFormDialog />               // mode: create | edit, controlled by URL `?dialog=new|edit&id=`
<ConfirmDialog />                       // cancel reservation / archive guest
```
Quick views as tabs above the table where the domain has them: Arrivals, In house, Departures, All.

## Data
- Queries: `orpc.reservation.list.queryOptions({ input })`. Mutations: `orpc.reservation.create.mutationOptions()`.
- On success: `toast.success('Reservation confirmed · VH-10482')`, close the dialog, `queryClient.invalidateQueries({ queryKey: orpc.reservation.key() })`. Availability and the tape chart are invalidated too, since a booking changes them.
- On error: `toast.error(error.message)`. For form field errors, map them back with `form.setError`. A `CONFLICT` for no availability keeps the dialog open and suggests other room types or dates.
- Use `placeholderData: keepPreviousData` so the table doesn't flash between pages.
- Front-desk lists (arrivals, in house, departures) are cached for offline use (see `performance`); show "Last updated 14:32" when offline.

## Form dialog
- `useForm({ resolver: zodResolver(createReservationInput), defaultValues })`. Build edit defaults from the record. Arrival defaults to the business date, departure to arrival + 1 night.
- Stay dates use `<DateRangePicker>` showing nights ("25–28 Nov 2026 · 3 nights"). Money fields use `<MoneyInput>` with a currency select (formats ₦, $, £ or €, stores a decimal string and the currency). References (guest, company, travel agent, rate plan) use `<EntityCombobox>` (async search); "New guest" is inline in the guest combobox.
- Show live availability and the rate for the chosen room type and dates before submit.
- The submit button shows a pending state and names the result ("Confirm reservation"). Disable close while saving.

## States
- Loading: table skeleton rows (not a spinner).
- Empty with no filters: `<EmptyState>` with an illustration, a one-line explanation and a primary action.
- Empty with filters: "No results" plus a "Clear filters" button.
- Error: an inline message with a Retry button.
- Offline: cached rows with an offline banner; actions that can queue (e.g. check-in) stay enabled and show "Will sync".

## Columns
- Status columns use `<StatusBadge status=…>`. Money columns (total, balance) are right-aligned and use `formatMoney(amount, currency)`. Stay dates use `formatStay(arrival, departure)`. Show the confirmation number and source/channel (`Booking.com`).
- Guest columns mark `vip` with a badge and never show ID or passport numbers.
- The last column is a row-actions dropdown (`aria-label="Actions for {guest name}"`): Check in, Edit, Cancel.
- Mobile: hide secondary columns under `md`, and keep guest, stay dates, status and actions.

## Done when
Works in light and dark mode at 375px and desktop, every state is reachable, `pnpm --filter web typecheck` passes, and there's an e2e test for create → appears in list → edit → cancel (and the room type's availability is back afterwards).
