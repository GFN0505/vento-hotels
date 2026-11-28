// The registration rule set in force at a hotel on a business date (non-negotiable 13): Vento's
// starting rules (registration_rule_templates, seeded To verify) for the federal scope and the
// hotel's state, overridden by the group's own rules (registration_rules) for the state or the
// hotel. The most specific wins: hotel, then state, then federal. The version is a short hash of
// what is in force, stored on every registration.
import { createHash } from 'node:crypto'
import {
  REGISTRATION_FIELDS,
  type RegistrationField,
  type RuleAudience,
  type RuleSet,
} from '@vento/shared'
import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import { registrationRules, registrationRuleTemplates } from '../../db/schema/front-desk.ts'
import type { Reader } from '../../reservations/context.ts'

type Rule = RuleSet['rules'][number] & { rank: number }

const known = new Set<string>(REGISTRATION_FIELDS)

export async function ruleSetFor(
  db: Reader,
  hotel: { organizationId: string; propertyId: string; stateCode: string | null },
  businessDate: string,
): Promise<RuleSet> {
  const scopes = ['federal', ...(hotel.stateCode ? [hotel.stateCode] : [])]
  const inForce = <T extends typeof registrationRuleTemplates | typeof registrationRules>(t: T) =>
    and(
      inArray(t.scope, scopes),
      lte(t.effectiveFrom, businessDate),
      or(isNull(t.effectiveTo), gt(t.effectiveTo, businessDate)),
    )
  const [templates, overrides] = await Promise.all([
    db.select().from(registrationRuleTemplates).where(inForce(registrationRuleTemplates)),
    db
      .select()
      .from(registrationRules)
      .where(
        and(
          eq(registrationRules.organizationId, hotel.organizationId),
          or(
            isNull(registrationRules.propertyId),
            eq(registrationRules.propertyId, hotel.propertyId),
          ),
          inForce(registrationRules),
        ),
      ),
  ])
  const byKey = new Map<string, Rule>()
  const put = (rule: Rule) => {
    if (!known.has(rule.field)) return
    const key = `${rule.audience}:${rule.field}`
    const old = byKey.get(key)
    if (!old || rule.rank >= old.rank) byKey.set(key, rule)
  }
  for (const row of templates) {
    put({
      audience: row.audience as RuleAudience,
      field: row.field as RegistrationField,
      required: row.required,
      source: row.source,
      verified: false,
      rank: row.scope === 'federal' ? 0 : 1,
    })
  }
  for (const row of overrides) {
    put({
      audience: row.audience as RuleAudience,
      field: row.field as RegistrationField,
      required: row.required,
      source: row.source,
      verified: row.verifiedAt !== null,
      rank: 2 + (row.scope === 'federal' ? 0 : 1) + (row.propertyId ? 2 : 0),
    })
  }
  const rules = [...byKey.values()]
    .sort((a, b) => `${a.audience}:${a.field}`.localeCompare(`${b.audience}:${b.field}`))
    .map(({ rank: _rank, ...rule }) => rule)
  const version = createHash('sha256')
    .update(JSON.stringify(rules.map((r) => [r.audience, r.field, r.required])))
    .digest('hex')
    .slice(0, 12)
  return { version, rules }
}

// The sheet's field lists: required and optional ("More details") per audience.
export function fieldLists(set: RuleSet) {
  const of = (audiences: RuleAudience[]) => {
    const rules = set.rules.filter((rule) => audiences.includes(rule.audience))
    return {
      required: rules.filter((rule) => rule.required).map((rule) => rule.field),
      optional: rules.filter((rule) => !rule.required).map((rule) => rule.field),
    }
  }
  return { lead: of(['all']), foreign: of(['foreign', 'ecowas']) }
}
