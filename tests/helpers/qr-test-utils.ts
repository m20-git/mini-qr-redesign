import { expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'fs'
import sharp from 'sharp'

export async function openSection(page: Page, name: RegExp) {
  const button = page.getByRole('button', { name })
  await expect(button).toBeVisible()
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
}

export async function setFrame(page: Page, enabled: boolean) {
  await openSection(page, /frame settings/i)
  await page.locator('#show-frame').setChecked(enabled)
  await expect(page.locator('#show-frame')).toBeChecked({ checked: enabled })
}

export async function waitForPreview(page: Page) {
  const preview = page.locator('#element-to-export')
  await expect(preview).toBeVisible()
  await expect(preview.locator('svg').first()).toBeVisible()
  await page.evaluate(async () => { await document.fonts.ready })
  await preview.locator('img').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()))
  })
  let last = ''
  let stable = 0
  await expect.poll(async () => {
    const state = await preview.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return JSON.stringify({ x: box.x, y: box.y, width: box.width, height: box.height, svg: element.querySelector('svg')?.outerHTML })
    })
    stable = state === last ? stable + 1 : 0
    last = state
    return stable >= 3
  }, { timeout: 10000, intervals: [100] }).toBe(true)
}

export async function fillData(page: Page, data: string) {
  const svg = page.locator('#element-to-export svg').first()
  await expect(svg).toBeVisible()
  const previous = await svg.evaluate((element) => element.outerHTML)
  await page.locator('#data').fill(data)
  await expect.poll(() => svg.evaluate((element) => element.outerHTML), { timeout: 10000 }).not.toBe(previous)
  await waitForPreview(page)
}

export async function downloadFile(page: Page, selector: string, file: string) {
  await expect(page.locator(selector)).toBeEnabled()
  const pending = page.waitForEvent('download')
  await page.locator(selector).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  await download.saveAs(file)
  expect(fs.statSync(file).size).toBeGreaterThan(0)
  return download
}

export async function scanFile(page: Page, file: string, data: string) {
  const scan = page.getByRole('navigation').getByRole('button', { name: 'Scan', exact: true })
  await scan.click()
  await expect(scan).toHaveAttribute('aria-pressed', 'true')
  const input = page.locator('input[type="file"]')
  await expect(input).toHaveCount(1)
  await input.setInputFiles(file)
  await expect(page.getByText(data, { exact: true })).toBeVisible({ timeout: 15000 })
}

export async function checkExport(page: Page, info: TestInfo, format: 'png' | 'jpg', framed: boolean) {
  info.setTimeout(60000)
  const data = `functional-export-${format}-${framed ? 'frame' : 'plain'}`
  const caption = `${format.toUpperCase()} Frame Test`
  const fixture = {
    props: {
      data: 'setup-for-functional-export', image: '', width: 400, height: 400, margin: 4,
      imageOptions: { margin: 0, imageSize: 0.4 },
      dotsOptions: { color: '#111111', type: 'square' },
      cornersSquareOptions: { color: '#111111', type: 'square' },
      cornersDotOptions: { color: '#111111', type: 'square' },
      qrOptions: { errorCorrectionLevel: 'Q' }
    },
    style: { borderRadius: '0px', background: '#ffffff' },
    frame: framed ? {
      text: caption, position: 'bottom',
      style: { textColor: '#111111', backgroundColor: '#ddeeff', borderColor: '#000000', borderWidth: '1px', borderRadius: '0px', padding: '16px' }
    } : null
  }
  const configFile = info.outputPath('export-config.json')
  fs.writeFileSync(configFile, JSON.stringify(fixture))
  const chooser = page.waitForEvent('filechooser')
  await page.locator('#load-qr-code-config-button').click()
  await (await chooser).setFiles(configFile)
  await expect(page.locator('#data')).toHaveValue('setup-for-functional-export')
  await waitForPreview(page)
  await fillData(page, data)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('qrCodeConfig') || '')).toContain(data)
  if (framed) await expect(page.locator('#element-to-export p')).toHaveText(caption)

  const svgFile = info.outputPath('reference.svg')
  await downloadFile(page, '#download-qr-image-button-svg', svgFile)
  const svg = fs.readFileSync(svgFile, 'utf8')
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  expect(box, 'Exported SVG must declare a viewBox').not.toBeNull()
  const naturalWidth = Number(box![1])
  const naturalHeight = Number(box![2])
  expect(naturalWidth).toBeGreaterThan(0)
  expect(naturalHeight).toBeGreaterThan(0)

  const file = info.outputPath(`export.${format}`)
  const download = await downloadFile(page, `#download-qr-image-button-${format}`, file)
  expect(download.suggestedFilename()).toMatch(new RegExp(`qr-code\\.${format}$`, 'i'))
  const metadata = await sharp(file).metadata()
  expect(metadata.format).toBe(format === 'jpg' ? 'jpeg' : 'png')
  expect(metadata.width).toBeGreaterThan(0)
  expect(metadata.height).toBeGreaterThan(0)
  if (!framed) {
    expect(metadata.width).toBe(400)
    expect(metadata.height).toBe(400)
  } else {
    // The SVG is an independent exported artifact. Raster output must keep its
    // proportions and cover the requested DOM-derived target box uniformly.
    const target = await page.locator('#element-to-export').evaluate((element) => ({
      width: (element as HTMLElement).offsetWidth * 2,
      height: (element as HTMLElement).offsetHeight * 2
    }))
    const scale = Math.max(target.width / naturalWidth, target.height / naturalHeight)
    expect(Math.abs(metadata.width! - naturalWidth * scale)).toBeLessThanOrEqual(1)
    expect(Math.abs(metadata.height! - naturalHeight * scale)).toBeLessThanOrEqual(1)
    expect(metadata.width).toBeGreaterThan(400)
    expect(metadata.height).toBeGreaterThan(400)
    expect(svg).toContain(caption)
    const pixel = await sharp(file).extract({ left: Math.floor(metadata.width! * 0.04), top: Math.floor(metadata.height! * 0.04), width: 1, height: 1 }).removeAlpha().raw().toBuffer()
    for (const [channel, expected] of [221, 238, 255].entries()) {
      expect(Math.abs(pixel[channel] - expected)).toBeLessThanOrEqual(format === 'jpg' ? 25 : 1)
    }
  }
  await info.attach(`export-${format}`, { path: file, contentType: format === 'jpg' ? 'image/jpeg' : 'image/png' })
  await scanFile(page, file, data)
}
