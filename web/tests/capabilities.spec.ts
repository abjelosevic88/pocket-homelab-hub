import { test, expect, origin } from './fixtures'

// An app Hub has no code for: everything shown about it comes from the server,
// which read it from the app's manifest and its widget.
const garden = { key: 'garden-9', id: 9, type: 'garden', name: 'Pocket Garden', pocket: true, status: 'ok', group: 'Pocket', icon: '/icons/pocket-habits.svg', url: 'https://garden.pocket.test/', open_url: 'https://garden.pocket.test/api/v1/auth/oidc/start' }
const gardenApp = { app_key: 'garden-9', kind: 'garden', name: 'Pocket Garden' }
const gardenSource = { ...gardenApp, title: 'Garden today', what: 'What needs water and what is ready to pick', state: 'ready', line: '2 beds need water', url: 'https://garden.pocket.test/today', metrics: [{ label: 'Beds', value: 3 }], figures: [{ label: 'Beds', value: '3' }, { label: 'Watered', value: '1 of 3' }], items: [{ id: 7, ref: '7', title: 'Tomatoes', detail: 'water today', url: 'https://garden.pocket.test/bed/7' }, { id: -2, ref: 'b-2', title: 'Basil', done: true }] }
const sowing = { ...gardenApp, capture_kind: 'sowing', label: 'Sowing', what: 'A new row in your sowing diary', fields: ['title', 'date'] }

test('Today shows an app Hub was never told about, under the title the app gave', async ({ page, harness }) => {
  harness.apps.push(garden as any)
  harness.daily.sources = [gardenSource]
  harness.daily.more = [{ app_key: 'shed-10', kind: 'shed', name: 'Pocket Shed', title: 'Shed' }, { ...gardenApp, app_key: 'garden-11' }]
  harness.apps.push({ ...garden, key: 'garden-11', id: 11 } as any)
  await page.goto(origin + '/today')
  const card = page.getByRole('article', { name: 'Pocket Garden summary' })
  await expect(card.locator('.daily-card-heading')).toContainText('Garden today')
  await expect(card).toContainText('2 beds need water')
  await expect(card.locator('.daily-metrics')).toContainText('1 of 3')
  await expect(card).not.toContainText('undefined')
  // Only apps on this account are counted as waiting.
  await expect(page.locator('.daily-more')).toContainText('One more app has a summary')
  // A row opens its own place in the app, inside the workspace.
  await card.getByRole('button', { name: /Tomatoes/ }).click()
  await expect(page).toHaveURL(/\/app\/garden-9$/)
  // It goes through the app's sign-in start, so the item opens with the person signed in.
  const frame = page.locator('iframe[title="Pocket Garden"]')
  await expect(frame).toHaveAttribute('src', 'https://garden.pocket.test/api/v1/auth/oidc/start?next=%2Fbed%2F7')
  // A row without an address goes to the open app as it is.
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await page.getByRole('article', { name: 'Pocket Garden summary' }).getByRole('button', { name: /Basil/ }).click()
  await expect(page).toHaveURL(/\/app\/garden-9$/)
  await expect(frame).toHaveAttribute('src', 'https://garden.pocket.test/api/v1/auth/oidc/start?next=%2Fbed%2F7')
  // Once its tab is closed, the app starts at its front door again.
  await page.getByRole('button', { name: 'Close Pocket Garden' }).click()
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await page.getByRole('article', { name: 'Pocket Garden summary' }).getByRole('button', { name: /Basil/ }).click()
  await expect(frame).toHaveAttribute('src', 'https://garden.pocket.test/api/v1/auth/oidc/start')
})

test('the widget gallery offers each app that has a summary, and Home asks for the ones added', async ({ page, context, harness }) => {
  const asked: string[] = []
  await context.route('**/api/v1/daily?*', async route => { asked.push(new URL(route.request().url()).searchParams.get('want') || ''); await route.fallback() })
  harness.apps.push(garden as any)
  harness.daily.sources = [gardenSource]
  harness.daily.more = [{ app_key: 'shed-10', kind: 'shed', name: 'Pocket Shed', title: 'Shed' }]
  harness.prefs = { home_widgets: [{ id: 'old-tasks', kind: 'tasks-today', size: 'medium', config: {} }] }
  await page.goto(origin)
  await expect(page.getByRole('article', { name: 'Tasks today widget' })).toBeVisible()
  await page.getByRole('button', { name: 'Add widgets' }).click()
  const choice = page.locator('.widget-choices>button').filter({ hasText: 'Garden today' })
  await expect(choice).toContainText('Pocket Garden')
  await expect(choice.locator('img')).toHaveAttribute('src', '/icons/pocket-habits.svg')
  // An app that is not on this account is not offered.
  await expect(page.locator('.widget-choices>button').filter({ hasText: 'Shed' })).toHaveCount(0)
  await choice.click()
  await expect(page.locator('.widget-gallery-detail')).toContainText('What needs water and what is ready to pick')
  await page.getByRole('button', { name: 'Add Garden today', exact: true }).click()
  const widget = page.getByRole('article', { name: 'Garden today widget' })
  await expect(widget).toContainText('2 beds need water')
  await expect(widget).toContainText('Tomatoes')
  await expect(widget.locator('.w-live-metrics')).toContainText('1 of 3')
  await expect.poll(() => harness.prefs.home_widgets?.map((w: any) => `${w.kind}:${w.config.appKey || ''}`)).toEqual(['tasks-today:', 'app:garden-9'])
  await expect.poll(() => asked[asked.length - 1]).toBe('garden-9')
  await widget.getByRole('button', { name: 'Open Pocket Garden' }).click()
  await expect(page.locator('iframe[title="Pocket Garden"]')).toHaveAttribute('src', 'https://garden.pocket.test/api/v1/auth/oidc/start?next=%2Ftoday')
})

