import { test, expect } from '@playwright/test'
import { fillData, setFrame, waitForPreview } from '../helpers/qr-test-utils'

test.describe('Export preview visual comparisons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#data')).toBeVisible()
    await waitForPreview(page)
  })
  for (const format of ['png', 'jpg'] as const) {
    for (const framed of [false, true]) {
      test(`${format.toUpperCase()} ${framed ? 'with' : 'without'} a frame`, async ({ page }) => {
        await setFrame(page, framed)
        if (framed) await page.locator('#frame-text').fill(`${format.toUpperCase()} Frame Test`)
        await fillData(page, `${format}-export-${framed ? 'with' : 'no'}-frame`)
        const name = format === 'png'
          ? `qr-${framed ? 'with' : 'no'}-frame.png`
          : `qr-${framed ? 'with' : 'no'}-frame-as-jpg.png`
        await expect(page.locator('#element-to-export')).toHaveScreenshot(name)
      })
    }
  }
})
