// Structured logs (pino, JSON lines) for the API. Every line from a request carries its request id
// and, once known, the organization and property, so one person's problem can be followed end to
// end. Never guest or staff personal data: emails, names, tokens and message text are hidden even if
// they slip into a log call.
import pino from 'pino'
import { currentRequest } from './request-context.ts'

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'warn' : 'info')

export const logger = pino({
  level,
  base: { service: 'vento-hotels-api' },
  // Adds the request's ids to every line written while handling it.
  mixin: () => currentRequest() ?? {},
  redact: {
    paths: [
      'email',
      '*.email',
      'to',
      '*.to',
      'name',
      '*.name',
      'password',
      '*.password',
      'token',
      '*.token',
      'text',
      '*.text',
      'pin',
      '*.pin',
    ],
    censor: '[hidden]',
  },
})
