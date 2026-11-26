import { defineConfig } from 'vitest/config'

// Unit and component tests live next to the code in src/. Browser tests in e2e/ run with Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'sw/**/*.test.ts'],
  },
})
