import { test, expect, origin } from './fixtures'

test('Pocket Box home puts apps first beside daily content and widgets without changing preferences', async ({ page, harness }, testInfo) => {
  harness.daily.sources = [
    {kind:'tasks',name:'Pocket Tasks',app_key:'tasks-1',state:'ready',metrics:[{label:'Today',value:3},{label:'Overdue',value:0}],items:[{id:1,title:'Book the weekend away'},{id:2,title:'Call mum'},{id:3,title:'Pack a bag'}]},
    {kind:'habits',name:'Pocket Habits',app_key:'habits-3',state:'ready',metrics:[{label:'Done',value:1},{label:'Scheduled',value:2}],items:[{id:4,title:'Get outside',done:true}]},
    {kind:'kitchen',name:'Pocket Kitchen',app_key:'kitchen-2',state:'ready',metrics:[{label:'Planned meals',value:1}],items:[{id:5,title:'Roast vegetables',detail:'Dinner'}]},
    {kind:'notes',name:'Pocket Notes',app_key:'notes-0',state:'ready',metrics:[],items:[{id:6,title:'Ideas for our next trip',detail:'Personal'}]},
  ]
  const before = structuredClone(harness.prefs)
  await page.goto(origin)
  await expect(page.getByRole('region', { name: 'Your day at a glance' })).toContainText('Book the weekend away')
  await expect(page.locator('.home-daily .daily-items').first().locator('button')).toHaveCount(3)
  await expect(page.locator('.widget-grid .home-widget')).toHaveCount(7)
  await expect(page.locator('.dock')).toHaveCount(0)
  await expect(page.locator('.home-apps .tile')).toHaveCount(6)
  await expect(page.getByRole('status').filter({ hasText: 'Everything is running smoothly' })).toBeVisible()
  await expect(page.locator('.sidebar .pocket-brand img')).toHaveAttribute('src', '/pocket-box.png')
  await expect.poll(() => page.locator('.sidebar .pocket-brand img').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(512)
  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe('/pocket-box-favicon.png?v=rounded')
  expect(harness.prefs).toEqual(before)
  await page.screenshot({ path: testInfo.outputPath('box-home-desktop.png'), fullPage: true })
  for (const width of [1024, 800, 768, 390, 320]) {
    await page.setViewportSize({width,height:900})
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: 'Quick capture', exact:true })).toBeVisible()
    if (width <= 800) await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('box-home-mobile.png'), fullPage:true })
  }
  await page.getByRole('button', { name: /Book the weekend away/ }).click()
  await expect(page).toHaveURL(/\/app\/tasks-1$/)
  await expect(page.frameLocator('iframe').getByRole('heading')).toHaveText('tasks.pocket.test')
  const frame = await page.locator('iframe').boundingBox()
  expect(frame!.height).toBeGreaterThan(400)
  expect(frame!.width).toBeLessThanOrEqual(320)
})

test('existing favorites, widgets and app grid survive the new shell', async ({ page, harness }) => {
  harness.prefs = { wallpaper:'dusk', dock:['kitchen-2','notes-0'], home_show_apps:true, home_widgets:[{id:'my-note',kind:'note',size:'large',config:{title:'Our home',note:'Keep the family plan'}}] }
  const before = structuredClone(harness.prefs)
  await page.goto(origin)
  await expect(page.locator('.sidebar-favorites>button')).toHaveText(['Kitchen','Notes'])
  await expect(page.getByRole('article', {name:'Our home widget'})).toContainText('Keep the family plan')
  await expect(page.locator('.home-apps')).toBeVisible()
  await page.getByRole('button', {name:'Open Pocket Notes',exact:true}).click()
  await page.frameLocator('iframe').getByLabel('Draft').fill('Do not lose this')
  await page.getByRole('link', {name:'Home',exact:true}).click()
  await page.getByRole('button', {name:'Open Pocket Notes',exact:true}).click()
  await expect(page.frameLocator('iframe').getByLabel('Draft')).toHaveValue('Do not lose this')
  expect(harness.prefs).toEqual(before)
})

test('Pocket Box identity carries through library, settings, login and installable icons', async ({ page, context, harness }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  for (const path of ['/apps', '/settings']) {
    await page.goto(origin + path)
    await expect(page.getByRole('heading', {name:path==='/apps'?'Apps':'Settings',exact:true})).toBeVisible()
    await page.screenshot({path:testInfo.outputPath(path.slice(1)+'.png'),fullPage:true})
  }
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
  expect(manifest.theme_color).toBe('#f4f5f7')
  expect(manifest.icons).toHaveLength(3)
  await context.route('**/api/v1/auth/status', route => route.fulfill({json:{authenticated:false,user:null,needs_setup:false,oidc:true,password_login:false}}))
  await page.goto(origin + '/login')
  await expect(page.getByRole('heading', {name:'Welcome home',exact:true})).toBeVisible()
  await expect(page.locator('.login-logo')).toHaveAttribute('src','/pocket-box.png')
  await expect(page.getByRole('link', {name:'Sign in',exact:true})).toHaveAttribute('href',/auth\/oidc\/start/)
  await page.screenshot({path:testInfo.outputPath('login.png')})
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path:testInfo.outputPath('login-mobile.png')})
  expect(errors).toEqual([])
})
