import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const tool = (page, name) => page.locator(`.tool[data-tool="${name}"]`);
const action = (page, name) => page.locator(`button[data-action="${name}"]`);
const sceneObjects = page => page.locator('#scene > g');

function screenPoint(page, point) {
  return page.locator('#world').evaluate((world, [x, y]) => {
    const screen = new DOMPoint(x, y).matrixTransform(world.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, point);
}

async function clickPoints(page, points) {
  for (const point of points) {
    const { x, y } = await screenPoint(page, point);
    await page.mouse.click(x, y);
  }
}

async function drawWall(page, points) {
  await clickPoints(page, [...points, points.at(-1)]);
}

async function setNumber(page, field, value) {
  const input = page.locator(`[data-field="${field}"]`);
  await input.fill(String(value));
  await input.press('Tab');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(sceneObjects(page)).toHaveCount(0);
});

test('ハサミで継ぎ目をまたいで切り出し、移動・削除と Undo ができる', async ({ page }) => {
  const walls = sceneObjects(page).locator('g[stroke] > path');
  const wallPaths = () => walls.evaluateAll(paths => paths.map(path => path.getAttribute('d')));
  await tool(page, 'wall').click();
  await drawWall(page, [[120, 310], [270, 310], [425, 310], [590, 310]]);
  await expect(walls).toHaveCount(3);
  const original = await wallPaths();

  await action(page, 'wall-cut').click();
  await clickPoints(page, [[500, 310]]);
  const end = await screenPoint(page, [200, 310]);
  await page.mouse.move(end.x, end.y);
  await expect(page.locator('.wall-cut-preview')).toBeAttached();
  await page.mouse.click(end.x, end.y);
  await expect(walls).toHaveCount(5);
  await expect(page.locator('#stage')).toHaveAttribute('data-tool', 'select');
  await expect(page.locator('#inspector')).toContainText('3個の図形を選択中');
  const cut = await wallPaths();

  const start = await screenPoint(page, [350, 310]);
  const destination = await screenPoint(page, [350, 400]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(wallPaths).not.toEqual(cut);
  const moved = await wallPaths();
  expect([moved[0], moved[4]]).toEqual([cut[0], cut[4]]);
  for (const index of [1, 2, 3]) expect(moved[index]).not.toBe(cut[index]);
  const movedHeights = await walls.evaluateAll(paths => paths.slice(1, 4).map(path => path.getPointAtLength(0).y));
  for (const height of movedHeights) expect(Math.abs(height - 400)).toBeLessThan(1);

  await page.keyboard.press('Delete');
  await expect.poll(wallPaths).toEqual([cut[0], cut[4]]);
  await page.keyboard.press('Control+z');
  await expect.poll(wallPaths).toEqual(moved);
  await page.keyboard.press('Control+z');
  await expect.poll(wallPaths).toEqual(cut);
  await page.keyboard.press('Control+z');
  await expect.poll(wallPaths).toEqual(original);
});

test('取り付け済みの窓枠が壁の厚みの変更に追従する', async ({ page }) => {
  await tool(page, 'wall').click();
  await setNumber(page, 'default-width', 32);
  await drawWall(page, [[216, 148], [216, 627]]);
  await expect(sceneObjects(page)).toHaveCount(1);

  await tool(page, 'opening').click();
  await page.locator('[data-design-kind="window"]').click();
  await page.locator('[data-part-design="centerRail"]').click();
  await clickPoints(page, [[216, 350]]);
  const window = sceneObjects(page).nth(1);
  const frame = window.locator('rect[fill="#ffffff"]');
  const frameDepth = async () => Number(await frame.getAttribute('height'));
  await expect.poll(frameDepth).toBeCloseTo(32, 6);
  await expect(window.locator('g[transform]')).toHaveAttribute('transform', /rotate\(90\)/);

  await clickPoints(page, [[216, 212]]);
  await setNumber(page, 'object-width', 5);
  await expect.poll(frameDepth).toBeCloseTo(5, 6);
  await setNumber(page, 'object-width', 26);
  await expect.poll(frameDepth).toBeCloseTo(26, 6);
});

test('SVG のグループ分けを切り替えても描画と重なり順が同じ', async ({ page }) => {
  await tool(page, 'wall').click();
  await drawWall(page, [[150, 300], [480, 300]]);
  await tool(page, 'floor').click();
  await clickPoints(page, [[150, 300], [480, 300], [480, 500], [150, 500], [150, 300]]);
  await tool(page, 'fixture').click();
  await page.locator('[data-part="bath"]').click();
  await clickPoints(page, [[300, 380]]);
  await expect(sceneObjects(page)).toHaveCount(3);

  const option = page.getByLabel('グループ分けする');
  const format = page.locator('#export-form [name="format"]');
  const downloadSvg = async () => {
    const pendingDownload = page.waitForEvent('download');
    await page.locator('#export-form button[type="submit"]').click();
    const download = await pendingDownload;
    return readFile(await download.path(), 'utf8');
  };

  await action(page, 'export').click();
  await expect(option).toBeHidden();
  await format.selectOption('svg');
  await expect(option).toBeVisible();
  await expect(option).not.toBeChecked();
  const flatSvg = await downloadSvg();

  await action(page, 'export').click();
  await option.check();
  const groupedSvg = await downloadSvg();

  const result = await page.evaluate(({ flatSvg, groupedSvg }) => {
    const parser = new DOMParser();
    const flat = parser.parseFromString(flatSvg, 'image/svg+xml');
    const grouped = parser.parseFromString(groupedSvg, 'image/svg+xml');
    if (flat.querySelector('parsererror') || grouped.querySelector('parsererror')) {
      throw new Error('SVG の構文が無効です');
    }
    const flatGroups = flat.querySelectorAll('svg > g[data-layer]');
    const layerGroups = Array.from(grouped.querySelectorAll('svg > g[data-layer]'));
    const groupNames = layerGroups.map(group => [group.getAttribute('data-layer'), group.id]);
    for (const group of layerGroups) group.replaceWith(...group.children);
    return {
      flatGroupCount: flatGroups.length,
      groupNames,
      sameDrawing: grouped.documentElement.outerHTML === flat.documentElement.outerHTML,
    };
  }, { flatSvg, groupedSvg });

  expect(result.flatGroupCount).toBe(0);
  expect(result.groupNames).toEqual([['floor', '床'], ['wall', '壁'], ['fixture', '設備']]);
  expect(result.sameDrawing).toBe(true);
});
