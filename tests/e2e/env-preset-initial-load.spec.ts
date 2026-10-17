import { test, expect, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const PORT_BASE = 51873
let baseUrl = ''
let server: ChildProcess | undefined

const ENV_PRESET = [{
  name: 'E2E Env Preset', data: 'https://e2e.example.com', image: '',
  width: 200, height: 200, margin: 0,
  imageOptions: { margin: 0, imageSize: 0.4 },
  dotsOptions: { color: '#123456', type: 'dots' },
  cornersSquareOptions: { color: '#abcdef', type: 'square' },
  cornersDotOptions: { color: '#fedcba', type: 'square' },
  style: { borderRadius: '12px', background: '#ffffff' },
  qrOptions: { errorCorrectionLevel: 'H' },
  frame: {
    text: 'Win a prize', position: 'bottom',
    style: {
      textColor: '#ff0000', backgroundColor: '#00ff00', borderColor: '#0000ff',
      borderWidth: '2px', borderRadius: '10px', padding: '20px'
    }
  }
}]

async function waitForServer(url: string, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // Retry while Vite starts.
    }
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`Preset Vite server exited with code ${server.exitCode}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Vite at ${url} did not become ready within ${timeoutMs}ms`)
}

async function openSection(page: Page, name: RegExp) {
  const header = page.getByRole('button', { name })
  await expect(header).toBeVisible()
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}

test.describe('Env preset applied on initial page load', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, info) => {
    test.setTimeout(90000)
    const port = PORT_BASE + info.workerIndex
    baseUrl = `http://localhost:${port}`
    server = spawn(process.execPath, [
      path.join(repoRoot, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        VITE_QR_CODE_PRESETS: JSON.stringify(ENV_PRESET),
        VITE_DISABLE_LOCAL_STORAGE: 'true',
        VITE_FIELDS_VISIBLE: ''
      },
      stdio: ['ignore', 'ignore', 'inherit']
    })
    await waitForServer(baseUrl)
  })

  test.afterAll(() => { server?.kill('SIGTERM') })

  test('applies env preset QR colors on first load without manual import', async ({ page }) => {
    await page.goto(`${baseUrl}/`)
    await openSection(page, /^design$/i)
    await expect(page.locator('#dots-color')).toBeVisible()
    await expect(page.locator('#dots-color')).toHaveValue('#123456')
  })

  test('applies embedded frame from env preset on first load', async ({ page }) => {
    await page.goto(`${baseUrl}/`)
    await expect(page.locator('#element-to-export').getByText('Win a prize', { exact: true })).toBeVisible({ timeout: 15000 })
    await openSection(page, /frame settings/i)
    await expect(page.locator('#show-frame')).toBeChecked()
    await expect(page.locator('#frame-text')).toHaveValue('Win a prize')
    await expect(page.locator('#frame-text-color')).toHaveValue('#ff0000')
  })
})
