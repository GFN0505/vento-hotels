// Payment setup vocabulary (spec: stage-1-taxes-and-payment-methods.md, "Payments"): the fixed list
// of ways a hotel takes money, the banks, and the rules for account numbers and terminal IDs. This
// is configuration only; no money moves in Stage 1 brick 3.
import { z } from 'zod'
import { FX_CURRENCIES } from './fx.ts'
import { SUPPORTED_CURRENCIES } from './locale.ts'

export const PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'pos_terminal',
  'city_ledger',
  'card_online',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const paymentMethodSchema = z.enum(PAYMENT_METHODS)

type MethodDefinition = {
  label: string
  // Fixed, not a setting.
  reference: string
  // A new hotel's default.
  defaultOn: boolean
  // Can't be switched on yet: Online card comes with online payments (Stage 4).
  comingLater?: string
}

export const PAYMENT_METHOD_INFO: Record<PaymentMethod, MethodDefinition> = {
  cash: { label: 'Cash', reference: '–', defaultOn: true },
  bank_transfer: { label: 'Bank transfer', reference: 'Bank session reference', defaultOn: true },
  pos_terminal: { label: 'POS terminal', reference: 'Terminal and RRN', defaultOn: true },
  city_ledger: { label: 'City ledger', reference: 'Corporate account', defaultOn: true },
  card_online: {
    label: 'Online card',
    reference: 'Automatic',
    defaultOn: false,
    comingLater: 'Comes with online payments',
  },
}

// Foreign cash a hotel may tick on Cash. Naira is always taken.
export const cashForeignCurrenciesSchema = z
  .array(z.enum(FX_CURRENCIES))
  .max(FX_CURRENCIES.length)
  .transform((list) => FX_CURRENCIES.filter((code) => list.includes(code)))

export const bankAccountCurrencySchema = z.enum(SUPPORTED_CURRENCIES)

// Nigerian banks for the bank picker, with "Other" typed by hand. Display names only.
export const NIGERIAN_BANKS = [
  'Access Bank',
  'Citibank Nigeria',
  'Ecobank Nigeria',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank',
  'Globus Bank',
  'Guaranty Trust Bank',
  'Jaiz Bank',
  'Keystone Bank',
  'Kuda Microfinance Bank',
  'Lotus Bank',
  'Moniepoint Microfinance Bank',
  'OPay',
  'Optimus Bank',
  'PalmPay',
  'Parallex Bank',
  'Polaris Bank',
  'PremiumTrust Bank',
  'Providus Bank',
  'Signature Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank',
  'Sterling Bank',
  'SunTrust Bank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa',
  'Unity Bank',
  'Wema Bank',
  'Zenith Bank',
] as const

export const bankNameSchema = z
  .string()
  .trim()
  .min(2, 'Choose the bank')
  .max(60, 'Keep the bank name under 60 characters')

// NUBAN: 10 digits. Spaces and dashes as typed are ignored.
export const accountNumberSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{10}$/, 'Enter the 10-digit account number.'))

export const accountNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter the account name as the bank shows it')
  .max(120, 'Keep the account name under 120 characters')

// "••••4471": account numbers in lists and messages.
export function maskAccountNumber(accountNumber: string): string {
  return `••••${accountNumber.slice(-4)}`
}

// "Zenith Bank ••••4471"
export function bankAccountLabel(account: { bankName: string; accountNumber: string }): string {
  return `${account.bankName} ${maskAccountNumber(account.accountNumber)}`
}

// Suggestions only; any provider can be typed.
export const POS_PROVIDERS = [
  'Moniepoint',
  'OPay',
  'PalmPay',
  'Paystack Terminal',
  'Access Bank',
  'First Bank of Nigeria',
  'Guaranty Trust Bank',
  'United Bank for Africa',
  'Zenith Bank',
] as const

// Printed on the terminal and on every slip: 1–20 letters and digits, stored in capitals.
export const terminalIdSchema = z
  .string()
  .transform((value) => value.replace(/\s/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{1,20}$/, 'Enter the terminal ID: up to 20 letters and digits'))

// "Moniepoint · Desk 1 · TID 2MPT4471"
export function terminalLabel(terminal: { provider: string; name: string }): string {
  return `${terminal.provider} · ${terminal.name}`
}
