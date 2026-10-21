import { test as base, expect, chromium, type Browser } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The suite is entirely isolated: no real customer accounts or live services.
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const origin = 'https://hub.pocket.test'
const user = { id: 7, name: 'Alex', email: 'alex@example.test', role: 'member', created_at: '2026-01-01' }
const tiles = ['notes', 'tasks', 'kitchen', 'habits', 'bookshelf', 'podcasts'].map((type, i) => ({ key: `${type}-${i}`, id: i, type, name: `Pocket ${type.charAt(0).toUpperCase() + type.slice(1)}`, pocket: true, status: 'ok', group: 'Pocket', icon: `/icons/pocket-${type}.svg`, url: `https://${type}.pocket.test/`, open_url: `https://${type}.pocket.test/` }))
const test = base.extend<{ harness: { prefs: Record<string, any>; saveFails: boolean; userId: number; apps: typeof tiles } }>({
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

test('intent search opens a matching app inside the workspace', async ({ page, harness }) => {
  await page.goto(origin)
  await page.getByRole('button', { name: 'Search apps or intentions' }).click()
  await page.getByRole('textbox', { name: 'Search apps or intentions' }).fill('plan dinner')
  await expect(page.locator('.palette-name')).toHaveText(['Pocket Kitchen'])
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/app\/kitchen-2$/)
  await expect(page.frameLocator('iframe[title="Pocket Kitchen"]').getByRole('heading')).toHaveText('kitchen.pocket.test')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
})

test('switching apps and returning Home retains app drafts and closes tabs', async ({ page, harness }) => {
  await page.goto(origin)
  await page.locator('.appgrid').getByRole('button', { name: 'Pocket Notes', exact: true }).click()
  const notes = page.frameLocator('iframe[title="Pocket Notes"]')
  await notes.getByLabel('Draft').fill('Do not lose this idea')
  await page.getByRole('link', { name: 'Home', exact: true }).first().click()
  await page.locator('.appgrid').getByRole('button', { name: 'Pocket Tasks', exact: true }).click()
  await page.locator('.workspace-tab').getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(notes.getByLabel('Draft')).toHaveValue('Do not lose this idea')
  await page.getByRole('button', { name: 'Close Pocket Notes' }).click()
  await expect(page).toHaveURL(/\/app\/tasks-1$/)
  await expect(page.locator('iframe[title="Pocket Notes"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close Pocket Tasks' }).click()
  await expect(page).toHaveURL(origin + '/')
})

test('personal spaces save, reload, filter apps, and can be removed', async ({ page, harness }) => {
  await page.goto(origin)
  await page.getByRole('button', { name: 'Create a space', exact: false }).click()
  await page.getByLabel('Space name').fill('Sunday mornings')
  await page.locator('.space-picker label').filter({ hasText: 'Notes' }).click()
  await page.locator('.space-picker label').filter({ hasText: 'Bookshelf' }).click()
  await page.getByRole('button', { name: 'Save space', exact: true }).click()
  await expect.poll(() => harness.prefs.spaces?.length).toBe(1)
  await page.reload()
  await expect(page.locator('.home-apps .tile')).toHaveCount(2)
  await expect(page.locator('.home-apps h2')).toContainText('Sunday mornings')
  await page.getByRole('button', { name: 'Edit Sunday mornings' }).click()
  await page.getByRole('button', { name: 'Remove space', exact: true }).click()
  await expect.poll(() => harness.prefs.spaces?.length).toBe(0)
})

test('failed preference saves remain visible, survive refresh, and can retry', async ({ page, harness }) => {
  harness.saveFails = true
  await page.goto(origin)
  await page.getByRole('button', { name: /Make room to focus/ }).click()
  await expect(page.getByRole('alert')).toContainText('haven’t saved')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.home-apps h2')).toContainText('Make room to focus')
  harness.saveFails = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect.poll(() => harness.prefs.active_space).toBe('focus')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('focus sessions survive reload, pause, complete and stay private per account', async ({ page, harness }) => {
  await page.goto(origin)
  await page.getByRole('button', { name: 'Enter your focus room', exact: false }).click()
  await page.getByRole('button', { name: '15 min', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.getByRole('button', { name: 'Open focus session' }).click()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.waitForTimeout(1100)
  await expect(page.locator('.focus-mini')).toContainText('Paused')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const key = 'pocket-hub:7:focus', f = JSON.parse(localStorage.getItem(key)!)
    localStorage.setItem(key, JSON.stringify({ ...f, endsAt: Date.now() - 1000 }))
  })
  await page.reload()
  await expect(page.locator('.focus-mini')).toContainText('A little progress, made.')
  harness.userId = 8
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your world. A little closer.' })).toBeVisible()
  await expect(page.locator('.focus-mini')).toHaveCount(0)
})

test('mobile layout fits and unavailable apps do not create a frame', async ({ page, harness }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(origin)
  await expect(page.getByRole('heading', { name: 'Your world. A little closer.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Search apps or intentions' })).toBeVisible()
  await page.goto(origin + '/app/missing-999')
  await expect(page.getByRole('heading', { name: 'This app isn’t available in your profile.' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('keyboard focus stays inside the space editor and Escape returns it', async ({ page, harness }) => {
  await page.goto(origin)
  const trigger = page.getByRole('button', { name: 'Create a space', exact: false })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
