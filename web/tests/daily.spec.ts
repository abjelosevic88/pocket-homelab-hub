import { test, expect, origin } from './fixtures'
const sources = [
  { kind: 'tasks', name: 'Pocket Tasks', app_key: 'tasks-1', state: 'ready', message: 'Dates follow your Tasks time zone.', metrics: [{ label: 'Today', value: 3 }, { label: 'Overdue', value: 1 }], items: [{ id: 1, title: 'Call the plumber', detail: '2026-10-21' }] },
  { kind: 'habits', name: 'Pocket Habits', app_key: 'habits-3', state: 'ready', metrics: [{ label: 'Done', value: 1 }, { label: 'Scheduled', value: 2 }], items: [{ id: 2, title: 'A little walk', done: true, detail: 'Done' }] },
  { kind: 'kitchen', name: 'Pocket Kitchen', app_key: 'kitchen-2', state: 'ready', metrics: [{ label: 'Planned meals', value: 1 }], items: [{ id: 3, title: 'Roasted vegetables', detail: 'dinner' }] },
  { kind: 'notes', name: 'Pocket Notes', app_key: 'notes-0', state: 'ready', metrics: [], items: [{ id: 4, title: 'Ideas for the weekend', detail: 'Personal' }] },
]

test('Today gathers real sources, isolates failures and opens apps within the workspace', async ({ page, harness }) => {
  harness.daily.sources = structuredClone(sources)
  harness.daily.sources[2] = { ...sources[2], state: 'unavailable', metrics: [], items: [], message: 'Kitchen could not be refreshed.' }
  await page.goto(origin + '/today')
  await expect(page.getByRole('article', { name: 'Pocket Tasks summary' })).toContainText('Call the plumber')
  await expect(page.getByRole('article', { name: 'Pocket Habits summary' })).toContainText('A little walk')
  await expect(page.getByRole('article', { name: 'Pocket Kitchen summary' })).toContainText('Kitchen could not be refreshed')
  await expect(page.getByRole('article', { name: 'Pocket Kitchen summary' }).locator('.daily-metrics')).toHaveCount(0)
  await page.getByRole('button', { name: /Ideas for the weekend/ }).click()
  await expect(page).toHaveURL(/\/app\/notes-0$/)
  await expect(page.frameLocator('iframe').getByRole('heading')).toHaveText('notes.pocket.test')
})

test('quick capture saves a task from inside another app without losing its draft', async ({ page, harness }) => {
  await page.goto(origin + '/app/notes-0')
  await page.frameLocator('iframe').getByLabel('Draft').fill('Keep my open note intact')
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await page.getByLabel('Task title').fill('Book a dentist appointment')
  await page.getByLabel('Details (optional)').fill('Next week if possible')
  await page.getByLabel('Due date (optional)').fill('2026-10-25')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByText('Task saved.', { exact: true })).toBeVisible()
  expect(harness.captures).toHaveLength(1)
  expect(harness.captures[0]).toMatchObject({ kind: 'task', app_key: 'tasks-1', title: 'Book a dentist appointment', text: 'Next week if possible', due: '2026-10-25' })
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.frameLocator('iframe').getByLabel('Draft')).toHaveValue('Keep my open note intact')
})

test('note drafts survive closing capture and navigation; the shortcut opens only capture', async ({ page, harness }) => {
  await page.goto(origin + '/today')
  await page.getByRole('button', { name: 'Capture a note', exact: false }).click()
  await page.getByLabel('Note title').fill('A thought worth keeping')
  await page.getByLabel('Your note', { exact: true }).fill('Plan a trip with the family.')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Home', exact: true }).first().click()
  await page.keyboard.press('Control+Shift+K')
  await expect(page.getByLabel('Note title')).toHaveValue('A thought worth keeping')
  await expect(page.locator('.palette')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.getByText('Note saved.', { exact: true })).toBeVisible()
  expect(harness.captures[0]).toMatchObject({ kind: 'note', app_key: 'notes-0', text: 'Plan a trip with the family.' })
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await page.getByRole('button', { name: 'Add a task', exact: false }).click()
  await expect(page.getByLabel('Task title')).toHaveValue('')
})

