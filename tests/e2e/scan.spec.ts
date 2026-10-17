import { test, expect } from '@playwright/test'

test('scans a QR code from file', async ({ page }) => {
  await page.goto('/')
  const scan = page.getByRole('navigation').getByRole('button', { name: 'Scan', exact: true })
  await scan.click()
  await expect(scan).toHaveAttribute('aria-pressed', 'true')
  const input = page.locator('input[type="file"]')
  await expect(input).toHaveCount(1)
  await input.setInputFiles('tests/e2e/fixtures/test-qrcode.png')
  await expect(page.getByText('Test QR Data')).toBeVisible({ timeout: 10000 })
})
