import { expect, test } from '@playwright/test'

/** Records a short screen capture for the README GIF. Not a correctness test —
 *  run with `pnpm demo:gif` (see package.json), which converts the .webm. */
test.use({
  viewport: { width: 1280, height: 800 },
  video: { mode: 'on', size: { width: 1280, height: 800 } },
})

const fill6 = async (
  page: import('@playwright/test').Page,
  v: [number, number, number, number, number, number],
) => {
  const inputs = page.locator('aside input')
  for (let i = 0; i < 6; i++) await inputs.nth(i).fill(String(v[i]))
}

test('demo reel', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(700) // idle mirror

  // Orbit the model.
  const box = (await page.locator('canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 0; i <= 14; i++) {
    await page.mouse.move(cx - i * 8, cy - i * 2)
    await page.waitForTimeout(14)
  }
  await page.mouse.up()
  await page.waitForTimeout(350)

  // Drive it to two poses.
  const apply = page.getByRole('button', { name: 'APPLY TARGET' })
  await fill6(page, [420, -120, 300, 178, 2, -60])
  await apply.click()
  await page.waitForTimeout(1300)

  await fill6(page, [250, 180, 620, 175, -8, 40])
  await apply.click()
  await page.waitForTimeout(1300)

  // Reject an unreachable target.
  await fill6(page, [5000, 0, 500, 180, 0, -90])
  await apply.click()
  await expect(page.locator('text=/IK:/')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(1100)
})
