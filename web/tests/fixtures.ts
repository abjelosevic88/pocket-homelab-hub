import { test as base, expect, chromium, type Browser } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The suite is entirely isolated: no real customer accounts or live services.
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
export const origin = 'https://hub.pocket.test'
const user = { id: 7, name: 'Alex', email: 'alex@example.test', role: 'member', created_at: '2026-01-01' }
const tiles = ['notes', 'tasks', 'kitchen', 'habits', 'bookshelf', 'podcasts'].map((type, i) => ({ key: `${type}-${i}`, id: i, type, name: `Pocket ${type.charAt(0).toUpperCase() + type.slice(1)}`, pocket: true, status: 'ok', group: 'Pocket', icon: `/icons/pocket-${type}.svg`, url: `https://${type}.pocket.test/`, open_url: `https://${type}.pocket.test/` }))
export const test = base.extend<{ harness: { prefs: Record<string, any>; saveFails: boolean; userId: number; apps: typeof tiles } }>({
  browser: [async ({}, use) => {
    let browser: Browser
    if (process.env.PLAYWRIGHT_CDP_URL) browser = await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL)
    else browser = await chromium.launch()
    await use(browser)
    await browser.close()
  }, { scope: 'worker' }],
  harness: async ({ context }, use) => {
    const state = { prefs: {} as Record<string, any>, saveFails: false, userId: 7, apps: [...tiles] }
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== origin) return route.fulfill({ contentType: 'text/html', body: `<html><body><h1>${url.hostname}</h1><label>Draft <input aria-label="Draft"></label><script>window.bootId = Math.random()</script></body></html>` })
      if (url.pathname === '/api/v1/auth/status') return route.fulfill({ json: { user: { ...user, id: state.userId }, authenticated: true, needs_setup: false, oidc: true } })
      if (url.pathname === '/api/v1/launcher') return route.fulfill({ json: { core: 'ok', me: { ...user, id: state.userId }, prefs: state.prefs, apps: state.apps, box: { name: 'Pocket Box', apps_up: 6, apps_checked: 6 }, refresh_seconds: 45 } })
      if (url.pathname === '/api/v1/activity') return route.fulfill({ json: { events: [], scope: 'mine' } })
      if (url.pathname === '/api/v1/prefs') {
        if (request.method() === 'PUT') {
          if (state.saveFails) return route.fulfill({ status: 503, json: { error: 'offline' } })
          state.prefs = request.postDataJSON()
        }
        return route.fulfill({ json: state.prefs })
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
      const file = path.join(dist, url.pathname === '/' || !path.extname(url.pathname) ? 'index.html' : url.pathname)
      const types: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
      try { await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' }) }
      catch { await route.fulfill({ status: 404, body: 'Not found' }) }
    })
    await use(state)
  },
})


export { expect }
