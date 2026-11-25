import { describe, expect, it } from 'vitest'
import { emailProblem, suggestEmail } from './email.ts'

describe('emailProblem', () => {
  it('accepts normal addresses, with spaces around them', () => {
    expect(emailProblem(' ada@korahotels.ng ')).toBeUndefined()
  })

  it('explains what is wrong', () => {
    expect(emailProblem('')).toBe('Enter your email.')
    expect(emailProblem('ada@')).toMatch(/valid email/)
    expect(emailProblem('ada@kora')).toMatch(/valid email/)
  })
})

describe('suggestEmail', () => {
  it('catches common typos of popular providers', () => {
    expect(suggestEmail('ada@gmial.com')).toBe('ada@gmail.com')
    expect(suggestEmail('ada@gmai.com')).toBe('ada@gmail.com')
    expect(suggestEmail('Ada@Yaho.com')).toBe('ada@yahoo.com')
    expect(suggestEmail('ada@hotmial.com')).toBe('ada@hotmail.com')
  })

  it('leaves correct and company addresses alone', () => {
    expect(suggestEmail('ada@gmail.com')).toBeUndefined()
    expect(suggestEmail('ada@korahotels.ng')).toBeUndefined()
    expect(suggestEmail('ada@acme-energy.com')).toBeUndefined()
    expect(suggestEmail('not an email')).toBeUndefined()
  })
})
