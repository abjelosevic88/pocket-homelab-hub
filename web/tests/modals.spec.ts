import { test, expect, origin } from './fixtures'

for (const viewport of [{ width: 1440, height: 740 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
  test(`capture stays anchored across types at ${viewport.width}×${viewport.height}`, async ({ page, harness }, testInfo) => {
    harness.apps.push({ ...harness.apps[0], id: 7, key: 'day-7', type: 'day', name: 'Pocket Day' })
    harness.daily.destinations.push({ app_key: 'day-7', kind: 'day', name: 'Pocket Day' })
    await page.setViewportSize(viewport)
    await page.goto(origin + '/today')
    await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
    await page.getByLabel('Task title').fill('Keep this title')
    await page.getByLabel('Details (optional)').fill('Keep these words across capture types.')
    const dialog = page.getByRole('dialog')
    const frame = await dialog.boundingBox()
    const tabs = await page.locator('.capture-kinds').boundingBox()
    for (const kind of ['Note', 'Journal moment', 'Task']) {
      await page.locator('.capture-kinds').getByRole('button', { name: kind, exact: false }).click()
      expect(await dialog.boundingBox()).toEqual(frame)
      expect(await page.locator('.capture-kinds').boundingBox()).toEqual(tabs)
      await expect(page.locator('.capture-panel textarea')).toHaveValue('Keep these words across capture types.')
      const save = page.locator('.capture-footer .btn.primary')
      const bounds = await save.boundingBox()
      expect(bounds!.y).toBeGreaterThan(0)
      expect(bounds!.y + bounds!.height).toBeLessThan(viewport.height)
      expect(await page.locator('.sheet-body').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
      const select = page.getByRole('combobox', { name: 'Capture destination' })
      await select.focus()
      await expect(select).toBeInViewport()
      expect(await dialog.boundingBox()).toEqual(frame)
    }
    await expect(page.getByLabel('Task title')).toHaveValue('Keep this title')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('capture.png') })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Quick capture', exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  })
}

test('overlays animate consistently, honor reduced motion and preserve page position', async ({ page, harness }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(origin)
  for (const name of ['Quick capture', 'Search apps or intentions', 'Add widgets', 'Create a space']) {
    const trigger = page.getByRole('button', { name, exact: name === 'Quick capture' })
    await trigger.scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveCSS('animation-name', 'dialog-enter')
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await page.keyboard.press('Escape')
    await expect(page.locator('.backdrop.exiting')).toHaveCSS('animation-name', 'overlay-exit')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(before)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.backdrop')).toHaveCSS('animation-name', 'none')
  await page.locator('.capture-kinds').getByRole('button', { name: /Note/ }).click()
  await expect(page.locator('.capture-panel')).toHaveCSS('animation-name', 'none')
})

test('closing retains an inert overlay for the exit, restores focus, and allows immediate reopening', async ({ page, harness }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(origin + '/today')
  const trigger = page.getByRole('button', { name: 'Quick capture', exact: true })
  for (const method of ['close', 'escape', 'outside']) {
    await trigger.click()
    await page.getByLabel('Task title').fill('Keep my draft through dismissal')
    await page.getByRole('dialog').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)))
    // Pause the outgoing animations as soon as they are attached to inspect the
    // actual exit state without relying on machine-dependent wall-clock timing.
    await page.evaluate(() => {
      const overlay = document.querySelector('.backdrop')!
      new MutationObserver((_, observer) => {
        if (!overlay.classList.contains('exiting')) return
        overlay.getAnimations({ subtree: true }).forEach(a => a.pause())
        observer.disconnect()
      }).observe(overlay, { attributes: true, attributeFilter: ['class'] })
    })
    if (method === 'close') await page.getByRole('button', { name: 'Close', exact: true }).click()
    else if (method === 'escape') await page.keyboard.press('Escape')
    else await page.locator('.backdrop').click({ position: { x: 2, y: 2 } })
    const exit = page.locator('.backdrop.exiting')
    await expect(exit).toHaveAttribute('inert', '')
    await expect(exit.locator('.sheet')).toHaveCSS('animation-name', 'dialog-exit')
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await expect(exit).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
  await trigger.click()
  await expect(page.getByLabel('Task title')).toHaveValue('Keep my draft through dismissal')
  // Reopen during the exit: an old timer must not remove the new dialog.
  await page.keyboard.press('Escape')
  await expect(page.locator('.backdrop.exiting')).toHaveCount(1)
  await page.evaluate(() => window.dispatchEvent(new Event('hub:capture')))
  await page.waitForTimeout(250)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Task title')).toHaveValue('Keep my draft through dismissal')
})

test('animated gallery-to-editor handoff keeps focus in the new dialog', async ({ page, harness }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(origin)
  await page.getByRole('button', { name: 'Add widgets' }).click()
  await page.getByRole('searchbox', { name: 'Search widgets' }).fill('note')
  await page.locator('.widget-choices>button').filter({ hasText: 'Quick note' }).click()
  await page.getByRole('button', { name: 'Add Quick note', exact: true }).click()
  await expect(page.getByLabel('Widget title')).toBeFocused()
  await expect(page.locator('.backdrop.exiting')).toHaveCount(0)
  await expect(page.getByLabel('Widget title')).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.backdrop')).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
})