test('journal capture uses the selected day and an available Day destination', async ({ page, harness }) => {
  harness.apps.push({ ...harness.apps[0], id: 7, key: 'day-7', type: 'day', name: 'Pocket Day', url: 'https://day.pocket.test/', open_url: 'https://day.pocket.test/' })
  harness.daily.destinations.push({ app_key: 'day-7', kind: 'day', name: 'Pocket Day' })
  await page.goto(origin + '/today')
  await page.getByRole('button', { name: 'Keep a moment', exact: false }).click()
  await page.getByLabel('Your moment').fill('A beautiful walk after dinner.')
  await page.getByLabel('Day to remember').fill('2026-10-20')
  await page.getByRole('button', { name: 'Save journal moment', exact: true }).click()
  await expect(page.getByText('Journal moment saved.', { exact: true })).toBeVisible()
  expect(harness.captures[0]).toMatchObject({ kind: 'moment', app_key: 'day-7', date: '2026-10-20', text: 'A beautiful walk after dinner.' })
})

test('an uncertain capture keeps the same request identity when checking its receipt', async ({ page, context, harness }) => {
  const attempts: any[] = []
  await context.route('**/api/v1/capture', async route => {
    const body = route.request().postDataJSON(); attempts.push(body)
    if (attempts.length === 1) return route.fulfill({ status: 502, json: { status: 'unknown', app_key: body.app_key, error: 'Check the app before creating another copy.' } })
    return route.fulfill({ status: 201, json: { status: 'saved', app_key: body.app_key, kind: body.kind, id: 34 } })
  })
  await page.goto(origin)
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await page.getByLabel('Task title').fill('Only one copy')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('before creating another copy')
  await expect(page.getByLabel('Task title')).toBeDisabled()
  await page.getByRole('button', { name: 'Check saved status', exact: true }).click()
  await expect(page.getByText('Task saved.', { exact: true })).toBeVisible()
  expect(attempts).toHaveLength(2)
  expect(attempts[0]).toEqual(attempts[1])
})

test('unavailable connections preserve a draft and never invent summaries', async ({ page, harness }) => {
  harness.dailyFails = true
  await page.goto(origin + '/today')
  await expect(page.getByRole('alert')).toContainText('couldn’t refresh')
  await expect(page.locator('.daily-metrics')).toHaveCount(0)
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await page.getByLabel('Task title').fill('Keep this while disconnected')
  await expect(page.getByRole('button', { name: 'Save task', exact: true })).toBeDisabled()
  harness.dailyFails = false
  await page.getByRole('button', { name: 'Refresh connections', exact: true }).click()
  await expect(page.getByLabel('Task title')).toHaveValue('Keep this while disconnected')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByText('Task saved.', { exact: true })).toBeVisible()
})

test('connected widgets use shared daily data and filter apps outside the current profile', async ({ page, harness }) => {
  harness.daily.sources = structuredClone(sources)
  harness.prefs = { home_widgets: ['tasks-today', 'habit-progress', 'meal-plan', 'recent-notes'].map(kind => ({ id: kind, kind, size: 'medium', config: {} })) }
  await page.goto(origin)
  await expect(page.getByRole('article', { name: 'Tasks today widget' })).toContainText('Call the plumber')
  await expect(page.getByRole('article', { name: 'Meal plan widget' })).toContainText('Roasted vegetables')
  harness.apps = harness.apps.filter(t => t.type !== 'notes')
  await page.reload()
  await expect(page.getByRole('article', { name: 'Recent notes widget' })).not.toContainText('Ideas for the weekend')
  await expect(page.getByRole('article', { name: 'Recent notes widget' })).toContainText('Connect this app')
})

test('Today and capture fit a phone and render without browser errors', async ({ page, harness }, testInfo) => {
  harness.daily.sources = structuredClone(sources)
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin + '/today')
  await expect(page.locator('.daily-card')).toHaveCount(4)
  await page.screenshot({ path: testInfo.outputPath('today-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('today-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('capture-mobile.png') })
  await page.getByRole('button', { name: 'Save task', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Quick capture', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})

test('an explicitly refused capture can be retried after access is fixed', async ({ page, context, harness }) => {
  const attempts: any[] = []
  await context.route('**/api/v1/capture', async route => {
    const body = route.request().postDataJSON(); attempts.push(body)
    if (attempts.length === 1) return route.fulfill({ status: 502, json: { status: 'failed', app_key: body.app_key, error: 'The app refused this capture.' } })
    return route.fulfill({ status: 201, json: { status: 'saved', app_key: body.app_key, kind: body.kind, id: 35 } })
  })
  await page.goto(origin)
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await page.getByLabel('Task title').fill('Try when access is fixed')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('refused')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByText('Task saved.', { exact: true })).toBeVisible()
  expect(attempts[0].request_id).not.toBe(attempts[1].request_id)
  expect(attempts[0].title).toBe(attempts[1].title)
})
