import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const BLUE_FIXTURE = fileURLToPath(new URL('./fixtures/frame-bg-blue.png', import.meta.url))

async function openFrameSettings(page: Page) {
  const header = page.getByRole('button', { name: /frame settings/i })
  await expect(header).toBeVisible()
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  await expect(page.locator('#show-frame')).toBeVisible()
}

async function selectBackground(page: Page, type: 'color' | 'image') {
  const radio = page.locator(`#frame-background-type-${type}`)
  // Keyboard interaction avoids pointer targeting assumptions in the new grid.
  await expect(radio).toBeVisible()
  await radio.focus()
  await radio.press('Space')
  await expect(radio).toBeChecked()
}

async function uploadBackground(page: Page) {
  await selectBackground(page, 'image')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('#frame-background-image-upload').click()
  await (await chooserPromise).setFiles(BLUE_FIXTURE)
  await expect.poll(() => backgroundImage(page)).toContain('data:image/png')
}

function backgroundImage(page: Page) {
  return page.locator('#element-to-export .w-fit').first()
    .evaluate((el) => getComputedStyle(el).backgroundImage)
}

async function waitForStoredBackground(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('qrCodeConfig') || '')).toContain('data:image/png')
}

test.describe('Studio frame background', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await openFrameSettings(page)
    // Framing is already enabled on a fresh studio visit.
    await expect(page.locator('#show-frame')).toBeChecked()
  })

  test('switches between color and image controls', async ({ page }) => {
    await expect(page.locator('#frame-background-type-color')).toBeChecked()
    await expect(page.locator('#frame-bg-color')).toBeVisible()
    await expect(page.locator('#frame-background-image-upload')).toHaveCount(0)
    await selectBackground(page, 'image')
    await expect(page.locator('#frame-background-image-upload')).toBeVisible()
    await expect(page.locator('#frame-bg-color')).toHaveCount(0)
  })

  test('renders the uploaded image in the frame preview', async ({ page }) => {
    await uploadBackground(page)
  })

  test('selecting Color clears the uploaded background', async ({ page }) => {
    await uploadBackground(page)
    await selectBackground(page, 'color')
    await expect.poll(() => backgroundImage(page)).toBe('none')
    await expect(page.locator('#frame-bg-color')).toBeVisible()
  })

  test('restores the uploaded background and image selection after reload', async ({ page }) => {
    await uploadBackground(page)
    await waitForStoredBackground(page)
    await page.reload()
    await expect.poll(() => backgroundImage(page)).toContain('data:image/png')
    await openFrameSettings(page)
    await expect(page.locator('#frame-background-type-image')).toBeChecked()
    await expect(page.locator('#frame-background-image-upload')).toBeVisible()
  })

  for (const format of ['png', 'svg'] as const) {
    test(`exports a restored background as ${format.toUpperCase()}`, async ({ page }, testInfo) => {
      await uploadBackground(page)
      await waitForStoredBackground(page)
      await page.reload()
      await expect.poll(() => backgroundImage(page)).toContain('data:image/png')
      // The current studio intentionally clears the content editor on reload.
      // Enter content again before exporting; do not assume data persistence.
      await expect(page.locator('#data')).toHaveValue('')
      await page.locator('#data').fill(`frame-background-${format}`)
      const exportButton = page.locator(`#download-qr-image-button-${format}`)
      await expect(exportButton).toBeEnabled()
      await page.waitForTimeout(600)
      const downloadPromise = page.waitForEvent('download')
      await exportButton.click()
      const download = await downloadPromise
      expect(await download.failure()).toBeNull()
      const output = testInfo.outputPath(`background.${format}`)
      await download.saveAs(output)
      expect(fs.statSync(output).size).toBeGreaterThan(0)
      if (format === 'svg') {
        const svg = fs.readFileSync(output, 'utf8')
        expect(svg).toContain('<svg')
        expect(svg).toMatch(/<image\b[^>]*(?:href|xlink:href)="data:image\/png/)
      } else {
        const metadata = await sharp(output).metadata()
        expect(metadata.format).toBe('png')
        const pixel = await sharp(output).extract({
          left: Math.round(metadata.width! * 0.04),
          top: Math.round(metadata.height! * 0.04),
          width: 1,
          height: 1
        }).removeAlpha().raw().toBuffer()
        expect(pixel[2]).toBeGreaterThan(200)
        expect(pixel[0]).toBeLessThan(40)
        expect(pixel[1]).toBeLessThan(40)
      }
    })
  }
})
