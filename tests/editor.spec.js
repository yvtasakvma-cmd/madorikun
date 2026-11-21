import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

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

async function chooseWindow(page) {
  await tool(page, 'opening').click();
  await page.locator('[data-design-kind="window"]').click();
  await page.locator('[data-part-design="centerRail"]').click();
}

async function placeWindow(page, point) {
  await chooseWindow(page);
  await clickPoints(page, [point]);
}

async function dragOnCanvas(page, from, to) {
  const start = await screenPoint(page, from);
  const end = await screenPoint(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

async function saveProject(page, path) {
  const pending = page.waitForEvent('download');
  await action(page, 'save').click();
  const download = await pending;
  await download.saveAs(path);
  return JSON.parse(strFromU8(unzipSync(await readFile(path))['project.json']));
}

async function openProject(page, path) {
  await page.locator('#open-input').setInputFiles(path);
  await expect(page.locator('#status')).toContainText('制作ファイルを開きました');
}

const openings = project => project.objects.filter(item => item.kind === 'window').sort((a, b) => a.at[0] - b.at[0]);
const wallHost = (project, opening) => project.objects.find(item => item.id === opening.wallId);

function wallInk(page, y) {
  return page.locator('#scene').evaluate(async (scene, y) => {
    const svg = document.createElementNS(scene.namespaceURI, 'svg');
    svg.setAttribute('width', '720');
    svg.setAttribute('height', '500');
    svg.appendChild(scene.cloneNode(true));
    const image = new Image();
    image.src = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 500;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, y, 720, 1).data;
    return Array.from({ length: 720 }, (_, x) => pixels[x * 4] < 128 && pixels[x * 4 + 3] > 128);
  }, y);
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

  await dragOnCanvas(page, [350, 310], [350, 400]);
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

test('破線の壁を切っても線と空白の位置が保たれ、移動・再読込後も維持される', async ({ page }, testInfo) => {
  await tool(page, 'wall').click();
  await page.locator('[data-field="default-dashed"]').check();
  await drawWall(page, [[120, 310], [655, 310]]);
  await placeWindow(page, [335, 310]);
  await expect(sceneObjects(page)).toHaveCount(2);


  const before = await wallInk(page, 310);
  await tool(page, 'wall').click();
  await action(page, 'wall-cut').click();
  await clickPoints(page, [[215, 310], [545, 310]]);
  await expect(sceneObjects(page)).toHaveCount(4);
  expect(await wallInk(page, 310)).toEqual(before);

  await dragOnCanvas(page, [232, 310], [232, 410]);
  const movedPath = testInfo.outputPath('dashed-wall.madori');
  const moved = await saveProject(page, movedPath);
  expect(openings(moved)[0].at[1]).toBeCloseTo(410, 0);
  expect((await wallInk(page, 410)).slice(216, 544)).toEqual(before.slice(216, 544));
  const stationary = await wallInk(page, 310);
  expect(stationary.slice(0, 214)).toEqual(before.slice(0, 214));
  expect(stationary.slice(546)).toEqual(before.slice(546));

  await openProject(page, movedPath);
  expect((await wallInk(page, 410)).slice(216, 544)).toEqual(before.slice(216, 544));
  await tool(page, 'wall').click();
  await action(page, 'wall-cut').click();
  await clickPoints(page, [[400, 410], [480, 410]]);
  await expect(sceneObjects(page)).toHaveCount(6);
  expect((await wallInk(page, 410)).slice(216, 544)).toEqual(before.slice(216, 544));
});

test('既存の継ぎ目から切っても、壁を動かすまでは破線の見た目が保たれる', async ({ page }) => {
  await tool(page, 'wall').click();
  await page.locator('[data-field="default-dashed"]').check();
  await drawWall(page, [[120, 310], [270, 310], [550, 310]]);
  await expect(sceneObjects(page)).toHaveCount(2);
  const before = await wallInk(page, 310);

  await action(page, 'wall-cut').click();
  await clickPoints(page, [[270, 310], [435, 310]]);
  await expect(sceneObjects(page)).toHaveCount(3);
  expect(await wallInk(page, 310)).toEqual(before);

  await dragOnCanvas(page, [303, 310], [303, 410]);
  const stationary = await wallInk(page, 310);
  const moved = await wallInk(page, 410);
  expect(stationary.slice(270, 435).some(Boolean)).toBe(false);
  expect(moved.slice(0, 270).some(Boolean)).toBe(false);
  expect(moved.slice(271, 434)).toEqual(before.slice(271, 434));
});

test('形が変わらなかった壁のドラッグは未保存扱いにも Undo 履歴にもならない', async ({ page }, testInfo) => {
  await tool(page, 'wall').click();
  await drawWall(page, [[190, 320], [480, 320]]);
  const wall = sceneObjects(page).locator('g[stroke] > path');
  await expect(wall).toHaveCount(1);
  const original = await wall.getAttribute('d');

  await tool(page, 'select').click();
  await clickPoints(page, [[320, 320]]);
  const handle = end => page.locator(`[data-handle="wall-${end}"]`);
  const position = end => handle(end).evaluate(dot => [dot.cx.baseVal.value, dot.cy.baseVal.value]);
  await dragOnCanvas(page, await position('b'), [530, 320]);
  await expect(wall).not.toHaveAttribute('d', original);
  await saveProject(page, testInfo.outputPath('wall.madori'));
  const dirty = page.locator('#dirty-dot');
  await expect(dirty).toBeHidden();
  const saved = await wall.getAttribute('d');

  const [x, y] = await position('b');
  await dragOnCanvas(page, [x, y], [x, y + 20]);
  await expect(wall).toHaveAttribute('d', saved);
  await expect(dirty).toBeHidden();

  await page.keyboard.down('Shift');
  await dragOnCanvas(page, await position('b'), await position('a'));
  await page.keyboard.up('Shift');
  await expect(wall).toHaveAttribute('d', saved);
  await expect(dirty).toBeHidden();

  const start = await screenPoint(page, [320, 320]);
  const away = await screenPoint(page, [320, 380]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(away.x, away.y);
  await expect(wall).not.toHaveAttribute('d', saved);
  await page.mouse.move(start.x, start.y);
  await page.mouse.up();
  await expect(wall).toHaveAttribute('d', saved);
  await expect(dirty).toBeHidden();

  await page.keyboard.press('Control+z');
  await expect(wall).toHaveAttribute('d', original);
  await page.keyboard.press('Control+y');
  await expect(wall).toHaveAttribute('d', saved);
  await expect(dirty).toBeHidden();
});

test('両開き戸を直線の継ぎ目を越えて広げても直角の取り合いが残る', async ({ page }, testInfo) => {
  await tool(page, 'wall').click();
  await setNumber(page, 'default-width', 20);
  await drawWall(page, [[250, 160], [250, 300], [250, 530]]);
  await drawWall(page, [[150, 530], [380, 530]]);
  await expect(sceneObjects(page)).toHaveCount(3);

  await tool(page, 'opening').click();
  await page.locator('[data-part="double"]').click();
  await clickPoints(page, [[250, 230]]);
  const grip = page.locator('[data-handle="part-right"]');
  const start = await grip.evaluate(dot => [dot.cx.baseVal.value, dot.cy.baseVal.value]);
  await dragOnCanvas(page, start, [250, 440]);
  await expect.poll(async () => Number(await page.locator('[data-field="object-w"]').inputValue())).toBeCloseTo(245, 0);

  await setNumber(page, 'object-w', 500);
  const path = testInfo.outputPath('wide-double-door.madori');
  const project = await saveProject(page, path);
  const door = project.objects.find(item => item.kind === 'double');
  expect(door.at[1] + door.w / 2).toBeCloseTo(519.5, 0);
  expect(project.objects.find(item => item.id === door.wallId).b[1]).toBeCloseTo(530, 0);
  expect(project.objects.some(item => item.layer === 'wall' && item.a[1] === item.b[1])).toBe(true);
  await openProject(page, path);
  await expect(sceneObjects(page)).toHaveCount(3);
});

test('取り付け済みの窓枠が壁の厚みの変更に追従する', async ({ page }) => {
  await tool(page, 'wall').click();
  await setNumber(page, 'default-width', 32);
  await drawWall(page, [[216, 148], [216, 627]]);
  await expect(sceneObjects(page)).toHaveCount(1);

  await placeWindow(page, [216, 350]);
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

test('窓付きの壁を切り出して移動・Undo・再読込しても窓が追従する', async ({ page }, testInfo) => {
  await tool(page, 'wall').click();
  await setNumber(page, 'default-width', 24);
  await drawWall(page, [[120, 310], [420, 310], [655, 310]]);
  await placeWindow(page, [315, 310]);
  await page.locator('[data-part="window"]').click();
  await clickPoints(page, [[597, 310]]);
  await expect(sceneObjects(page)).toHaveCount(4);

  await tool(page, 'wall').click();
  await action(page, 'wall-cut').click();
  await clickPoints(page, [[235, 310], [530, 310]]);
  await expect(sceneObjects(page)).toHaveCount(6);
  const cut = await saveProject(page, testInfo.outputPath('cut.madori'));
  const [inside, outside] = openings(cut);
  expect(wallHost(cut, inside).a[0]).toBeCloseTo(235, 0);
  expect(wallHost(cut, outside).a[0]).toBeCloseTo(530, 0);

  const movedPath = testInfo.outputPath('moved.madori');
  await dragOnCanvas(page, [382, 310], [382, 425]);
  const moved = await saveProject(page, movedPath);
  expect(openings(moved).map(item => item.wallId)).toEqual([inside.wallId, outside.wallId]);
  expect(openings(moved)[0].at[1]).toBeCloseTo(425, 0);
  expect(openings(moved)[1].at[1]).toBeCloseTo(310, 0);

  await page.locator('#stage').focus();
  await page.keyboard.press('Control+z');
  const undone = await saveProject(page, testInfo.outputPath('undone.madori'));
  expect(undone.objects).toEqual(cut.objects);
  await openProject(page, movedPath);
  await dragOnCanvas(page, [382, 425], [382, 480]);
  const reopened = await saveProject(page, testInfo.outputPath('reopened.madori'));
  expect(openings(reopened).map(item => item.wallId)).toEqual([inside.wallId, outside.wallId]);
  expect(openings(reopened)[0].at[1]).toBeCloseTo(480, 0);
  expect(openings(reopened)[1].at[1]).toBeCloseTo(310, 0);
});

test('短い壁線をつないだ直線の継ぎ目に置いた窓が壁と一緒に動く', async ({ page }, testInfo) => {
  await tool(page, 'wall').click();
  await setNumber(page, 'default-width', 24);
  await drawWall(page, [[180, 310], [237, 310], [295, 310]]);
  await expect(sceneObjects(page)).toHaveCount(2);
  await chooseWindow(page);
  const previewPoint = await screenPoint(page, [237, 310]);
  await page.mouse.move(previewPoint.x, previewPoint.y);
  const frameDepth = locator => expect.poll(async () => Number(await locator.locator('rect[fill="#ffffff"]').getAttribute('height')));
  await frameDepth(page.locator('#overlay .part-preview')).toBeCloseTo(24, 6);
  await expect(sceneObjects(page)).toHaveCount(2);
  await page.mouse.click(previewPoint.x, previewPoint.y);

  const placed = await saveProject(page, testInfo.outputPath('placed.madori'));
  const [window] = openings(placed);
  expect(wallHost(placed, window)?.width).toBe(24);
  expect(window.at[0]).toBeCloseTo(237, 0);
  await frameDepth(page.locator(`#scene [data-id="${window.id}"]`)).toBeCloseTo(24, 6);
  await page.locator('#stage').focus();
  await page.keyboard.press('Control+z');
  await expect(sceneObjects(page)).toHaveCount(2);
  await expect(page.locator(`#scene [data-id="${window.id}"]`)).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await frameDepth(page.locator(`#scene [data-id="${window.id}"]`)).toBeCloseTo(24, 6);

  const movedPath = testInfo.outputPath('moved-join.madori');
  await clickPoints(page, [[125, 390]]);
  await dragOnCanvas(page, [187, 310], [187, 415]);
  const moved = await saveProject(page, movedPath);
  expect(openings(moved)[0].wallId).toBe(window.wallId);
  expect(openings(moved)[0].at[1]).toBeCloseTo(415, 0);

  await openProject(page, movedPath);
  await dragOnCanvas(page, [187, 415], [187, 475]);
  const reopened = await saveProject(page, testInfo.outputPath('reopened-join.madori'));
  expect(openings(reopened)[0].wallId).toBe(window.wallId);
  expect(openings(reopened)[0].at[1]).toBeCloseTo(475, 0);
});

test('床の下描きが Ctrl を押している間も表示され、Undo で角だけが戻る', async ({ page }) => {
  await tool(page, 'floor').click();
  const corners = [[160, 300], [390, 300], [390, 480], [160, 480]];
  await clickPoints(page, corners.slice(0, 3));
  const draft = page.locator('#overlay polyline');
  const vertices = page.locator('#overlay circle[fill="#20765f"]');
  await expect(vertices).toHaveCount(3);
  const beforeUndo = await draft.getAttribute('points');

  await page.keyboard.down('Control');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await expect(draft).toHaveAttribute('points', beforeUndo);
  await page.keyboard.press('z');
  await expect(vertices).toHaveCount(2);
  await expect(draft).toBeAttached();
  await page.keyboard.up('Control');
  await expect(vertices).toHaveCount(2);

  await clickPoints(page, [...corners.slice(2), corners[0]]);
  await expect(sceneObjects(page)).toHaveCount(1);
  await expect(draft).toHaveCount(0);
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
