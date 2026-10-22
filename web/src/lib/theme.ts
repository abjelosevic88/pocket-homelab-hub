import { useEffect } from 'react'
import type { Prefs } from './types'

// Appearance is personal (saved with the account) and mirrored in this browser
// so the first paint — including the sign-in page — already has the right look.
export type ThemeChoice = 'system' | 'light' | 'dark'
export type Accent = 'teal' | 'blue' | 'violet' | 'rose' | 'orange' | 'green'
export type TextSize = 'normal' | 'large'

export const ACCENTS: { id: Accent; name: string; swatch: string }[] = [
  { id: 'teal', name: 'Teal', swatch: '#14a3b3' },
  { id: 'blue', name: 'Blue', swatch: '#3b7cf0' },
  { id: 'violet', name: 'Violet', swatch: '#8b5cf6' },
  { id: 'rose', name: 'Rose', swatch: '#e2487a' },
  { id: 'orange', name: 'Orange', swatch: '#ea7a1e' },
  { id: 'green', name: 'Green', swatch: '#22a05b' },
]

const STORE = 'pocket-hub:appearance'
type Appearance = { theme: ThemeChoice; accent: Accent; text: TextSize }

export function storedAppearance(): Appearance {
  try {
    const a = JSON.parse(localStorage.getItem(STORE) || '{}')
    return { theme: a.theme || 'system', accent: a.accent || 'teal', text: a.text || 'normal' }
  } catch { return { theme: 'system', accent: 'teal', text: 'normal' } }
}

export function appearanceFrom(prefs: Prefs): Appearance {
  const fallback = storedAppearance()
  return { theme: prefs.theme || fallback.theme, accent: prefs.accent || fallback.accent, text: prefs.text_size || fallback.text }
}

const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

export function resolvedTheme(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (dark() ? 'dark' : 'light') : choice
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement
  const mode = resolvedTheme(a.theme)
  root.dataset.theme = mode
  root.dataset.accent = a.accent
  root.dataset.text = a.text
  root.style.colorScheme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#111317' : '#f4f5f7')
  try { localStorage.setItem(STORE, JSON.stringify(a)) } catch { /* private mode */ }
}

// Keep the page in step with the account's choice and, on "Automatic", the device.
export function useAppearance(prefs: Prefs | null) {
  const a = prefs ? appearanceFrom(prefs) : storedAppearance()
  useEffect(() => {
    applyAppearance(a)
    if (a.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const change = () => applyAppearance(a)
    mq.addEventListener('change', change)
    return () => mq.removeEventListener('change', change)
  }, [a.theme, a.accent, a.text])
}