test('a saved app widget says so when its app is gone, and can be pointed at another', async ({ page, harness }) => {
  harness.apps.push(garden as any)
  harness.daily.sources = [gardenSource]
  harness.prefs = { home_widgets: [{ id: 'w1', kind: 'app', size: 'medium', config: { appKey: 'shed-10' } }, { id: 'w2', kind: 'app', size: 'medium', config: {} }, { id: 'w3', kind: 'app', size: 'small', config: { appKey: 'garden-3' } }] }
  await page.goto(origin)
  await expect(page.getByRole('article', { name: 'App summary widget' }).first()).toContainText('no longer on your account')
  await expect(page.getByRole('article', { name: 'App summary widget' }).nth(1)).toContainText('Pick one of your apps')
  // The app came back under a new id: its type still finds it.
  await expect(page.getByRole('article', { name: 'Garden today widget' })).toContainText('2 beds need water')
  await page.getByRole('article', { name: 'App summary widget' }).nth(1).getByRole('button', { name: /Choose an app/ }).click()
  await page.getByRole('dialog').getByLabel('App').selectOption('garden-9')
  await page.getByRole('button', { name: 'Save widget' }).click()
  await expect(page.getByRole('article', { name: 'Garden today widget' })).toHaveCount(2)
})

test('quick capture offers what each app says it keeps, with only the fields it takes', async ({ page, context, harness }) => {
  // This app has no sign-in start of its own: the new item's address is opened as it is.
  harness.apps.push({ ...garden, open_url: garden.url } as any)
  harness.daily.destinations.push(sowing, { ...gardenApp, capture_kind: 'harvest', label: 'Harvest', fields: [] })
  await context.route('**/api/v1/capture', async route => {
    const body = route.request().postDataJSON(); harness.captures.push(body)
    await route.fulfill({ status: 201, json: { status: 'saved', app_key: body.app_key, kind: body.kind, id: 0, item_id: 's-44', url: 'https://garden.pocket.test/sowing/s-44' } })
  })
  await page.goto(origin)
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  // The three Hub has always had come first, as buttons; the rest sit under More, by app.
  await expect(page.locator('.capture-kinds button')).toHaveText([/Task/, /Note/, /Journal moment/])
  const more = page.getByRole('combobox', { name: 'More things to add' })
  await expect(more.locator('optgroup')).toHaveAttribute('label', 'Pocket Garden')
  await expect(more.locator('option')).toHaveText(['More…', 'Sowing', 'Harvest'])
  await page.getByLabel('Task title').fill('Carrots')
  await page.getByLabel('Due date (optional)').fill('2026-10-30')
  await more.selectOption({ label: 'Sowing' })
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Carrots')
  await expect(page.getByLabel('Due date (optional)')).toHaveCount(0)
  await expect(page.locator('.capture-panel')).toContainText('A new row in your sowing diary')
  await expect(page.getByRole('combobox', { name: 'Capture destination' })).toHaveValue('garden-9')
  await page.getByLabel('Details').fill('Second bed')
  await page.getByLabel('Day', { exact: true }).fill('2026-10-21')
  await page.getByRole('button', { name: 'Save sowing', exact: true }).click()
  await expect(page.getByText('Sowing saved.', { exact: true })).toBeVisible()
  expect(harness.captures).toHaveLength(1)
  expect(harness.captures[0]).toMatchObject({ app_key: 'garden-9', kind: 'sowing', title: 'Carrots', text: 'Second bed', due: '', date: '2026-10-21' })
  // The new item can be opened straight away.
  await page.getByRole('button', { name: 'Open it', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/garden-9$/)
  await expect(page.locator('iframe[title="Pocket Garden"]')).toHaveAttribute('src', 'https://garden.pocket.test/sowing/s-44')
  // A kind without a title takes just the words.
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await page.getByRole('combobox', { name: 'More things to add' }).selectOption({ label: 'Harvest' })
  await expect(page.getByLabel('Your harvest')).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save harvest', exact: true })).toBeDisabled()
})

test('what the app says is wrong with a capture is shown, and the draft can be sent again', async ({ page, context, harness }) => {
  harness.apps.push(garden as any)
  harness.daily.destinations.push(sowing)
  const attempts: any[] = []
  await context.route('**/api/v1/capture', async route => {
    const body = route.request().postDataJSON(); attempts.push(body)
    if (attempts.length === 1) return route.fulfill({ status: 400, json: { status: 'failed', app_key: body.app_key, error: 'the sowing diary is full for this year' } })
    return route.fulfill({ status: 201, json: { status: 'saved', app_key: body.app_key, kind: body.kind, id: 45 } })
  })
  await page.goto(origin)
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await page.getByRole('combobox', { name: 'More things to add' }).selectOption({ label: 'Sowing' })
  await page.getByLabel('Title', { exact: true }).fill('Carrots')
  await page.getByRole('button', { name: 'Save sowing', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('the sowing diary is full for this year')
  await page.getByRole('button', { name: 'Save sowing', exact: true }).click()
  await expect(page.getByText('Sowing saved.', { exact: true })).toBeVisible()
  // No address came back this time, so the app itself is offered.
  await expect(page.getByRole('button', { name: 'Open app', exact: true })).toBeVisible()
  expect(attempts[0].request_id).not.toBe(attempts[1].request_id)
})

test('an app Pocket Core does not let Hub read is listed with the reason, and its widget says why it is empty', async ({ page, harness }) => {
  harness.apps.push(garden as any)
  const reason = 'You switched this off in Pocket Core. You can switch it back on there, in Settings under Apps acting for me.'
  harness.daily.more = [{ ...gardenApp, title: 'Garden today', what: 'What needs water and what is ready to pick', off: reason }]
  harness.prefs = { home_widgets: [{ id: 'w1', kind: 'app', size: 'medium', config: { appKey: 'garden-9' } }] }
  await page.goto(origin)
  const widget = page.getByRole('article', { name: 'Garden today widget' })
  await expect(widget).toContainText('You switched this off in Pocket Core')
  await expect(widget.getByRole('button', { name: /Choose an app/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add widgets' }).click()
  await page.locator('.widget-choices>button').filter({ hasText: 'Garden today' }).click()
  await expect(page.locator('.widget-gallery-off')).toHaveText(reason)
  // It is not counted among the apps that only wait their turn.
  await page.keyboard.press('Escape')
  await page.goto(origin + '/today')
  await expect(page.locator('.daily-more')).toHaveCount(0)
})

test('an app linked for the person that is not on their launcher list still shows, and opens at its own address', async ({ page, harness }) => {
  const shed = { app_key: 'shed', kind: 'shed', name: 'Pocket Shed', icon: '/icons/pocket-notes.svg', app_url: 'https://shed.pocket.test' }
  harness.daily.sources = [{ ...shed, title: 'Shed', state: 'ready', line: '1 tool lent out', metrics: [], figures: [], items: [{ id: 3, ref: '3', title: 'Spade', url: 'https://shed.pocket.test/tool/3' }] }]
  harness.daily.destinations.push({ ...shed, capture_kind: 'tool', label: 'Tool', fields: ['title'] })
  await page.goto(origin + '/today')
  const card = page.getByRole('article', { name: 'Pocket Shed summary' })
  await expect(card).toContainText('1 tool lent out')
  await expect(card.locator('img')).toHaveAttribute('src', '/icons/pocket-notes.svg')
  const [tab] = await Promise.all([page.waitForEvent('popup'), card.getByRole('button', { name: /Spade/ }).click()])
  expect(tab.url()).toBe('https://shed.pocket.test/tool/3')
  await expect(page).toHaveURL(/\/today$/)
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'More things to add' }).locator('option')).toHaveText(['More…', 'Tool'])
})

test('an app sits on the shelf it names for itself, in its own word', async ({ page, harness }) => {
  // bookshelf and podcasts are "Photos & media" in Hub's own table.
  harness.apps = harness.apps.map(t => t.type === 'bookshelf' ? { ...t, category: 'everyday' } : t.type === 'podcasts' ? { ...t, category: 'Gardening' } : t) as any
  harness.apps.push({ ...garden, category: ' Media ' } as any, { ...garden, key: 'shed-10', id: 10, type: 'shed', name: 'Pocket Shed', category: 'Home' } as any,
    { ...garden, key: 'ledger-11', id: 11, type: 'ledger', name: 'Pocket Ledger', category: 'FINANCE' } as any, { ...garden, key: 'barn-12', id: 12, type: 'barn', name: 'Pocket Barn', category: 'Barns' } as any)
  await page.goto(origin)
  const shelf = page.locator('.home-apps .app-shelf')
  await expect(shelf.locator('.shelf-label')).toHaveText(['Everyday5', 'Money1', 'Photos & media2', 'Life & places1', 'More apps1'])
  await page.goto(origin + '/apps')
  await expect(page.getByRole('region', { name: 'Everyday' })).toContainText('Bookshelf')
  await expect(page.getByRole('region', { name: 'Photos & media' })).toContainText('Garden')
  // A word that is no shelf leaves the app where Hub's own table has it.
  await expect(page.getByRole('region', { name: 'Photos & media' })).toContainText('Podcasts')
  await expect(page.getByRole('region', { name: 'Life & places' })).toContainText('Shed')
  await expect(page.getByRole('region', { name: 'Money' })).toContainText('Ledger')
  await expect(page.getByRole('region', { name: 'More apps' })).toContainText('Barn')
})
