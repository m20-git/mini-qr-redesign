import { test, expect, type Page } from '@playwright/test'

const simpleToggle = (page: Page) => page.locator('#view-mode-simple')
const fullToggle = (page: Page) => page.locator('#view-mode-full')
const frameHeader = (page: Page) => page.getByRole('button', { name: /frame settings/i })
const designHeader = (page: Page) => page.getByRole('button', { name: /^design$/i })

async function openDesign(page: Page) {
  const header = designHeader(page)
  await expect(header).toBeVisible()
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}

async function customize(page: Page) {
  await page.locator('#customize-fields-button').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

async function closeCustomizer(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

test.describe('Studio field selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(fullToggle(page)).toHaveAttribute('aria-checked', 'true')
    // The studio enables a frame on first visit. Establish the frame-free
    // starting state explicitly for tests about hiding empty sections.
    const header = frameHeader(page)
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
    await expect(page.locator('#show-frame')).toBeChecked()
    await page.locator('#show-frame').uncheck()
    await expect(page.locator('#show-frame')).not.toBeChecked()
  })

  test('full mode exposes design controls after opening Design', async ({ page }) => {
    await expect(simpleToggle(page)).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('#data')).toBeVisible()
    await openDesign(page)
    await expect(page.locator('#dots-color')).toBeVisible()
    await expect(page.locator('#width')).toBeVisible()
  })

  test('data-only selection keeps content and export controls but hides empty groups', async ({ page }) => {
    await simpleToggle(page).click()
    await expect(simpleToggle(page)).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('#data')).toBeVisible()
    await expect(page.locator('#copy-qr-image-button')).toBeVisible()
    await expect(designHeader(page)).toBeHidden()
    await expect(frameHeader(page)).toBeHidden()
    await expect(page.locator('#dots-color')).toBeHidden()
    await expect(page.locator('#width')).toBeHidden()
  })

  test('shows Design and Frame when their fields are selected', async ({ page }) => {
    await simpleToggle(page).click()
    const dialog = await customize(page)
    await dialog.getByRole('checkbox', { name: 'Dots color', exact: true }).check()
    await dialog.getByRole('checkbox', { name: 'Add frame', exact: true }).check()
    await dialog.getByRole('checkbox', { name: 'Frame preset', exact: true }).check()
    await closeCustomizer(page)
    await openDesign(page)
    await expect(page.locator('#dots-color')).toBeVisible()
    await expect(frameHeader(page)).toBeVisible()
    await expect(page.locator('#show-frame')).toBeChecked()
  })

  test('selected design fields and mode persist across reload', async ({ page }) => {
    await simpleToggle(page).click()
    const dialog = await customize(page)
    await dialog.getByRole('checkbox', { name: 'Dots color', exact: true }).check()
    await closeCustomizer(page)
    await openDesign(page)
    await expect(page.locator('#dots-color')).toBeVisible()
    await expect(page.locator('#width')).toBeHidden()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('qrSimpleFields') || '')).toContain('dotsColor')
    await page.reload()
    await expect(simpleToggle(page)).toHaveAttribute('aria-checked', 'true')
    await openDesign(page)
    await expect(page.locator('#dots-color')).toBeVisible()
    await expect(page.locator('#width')).toBeHidden()
  })

  test('frame choices appear after Add frame and selected caption is editable', async ({ page }) => {
    await simpleToggle(page).click()
    const dialog = await customize(page)
    await expect(dialog.getByRole('checkbox', { name: 'Frame preset', exact: true })).toBeHidden()
    await dialog.getByRole('checkbox', { name: 'Add frame', exact: true }).check()
    await expect(dialog.getByRole('checkbox', { name: 'Frame preset', exact: true })).toBeVisible()
    await dialog.getByRole('checkbox', { name: 'Caption', exact: true }).check()
    await closeCustomizer(page)
    await expect(page.locator('#show-frame')).toBeChecked()
    await expect(page.locator('#frame-text')).toBeVisible()
    await page.locator('#frame-text').fill('Selected caption')
    await expect(page.locator('#frame-text')).toHaveValue('Selected caption')
    await expect(page.locator('#frame-text-color')).toBeHidden()
  })

  test('reset removes selected design fields and the empty Design section', async ({ page }) => {
    await simpleToggle(page).click()
    let dialog = await customize(page)
    await dialog.getByRole('checkbox', { name: 'Dots color', exact: true }).check()
    await closeCustomizer(page)
    await openDesign(page)
    await expect(page.locator('#dots-color')).toBeVisible()
    dialog = await customize(page)
    await dialog.getByRole('button', { name: 'Reset to data only', exact: true }).click()
    await closeCustomizer(page)
    await expect(designHeader(page)).toBeHidden()
    await expect(page.locator('#dots-color')).toBeHidden()
    await expect(page.locator('#data')).toBeVisible()
  })

  test('reset disables the frame and removes the Frame section', async ({ page }) => {
    await simpleToggle(page).click()
    let dialog = await customize(page)
    await dialog.getByRole('checkbox', { name: 'Add frame', exact: true }).check()
    await dialog.getByRole('checkbox', { name: 'Caption', exact: true }).check()
    await closeCustomizer(page)
    await expect(page.locator('#show-frame')).toBeChecked()
    dialog = await customize(page)
    await dialog.getByRole('button', { name: 'Reset to data only', exact: true }).click()
    await closeCustomizer(page)
    await expect(frameHeader(page)).toBeHidden()
    await expect(page.locator('#show-frame')).toBeHidden()
  })

  test('returning to full mode restores the Design controls', async ({ page }) => {
    await simpleToggle(page).click()
    await expect(designHeader(page)).toBeHidden()
    await fullToggle(page).click()
    await expect(fullToggle(page)).toHaveAttribute('aria-checked', 'true')
    await openDesign(page)
    await expect(page.locator('#dots-color')).toBeVisible()
    await expect(page.locator('#width')).toBeVisible()
  })
})
