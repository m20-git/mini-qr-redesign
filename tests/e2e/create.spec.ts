import { test, expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'fs'
import sharp from 'sharp'
import { checkExport } from '../helpers/qr-test-utils'

async function openSection(page: Page, name: RegExp) {
  const header = page.getByRole('button', { name })
  await expect(header).toBeVisible()
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}
const openDesign = (page: Page) => openSection(page, /^design$/i)
const openFrame = (page: Page) => openSection(page, /frame settings/i)

async function setFrame(page: Page, enabled: boolean) {
  await openFrame(page)
  await page.locator('#show-frame').setChecked(enabled)
  await expect(page.locator('#show-frame')).toBeChecked({ checked: enabled })
}

async function downloadFile(page: Page, button: string, file: string) {
  const pending = page.waitForEvent('download')
  await page.locator(button).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  await download.saveAs(file)
  expect(fs.statSync(file).size).toBeGreaterThan(0)
  return download
}

async function loadConfig(page: Page, file: string) {
  const pending = page.waitForEvent('filechooser')
  await page.locator('#load-qr-code-config-button').click()
  await (await pending).setFiles(file)
}

async function switchToScanMode(page: Page) {
  const scan = page.getByRole('navigation').getByRole('button', { name: 'Scan', exact: true })
  await scan.click()
  await expect(scan).toHaveAttribute('aria-pressed', 'true')
}

async function exportPng(page: Page, data: string, info: TestInfo, filename: string) {
  await page.locator('#data').fill(data)
  await setFrame(page, false)
  await page.waitForTimeout(800)
  const file = info.outputPath(filename)
  await downloadFile(page, '#download-qr-image-button-png', file)
  return file
}

test.describe('QR Code Creation and Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#data')).toBeVisible()
  })

  test.describe('Save and Load QR Configs (File Operations)', () => {
    for (const withFrame of [false, true]) {
      test(`should save and load QR config ${withFrame ? 'with' : 'without'} a frame via file`, async ({ page }, info) => {
        const data = withFrame ? 'Config Test With Frame' : 'Config Test No Frame'
        await page.locator('#data').fill(data)
        await openDesign(page)
        await page.locator('#dots-color').fill('#112233')
        await setFrame(page, withFrame)
        if (withFrame) {
          await page.locator('#frame-text').fill('My Frame For Config')
          await page.locator('#frame-text-color').fill('#aabbcc')
        }
        await page.waitForTimeout(600)
        const file = info.outputPath('config.json')
        await downloadFile(page, '#save-qr-code-config-button', file)
        await page.locator('#data').fill('Changed before load')
        await openDesign(page)
        await page.locator('#dots-color').fill('#000000')
        await setFrame(page, !withFrame)
        await loadConfig(page, file)
        await expect(page.locator('#data')).toHaveValue(data)
        await openDesign(page)
        await expect(page.locator('#dots-color')).toHaveValue('#112233')
        await openFrame(page)
        await expect(page.locator('#show-frame')).toBeChecked({ checked: withFrame })
        if (withFrame) {
          await expect(page.locator('#frame-text')).toHaveValue('My Frame For Config')
          await expect(page.locator('#frame-text-color')).toHaveValue('#aabbcc')
        }
      })
    }

    test('rejects a config file whose logo image URL has an unsafe scheme', async ({ page }, info) => {
      const errors: string[] = []
      const unsafeRequests: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('ERR_UNKNOWN_URL_SCHEME')) unsafeRequests.push(message.text())
      })
      await page.locator('#data').fill('data-before-malicious-load')
      await page.waitForTimeout(600)
      const file = info.outputPath('malicious.json')
      fs.writeFileSync(file, JSON.stringify({
        props: {
          data: 'https://evil.example', image: 'javascript:alert(1)', width: 200, height: 200, margin: 0,
          imageOptions: { margin: 0, imageSize: 0.4 },
          dotsOptions: { color: '#abcdef', type: 'square' },
          cornersSquareOptions: { color: '#abcdef', type: 'square' },
          cornersDotOptions: { color: '#abcdef', type: 'square' }
        },
        style: { borderRadius: '8px', background: '#ffffff' }, frame: null
      }))
      await loadConfig(page, file)
      await page.waitForTimeout(1000)
      await expect(page.locator('#data')).toHaveValue('data-before-malicious-load')
      await openDesign(page)
      await expect(page.locator('#image-url')).toBeVisible()
      await expect(page.locator('#image-url')).not.toHaveValue('javascript:alert(1)')
      expect(unsafeRequests).toEqual([])
      expect(errors).toEqual([])
    })
  })

  test.describe('Export QR Code (Single)', () => {
    for (const format of ['png', 'jpg'] as const) {
      for (const withFrame of [false, true]) {
        test(`should export as ${format.toUpperCase()} ${withFrame ? 'with' : 'without'} a frame`, async ({ page }, info) => {
          await checkExport(page, info, format, withFrame)
        })
      }
    }
  })

  test('saved JPG preserves the configured background color', async ({ page }, info) => {
    await page.locator('#data').fill('jpg-background-color')
    await openDesign(page)
    await page.locator('#background-color').fill('#ff0000')
    await page.locator('#margin').fill('20')
    await setFrame(page, false)
    await page.waitForTimeout(800)
    const file = info.outputPath('background.jpg')
    const download = await downloadFile(page, '#download-qr-image-button-jpg', file)
    expect(download.suggestedFilename()).toMatch(/\.jpg$/i)
    const pixel = await sharp(file).extract({ left: 5, top: 5, width: 1, height: 1 }).raw().toBuffer()
    expect(pixel[0]).toBeGreaterThan(200)
    expect(pixel[1]).toBeLessThan(80)
    expect(pixel[2]).toBeLessThan(80)
  })

  test.describe('Internal QR lib parity', () => {
    for (const [label, data] of [
      ['UTF-8', 'Xin chào — 你好 — مرحبا — 👋'],
      ['ASCII', 'mini-qr lib parity ASCII']
    ]) {
      test(`${label} data round-trips through PNG export and scan`, async ({ page }, info) => {
        const file = await exportPng(page, data, info, 'roundtrip.png')
        await switchToScanMode(page)
        const input = page.locator('input[type="file"]')
        await expect(input).toHaveCount(1)
        await input.setInputFiles(file)
        await expect(page.getByText(data, { exact: true })).toBeVisible({ timeout: 10000 })
      })
    }

    test('SVG export emits substantial vector path data', async ({ page }, info) => {
      await page.locator('#data').fill('vector svg parity')
      await setFrame(page, false)
      await page.waitForTimeout(800)
      const file = info.outputPath('vector.svg')
      await downloadFile(page, '#download-qr-image-button-svg', file)
      const svg = fs.readFileSync(file, 'utf8')
      const total = Array.from(svg.matchAll(/<path[^>]+\bd="([^"]*)"/g)).reduce((sum, match) => sum + match[1].length, 0)
      expect(total).toBeGreaterThan(500)
    })

    test('logo with cross-origin source does not taint the canvas on PNG export', async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.locator('#data').fill('crossorigin parity')
      await openDesign(page)
      await page.locator('#image-url').fill('https://api.iconify.design/logos:vue.svg')
      await setFrame(page, false)
      await page.waitForTimeout(1200)
      const download = await downloadFile(page, '#download-qr-image-button-png', info.outputPath('crossorigin.png'))
      expect(download.suggestedFilename()).toMatch(/qr-code\.png$/i)
      expect(errors.filter((message) => /tainted|SecurityError/i.test(message))).toEqual([])
    })
  })

  test.describe('Batch Export QR Codes', () => {
    async function uploadCsv(page: Page, file: string) {
      await page.getByRole('button', { name: /batch export/i }).click()
      const pending = page.waitForEvent('filechooser')
      await page.locator('button[aria-label*="Choose a CSV file"]').click()
      await (await pending).setFiles(file)
    }

    test('displays frameFontFamily from CSV in the batch preview panel', async ({ page }, info) => {
      const file = info.outputPath('fonts.csv')
      fs.writeFileSync(file, 'url,frameText,fileName,frameFontFamily\nhttps://example.com,Visit us,site,Poppins\nhttps://github.com,GitHub,github,Roboto\nhttps://linkedin.com,LinkedIn,linkedin,')
      await uploadCsv(page, file)
      const counter = page.locator('text=/\\d+ \\/ \\d+/')
      await expect(counter).toHaveText('1 / 3', { timeout: 10000 })
      await expect(page.getByText('Poppins')).toBeVisible()
      const next = page.locator('.mt-2.flex.items-center.justify-between').locator('button').last()
      await next.click()
      await expect(counter).toHaveText('2 / 3')
      await expect(page.getByText('Roboto')).toBeVisible()
      await next.click()
      await expect(counter).toHaveText('3 / 3')
      await expect(page.getByText('Poppins')).not.toBeVisible()
      await expect(page.getByText('Roboto')).not.toBeVisible()
    })

    test('batch exports a zip file of PNGs from CSV input', async ({ page }, info) => {
      const response = await page.request.get('/batch_export_templates/6_strings_batch.csv')
      expect(response.ok()).toBeTruthy()
      const file = info.outputPath('batch.csv')
      fs.writeFileSync(file, await response.text())
      await uploadCsv(page, file)
      await expect(page.locator('text=/\\d+ \\/ \\d+/')).toBeVisible({ timeout: 10000 })
      const download = await downloadFile(page, '#download-qr-image-button-png', info.outputPath('batch.zip'))
      expect(download.suggestedFilename()).toMatch(/qr-codes\.zip$/i)
    })
  })
})
