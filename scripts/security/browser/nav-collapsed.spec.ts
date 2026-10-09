// The main navigation collapsed to icons: the children of an item (folders of Assets, classes of Data Objects, the AI and Settings
// submenus) open as a menu to the right of the icon; items without children keep their tooltip.
import { test, expect, ADMIN_URL, ASSET_TARGET } from './fixtures'

test('collapsed, an item with children shows them in a popover menu at its right', async ({ api, authed, tag }) => {
  const assets = api.forBase(ASSET_TARGET)
  const folder = `/navpop-${tag}`
  const up = await assets.upload('/api/v1/dam/upload', { pimcorePath: `${folder}/sub/x.txt`, isPublic: 'true' }, { file: { name: 'x.txt', type: 'text/plain', data: 'x' } })
  expect(up.status, up.text.slice(0, 100)).toBe(200)
  try {
    const p = await authed.newPage()
    await p.setViewportSize({ width: 1300, height: 800 })
    await p.goto(`${ADMIN_URL}/`)
    await p.getByRole('button', { name: 'Collapse Sidebar' }).click()
    const popover = p.getByTestId('nav-popover')
    await expect(popover).toHaveCount(0)

    // an item with children: the menu appears to the right of the icon, with the children
    const settings = p.getByTestId('nav-item-settings')
    await settings.hover()
    await expect(popover).toBeVisible()
    await expect(popover).toContainText('Settings')
    await expect(popover.getByTestId('nav-popover-item-settings-dam')).toBeVisible()
    const iconBox = (await settings.boundingBox())!
    const menuBox = (await popover.boundingBox())!
    expect(menuBox.x, 'to the right of the icon').toBeGreaterThanOrEqual(iconBox.x + iconBox.width)
    expect(menuBox.x - (iconBox.x + iconBox.width), 'close to it').toBeLessThanOrEqual(16)
    expect(menuBox.y + menuBox.height, 'inside the window').toBeLessThanOrEqual(800)

    // the pointer can travel from the icon to the menu; clicking an entry opens that part and closes the menu
    await popover.getByTestId('nav-popover-item-settings-dam').hover()
    await expect(popover).toBeVisible()
    await popover.getByTestId('nav-popover-item-settings-dam').click()
    await expect(popover).toHaveCount(0)
    await expect(p.getByText('DAM Configuration', { exact: true }).first()).toBeVisible()

    // AI: its three entries; the submenu opens the right card
    await p.getByTestId('nav-item-ai').hover()
    await expect(popover).toContainText('AI agent')
    await expect(popover).toContainText('Image generation')
    await popover.getByTestId('nav-popover-item-ai-translate').click()
    await expect(p.getByRole('heading', { name: 'AI Translation', level: 2 })).toBeVisible()

    // Assets: the folders, indented by depth; choosing one shows that folder
    await p.getByTestId('nav-item-assets').hover()
    await expect(popover.getByTestId('nav-popover-item-asset-folder-/')).toBeVisible()
    const nested = popover.getByTestId(`nav-popover-item-asset-folder-${folder}/sub`)
    await expect(nested).toBeVisible()
    const outer = (await popover.getByTestId(`nav-popover-item-asset-folder-${folder}`).boundingBox())!
    const inner = (await nested.locator('span').boundingBox())!
    expect(inner.x, 'a subfolder is indented').toBeGreaterThan(outer.x + 10)
    await nested.click()
    await expect(popover).toHaveCount(0)

    // Esc closes it, moving away closes it, an item without children shows no menu
    await p.getByTestId('nav-item-settings').hover()
    await expect(popover).toBeVisible()
    await p.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await p.mouse.move(700, 400)                                  // the menu opens when the pointer ENTERS the icon
    await p.getByTestId('nav-item-settings').hover()
    await expect(popover).toBeVisible()
    await p.mouse.move(700, 400)
    await expect(popover).toHaveCount(0, { timeout: 3000 })
    await p.getByTestId('nav-item-websites').hover()
    await expect(popover).toHaveCount(0)

    // expanded again: no popover, the submenus are in the sidebar as before
    await p.getByRole('button', { name: 'Expand Sidebar' }).click()
    await p.getByTestId('nav-item-settings').hover()
    await expect(popover).toHaveCount(0)
  } finally {
    await assets.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: `${folder}/sub/x.txt` } })
  }
})
