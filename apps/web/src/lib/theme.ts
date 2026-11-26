// Light, dark or follow the device (vento.theme in this browser). Light is the default; index.html
// applies the choice before the first paint, and setTheme applies a new one at once.
export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'vento.theme'

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'dark' || value === 'system' ? value : 'light'
  } catch {
    return 'light'
  }
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'light') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Storage blocked: the choice still applies until the page reloads.
  }
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}
