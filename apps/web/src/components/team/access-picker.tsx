// "Can see": the whole group, or chosen hotels. Owners and group admins always see the whole group,
// and nobody can hand out hotels they can't see themselves (the API enforces both).
import { type AccessChoice, isGroupAdmin, type MemberRole } from '@vento/shared'
import { useId } from 'react'
import { useProperty } from '@/components/shell/property-context'
import { Checkbox } from '@/components/ui/checkbox'

type AccessPickerProps = {
  role: MemberRole
  value: AccessChoice
  onChange: (value: AccessChoice) => void
  // Whether the person granting access sees the whole group themselves.
  canGrantWholeGroup: boolean
  error?: string | undefined
}

export function AccessPicker({
  role,
  value,
  onChange,
  canGrantWholeGroup,
  error,
}: AccessPickerProps) {
  const { properties } = useProperty()
  const name = useId()
  const errorId = useId()
  if (isGroupAdmin(role)) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-2">Can see</span>
        <p className="text-text-2">Owners and group admins always see the whole group.</p>
      </div>
    )
  }
  const chosen = value.allProperties ? [] : value.propertyIds
  // With one hotel, "only these hotels" means the same as the whole group today; keep it simple.
  if (canGrantWholeGroup && properties.length <= 1) return null

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium text-text-2">Can see</legend>
      {canGrantWholeGroup ? (
        <label className="flex min-h-11 items-center gap-2.5 lg:min-h-8">
          <input
            type="radio"
            name={name}
            checked={value.allProperties}
            onChange={() => onChange({ allProperties: true })}
            className="size-4 accent-[var(--pri)]"
          />
          Whole group, including hotels added later
        </label>
      ) : null}
      <label className="flex min-h-11 items-center gap-2.5 lg:min-h-8">
        <input
          type="radio"
          name={name}
          checked={!value.allProperties}
          onChange={() => onChange({ allProperties: false, propertyIds: chosen })}
          className="size-4 accent-[var(--pri)]"
        />
        Only these hotels
      </label>
      {!value.allProperties ? (
        <ul className="ml-6.5 flex flex-col">
          {properties.map((property) => (
            <li key={property.id}>
              <label
                htmlFor={`${name}-${property.id}`}
                className="flex min-h-11 items-center gap-2.5 lg:min-h-8"
              >
                <Checkbox
                  id={`${name}-${property.id}`}
                  checked={chosen.includes(property.id)}
                  onChange={(event) =>
                    onChange({
                      allProperties: false,
                      propertyIds: event.target.checked
                        ? [...chosen, property.id]
                        : chosen.filter((id) => id !== property.id),
                    })
                  }
                />
                {property.name}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-ro" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
