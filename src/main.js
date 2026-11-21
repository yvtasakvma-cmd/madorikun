import './style.css';
import { foldingTriangleLayout, foldingTrianglePositions } from './folding-symbols.js';
import {
  add, alignFinalCorner, angleOf, blank, clamp, cutWall, DEFAULT_TEXT_FONT, detach, floors, hasAdjustableRadius, isAccordionSliding, isDividerPart, isDrawingAngle, isSteppedSliding, isWallSegment, layers, lengthOf, lerp, makePart, mergeWindowHost, OBJECT_LIMIT, openingFrameDepth, openingSwingDepth, PART_DESIGNS, parts, partSize, partVariant, positionOpening, roomColors,
  projectOnWall, readRoomLabel, ROOM_LABEL_TATAMI, ROOM_LABELS, roomLabelText, rotate, snapClosingCorner, snapDividerToFrame, snapDrawingAngle, snapFixtureToWall, sub, syncOpenings, uid, wallCutRun, wallDashArray, wallDirection, windowWallJoin,
} from './model.js';
import {
  escapeHtml, objectBounds, objectIntersectsBox, polygonBounds, renderScene, rotatedBounds, svgDocument, verticalTextCaret, wallDrawingGeometry,
} from './scene.js';
import {
  detectImageFormat, download, exportSetup, makeExport, readProject, renderUnderlay, saveProject, UNDERLAY_LIMIT,
} from './files.js';
import {
  checkField, colorField, floorChoices, fontChoices, icon, importButton, layout, numberField, partPalette,
  propertyMarkup, removeButton, roomChoices, roomLabelPalette, selectField, partDesignChoices, tools,
} from './ui.js';

document.querySelector('#app').innerHTML = layout();
const $ = selector => document.querySelector(selector);
const stage = $('#stage');
const area = $('#canvas-area');
const world = $('#world');
const scene = $('#scene');
const overlay = $('#overlay');
const context = $('#context-bar');
const inspector = $('#inspector');
const TEXT_INPUT = 'textarea[data-field="object-value"]';
const exportForm = $('#export-form');
const exportDialog = $('#export-dialog');
const partDesignMenu = $('#part-designs');

let state = { doc: blank(), asset: null, revision: 0 };
let nextRevision = 0;
let savedRevision = 0;
const undoStack = [];
const redoStack = [];
let tool = 'select';
let contextTool = 'select';
const selection = new Set();
let defaults = { width: 8, dashed: false, preset: 'wood', room: 'western', color: roomColors.western.color, direction: 'vertical', tatami: 6, spacing: 12, size: 18, font: DEFAULT_TEXT_FONT };
let activeParts = { opening: 'swing', fixture: 'bath' };
let columnPlacement = false;
let activeRoomLabel = '';
const partDesigns = Object.fromEntries(Object.entries(PART_DESIGNS).map(([kind, design]) => [kind, design.default]));
partDesigns.kitchen = 'worktop';
partDesigns.stove = 'stove2';
let pending = [];
let dividerStartFrame;
let wallChain = null;
let wallCutStart = null;
let temporarySelection = false;
let hover = null;
let draftPart = null;
let drag = null;
let space = false;
let fileBusy = false;
let drawFrame = 0;
let fitOnResize = true;
let view = { x: 0, y: 0, scale: 1 };
let previewSerial = 0;
let previewSetup = null;
const rasterUrls = new Set();
const SNAP_RADIUS = 16;
const SNAP_RELEASE_RADIUS = 22;
const FIXTURE_SNAP_RADIUS = 6;
const wallGeometryCache = new WeakMap();
const HANDLES = ['nw', 'ne', 'se', 'sw'];
const EDGE_HANDLES = ['n', 'e', 's', 'w'];
const DIRECTIONS = {
  nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1],
  n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0],
};
const HISTORY_LIMIT = 60;

const doc = () => state.doc;
const layer = id => doc().layers.find(item => item.id === id);
const itemBy = id => doc().objects.find(item => item.id === id);
const names = id => layers.find(item => item.id === id)?.name ?? '';
const dirty = () => state.revision !== savedRevision;
const selectedObjects = () => doc().objects.filter(item => selection.has(item.id));
const editable = id => layer(id)?.visible && !layer(id).locked;
const placementKind = () => tool === 'wall' ? (columnPlacement ? 'column' : '')
  : tool === 'text' ? activeRoomLabel : activeParts[tool];
const drawingDivider = () => tool === 'fixture' && isDividerPart(activeParts.fixture, partDesigns[activeParts.fixture]);
const canUndoFloorVertex = () => tool === 'floor' && pending.length > 0;

function status(message, error = false) {
  const output = $('#status');
  output.replaceChildren(document.createElement('i'), document.createTextNode(message));
  output.classList.toggle('status-error', error);
}

function pruneRasterUrls() {
  const retained = new Set([state, ...undoStack, ...redoStack].map(entry => entry.asset?.url));
  for (const url of rasterUrls) {
    if (!retained.has(url)) {
      URL.revokeObjectURL(url);
      rasterUrls.delete(url);
    }
  }
}

function record(previous) {
  undoStack.push(previous);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  state.revision = ++nextRevision;
  pruneRasterUrls();
}

function commit(edit, message, asset = state.asset, refresh = renderAll) {
  const previous = state;
  const copy = structuredClone(doc());
  if (edit(copy) === false) return false;
  state = { doc: copy, asset, revision: previous.revision };
  record(previous);
  refresh();
  if (message) status(message);
  return true;
}

function restore(source, destination, message) {
  if (!source.length || fileBusy || drag) return;
  destination.push(state);
  state = source.pop();
  clearDraft();
  selection.clear();
  renderAll();
  if (fitOnResize) fit();
  status(message);
}

function reset(newDoc, asset) {
  state = { doc: newDoc, asset, revision: ++nextRevision };
  savedRevision = state.revision;
  undoStack.length = 0;
  redoStack.length = 0;
  selection.clear();
  clearDraft();
  tool = 'select';
  contextTool = 'select';
  pruneRasterUrls();
  renderAll();
  fit();
}

function clearDraft() {
  pending = [];
  dividerStartFrame = undefined;
  wallChain = null;
  wallCutStart = null;
  hover = null;
  draftPart = null;
}

function selectTool(next, { keepSelection = false } = {}) {
  if (drag) cancelDrag();
  tool = next;
  if (next !== 'select') contextTool = next === 'scissors' ? 'wall' : next;
  if (next === 'wall' || next === 'scissors') columnPlacement = false;
  if (partDesignMenu.matches(':popover-open')) partDesignMenu.hidePopover();
  clearDraft();
  if (!keepSelection) selection.clear();
  stage.focus({ preventScroll: true });
  renderAll();
}

function fieldInstructions(title) {
  if (tool === 'select' && contextTool !== 'select') {
    return `<span class="context-hint">選択中 · 上の「${title}」で編集を再開</span>`;
  }
  const label = {
    select: '空いている所からドラッグで複数選択 · 図形をドラッグで移動',
    wall: columnPlacement ? '柱をドラッグ、または配置する場所をクリック'
      : 'クリックで続けて描く · 終点を再クリックかCtrl＋クリックで終了 · Shiftで自由な角度',
    scissors: wallCutStart ? '同じ壁線上の終点をクリック · Escで中断' : '壁線上の切り出したい区間の始点をクリック',
    floor: '角をクリックして囲む · Ctrl＋Zで角を一つ戻す · Shiftで角度を自由に',
    color: '角をクリックして囲む · Shiftで角度を自由に',
    text: activeRoomLabel ? 'ドラッグ、または配置する場所をクリック' : '部屋名をドラッグ · クリックで自由入力',
    fixture: drawingDivider() ? `仕切り線の${pending.length ? '終点' : '始点'}をクリック · ${activeParts.fixture === 'bathDivider' ? '角丸浴槽' : 'コンロ'}の枠に吸着 · Shiftで自由な角度` : '',
    zoom: 'クリックで拡大 · Ctrl＋0で全体表示',
  }[tool];
  return label ? `<span class="context-hint">${label}</span>` : '';
}

function renderContext() {
  const title = tools.find(item => item.id === contextTool).name;
  let controls = '';
  if (contextTool === 'wall') controls = partPalette('wall', tool === 'scissors' ? 'scissors' : columnPlacement ? 'column' : '', partDesigns)
    + (columnPlacement || tool === 'scissors' ? '' : numberField('太さ', 'default-width', defaults.width, 1, 80)
      + checkField('破線', 'default-dashed', defaults.dashed));
  if (contextTool === 'floor') {
    const { pattern } = floors[defaults.preset];
    controls = selectField('種類', 'default-preset', defaults.preset, floorChoices());
    if (pattern) controls += selectField('向き', 'default-direction', defaults.direction, [['vertical', '縦'], ['horizontal', '横']]);
    if (pattern === 'boards') controls += numberField('板の間隔', 'default-spacing', defaults.spacing, 3, 150);
    if (pattern === 'tatami') controls += selectField('畳の枚数', 'default-tatami', String(defaults.tatami), [['4', '4枚'], ['6', '6枚'], ['8', '8枚']]);
  }
  if (contextTool === 'color') controls = selectField('部屋の種別', 'default-room', defaults.room, roomChoices())
    + colorField('default-color', defaults.color);
  if (contextTool === 'text') controls = roomLabelPalette(activeRoomLabel)
    + selectField('書体', 'default-font', defaults.font, fontChoices())
    + numberField('サイズ', 'default-size', defaults.size, 4, 300);
  if (Object.hasOwn(activeParts, contextTool)) controls = partPalette(contextTool, activeParts[contextTool], partDesigns)
    + (drawingDivider() ? '' : '<span class="context-hint">パーツを選び、キャンバスをクリックして配置</span>');
  if (contextTool === 'underlay') controls = importButton() + (doc().underlay
    ? `<span class="context-hint underlay-name" title="${escapeHtml(doc().underlay.name)}">${escapeHtml(doc().underlay.name)}</span>`
    : '<span class="context-hint">PDF・PNG・JPEG・WebPをキャンバスへドロップできます</span>');
  context.innerHTML = `<strong class="context-label">${title}</strong>${controls}${fieldInstructions(title)}`;
}

function renderLayers() {
  $('#layer-list').innerHTML = [...doc().layers].reverse().map(item => {
    const details = layers.find(entry => entry.id === item.id);
    const count = item.id === 'underlay' ? Number(Boolean(doc().underlay)) : doc().objects.filter(object => object.layer === item.id).length;
    const active = contextTool === item.id || [...selection].some(id => id === 'underlay' ? item.id === id : itemBy(id)?.layer === item.id);
    return `<div class="layer-row ${active ? 'active-layer' : ''} ${item.visible ? '' : 'hidden-layer'}">
      <button class="layer-select" type="button" data-tool="${item.id}" title="${details.name}ツール">
        <i style="--swatch:${details.swatch}"></i><span>${details.name}</span><small>${count}</small></button>
      <button class="icon-button layer-toggle" type="button" data-layer="${item.id}" data-toggle="visible" aria-pressed="${item.visible}" title="${details.name}の表示切り替え" aria-label="${details.name}の表示切り替え">${icon(item.visible ? 'eye' : 'eyeoff', 17)}</button>
      <button class="icon-button layer-toggle ${item.locked ? 'is-locked' : ''}" type="button" data-layer="${item.id}" data-toggle="locked" aria-pressed="${item.locked}" title="${details.name}のロック切り替え" aria-label="${details.name}のロック切り替え">${icon(item.locked ? 'lock' : 'unlock', 16)}</button>
    </div>`;
  }).join('');
}

function renderInspector() {
  const items = selectedObjects();
  $('#detail-title').textContent = 'プロパティ';
  if (doc().underlay && (tool === 'underlay' || selection.has('underlay'))) {
    const info = doc().underlay;
    $('#detail-title').textContent = '下絵の設定';
    inspector.innerHTML = `<span class="inspector-name">${escapeHtml(info.name)}</span>
      <fieldset ${editable('underlay') ? '' : 'disabled'}>
        ${info.format === 'pdf' ? numberField(`ページ（全${state.asset.count}）`, 'underlay-page', info.page, 1, state.asset.count) : ''}
        ${numberField('不透明度（%）', 'underlay-opacity', info.opacity * 100, 0, 100)}
        ${numberField('倍率（%）', 'underlay-scale', info.scale * 100, 1, 5000, 0.1)}
        ${numberField('回転（°）', 'underlay-angle', info.angle, -360, 360, 0.1)}
        ${numberField('位置 X', 'underlay-x', info.at[0], -1e6, 1e6, 0.1)}
        ${numberField('位置 Y', 'underlay-y', info.at[1], -1e6, 1e6, 0.1)}
        ${removeButton()}
      </fieldset>`;
  } else if (items.length === 1) {
    const item = items[0];
    $('#detail-title').textContent = names(item.layer);
    inspector.innerHTML = (item.kind ? `<span class="inspector-name">${parts[item.kind].name}</span>` : '')
      + propertyMarkup(item) + removeButton();
  } else if (items.length > 1) {
    const walls = editableSelection().filter(isWallSegment);
    const width = walls.length && walls.every(wall => wall.width === walls[0].width) ? walls[0].width : null;
    const dashed = walls.every(wall => wall.dashed);
    inspector.innerHTML = `<p class="inspector-placeholder">${items.length}個の図形を選択中</p>`
      + (walls.length ? numberField('壁の太さ', 'selected-wallWidth', width, 1, 80)
        + checkField('破線', 'selected-wallDashed', dashed, !dashed && walls.some(wall => wall.dashed)) : '')
      + removeButton();
    const mixed = inspector.querySelector('[data-mixed]');
    if (mixed) mixed.indeterminate = true;
  } else {
    inspector.innerHTML = '<p class="inspector-placeholder">図形を選ぶと、ここに設定が表示されます。</p>';
  }
}

function renderEditStatus() {
  $('#dirty-dot').hidden = !dirty();
  $('[data-action="undo"]').disabled = !undoStack.length && !canUndoFloorVertex();
  $('[data-action="redo"]').disabled = !redoStack.length;
}

function renderTextEdit(updateEditor = false) {
  // Keep the text controls mounted while focus changes.
  const areaField = inspector.querySelector('[data-room-area]');
  if (areaField) {
    const editor = inspector.querySelector(TEXT_INPUT);
    const value = itemBy(editor.dataset.objectId)?.value ?? '';
    const room = readRoomLabel(value);
    if (updateEditor) editor.value = value;
    areaField.hidden = !room;
    if (room) {
      areaField.querySelector('[data-field="object-roomArea"]').value = room.count;
      areaField.querySelector('[data-field="object-roomApproximate"]').checked = room.approximate;
    }
  }
  renderEditStatus();
  scheduleDraw();
}

function renderControls() {
  for (const button of document.querySelectorAll('.tool')) {
    button.setAttribute('aria-pressed', button.dataset.tool === tool);
    button.classList.toggle('is-context-tool', button.dataset.tool === contextTool && contextTool !== tool);
  }
  stage.dataset.tool = temporarySelection ? 'select' : tool;
  stage.classList.toggle('is-panning', drag?.type === 'pan' || space);
  stage.classList.toggle('rotating-part', drag?.handle === 'rotate-part');
  $('#project-name').value = doc().name;
  renderEditStatus();
  $('#object-count').textContent = doc().objects.length + ' 個の図形';
  $('#empty-note').hidden = Boolean(doc().objects.length || doc().underlay || contextTool !== 'select');
  renderContext();
  renderLayers();
  renderInspector();
}

function transformView() {
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);
  $('#zoom-value').textContent = Math.round(view.scale * 100) + '%';
  scheduleDraw();
}

function displayBounds() {
  const d = doc();
  const geometry = wallGeometry(d);
  const bounds = d.objects.map(item => objectBounds(item, geometry.get(item.wallId)?.wall.width));
  if (d.underlay) {
    const info = d.underlay;
    bounds.push(rotatedBounds(info.at, info.naturalWidth * info.scale, info.naturalHeight * info.scale, info.angle));
  }
  const points = [[0, 0], [d.width, d.height], ...bounds.flatMap(box => [[box.x, box.y], [box.x + box.width, box.y + box.height]])];
  return polygonBounds(points);
}

function fit() {
  const bounds = displayBounds();
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const available = Math.max(30, Math.min(120, height * 0.14));
  const scale = clamp(Math.min((width - 56) / bounds.width, (height - available) / bounds.height), 0.008, 3);
  view = {
    scale,
    x: width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
  fitOnResize = true;
  transformView();
}

function zoom(factor, at = [stage.clientWidth / 2, stage.clientHeight / 2]) {
  const scale = clamp(view.scale * factor, 0.008, 12);
  const ratio = scale / view.scale;
  view = { scale, x: at[0] - (at[0] - view.x) * ratio, y: at[1] - (at[1] - view.y) * ratio };
  fitOnResize = false;
  transformView();
}

function screenPoint(event) {
  const bounds = stage.getBoundingClientRect();
  return [event.clientX - bounds.left, event.clientY - bounds.top];
}

const toWorld = point => [(point[0] - view.x) / view.scale, (point[1] - view.y) / view.scale];

function corners(box) {
  return [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]];
}

function boundsOf(items) {
  const geometry = wallGeometry(doc());
  return polygonBounds(items.flatMap(item => corners(objectBounds(item, geometry.get(item.wallId)?.wall.width))));
}

function partRotationBox(item) {
  if (item.layer === 'fixture') return { x: -item.w / 2, y: -item.h / 2, width: item.w, height: item.h };
  const wallWidth = itemBy(item.wallId)?.width;
  const variant = partVariant(item);
  const depth = openingFrameDepth(item.kind, item.w, clamp(item.h, 4, 10), variant, item.steppedDepth, wallWidth);
  const halfFrame = depth / 2;
  const swingDepth = openingSwingDepth(item.kind, item.w, item.h, depth, variant);
  const y = item.flipY ? -halfFrame : -Math.max(halfFrame, swingDepth);
  return { x: -item.w / 2, y, width: item.w, height: halfFrame + Math.max(halfFrame, swingDepth) };
}

function handlesMarkup(items) {
  if (!items.length && !selection.has('underlay')) return '';
  const radius = 4.8 / view.scale;
  const stroke = 1.25 / view.scale;
  const edge = (a, b, c = 'none') =>
    `<path pointer-events="none" d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke-dasharray="${c}"/>`;
  const handle = (point, id, cursor) => `<circle class="drag-handle" data-handle="${id}" cx="${point[0]}" cy="${point[1]}" r="${radius}" fill="#ffffff"
    ${cursor ? `style="cursor:${cursor}"` : ''}/>`;
  const selectionEdges = box => {
    const points = corners(box);
    return points.map((point, i) => {
      const next = points[(i + 1) % 4];
      const side = EDGE_HANDLES[i];
      const [axisX] = DIRECTIONS[side];
      const dimension = axisX ? box.width : box.height;
      const target = dimension > 0.01
        ? `<path class="resize-edge" data-handle="${side}" d="M${point.join(' ')}L${next.join(' ')}"
            stroke="transparent" stroke-width="${12 / view.scale}"/>`
        : '';
      return edge(point, next, `${4 / view.scale} ${3 / view.scale}`) + target;
    }).join('');
  };
  let draw = '';
  if (selection.has('underlay') && doc().underlay && editable('underlay')) {
    const { at, scale, naturalWidth, naturalHeight, angle } = doc().underlay;
    const box = rotatedBounds(at, naturalWidth * scale, naturalHeight * scale, angle);
    const points = corners(box);
    draw = points.map((point, i) => edge(point, points[(i + 1) % 4], `${4 / view.scale} ${3 / view.scale}`)).join('')
      + points.map((point, i) => handle(point, HANDLES[i])).join('');
  } else if (items.length === 1 && isWallSegment(items[0])) {
    const item = items[0];
    const box = boundsOf(items);
    draw = (box.width > 0.01 && box.height > 0.01 ? selectionEdges(box) : edge(item.a, item.b))
      + handle(item.a, 'wall-a') + handle(item.b, 'wall-b');
  } else if (items.length === 1 && Object.hasOwn(activeParts, items[0].layer)) {
    const item = items[0];
    const worldPoint = point => add(item.at, rotate(point, item.angle));
    const box = partRotationBox(item);
    const accordion = isAccordionSliding(item.kind, partVariant(item));
    const gripY = accordion ? (item.flipY ? box.y : box.y + box.height) : 0;
    const left = worldPoint([-item.w / 2, gripY]);
    const right = worldPoint([item.w / 2, gripY]);
    const widthCursor = accordion
      ? ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][(Math.round(item.angle / 45) % 4 + 4) % 4] : undefined;
    const rotationOffset = (accordion ? 10 : 6) / view.scale;
    const local = corners(box);
    const outline = local.map(worldPoint);
    const rotationHandles = local.map(([x, y], i) => {
      const [sx, sy] = DIRECTIONS[HANDLES[i]];
      const [cx, cy] = worldPoint([x + sx * rotationOffset, y + sy * rotationOffset]);
      return `<circle class="part-rotation-handle" data-handle="rotate-part"
        cx="${cx}" cy="${cy}" r="${9 / view.scale}"/>`;
    }).join('');
    draw = outline.map((point, i) => edge(point, outline[(i + 1) % 4], `${4 / view.scale} ${3 / view.scale}`)).join('')
      + rotationHandles;
    draw += item.layer === 'opening'
      ? handle(left, 'part-left', widthCursor) + handle(right, 'part-right', widthCursor)
      : outline.map((point, i) => handle(point, 'fixture-' + HANDLES[i])).join('');
    if (isSteppedSliding(item.kind, partVariant(item))) {
      for (const side of [-1, 1]) {
        const y = side * box.height / 2;
        const grip = worldPoint([0, y + side * 10 / view.scale]);
        draw += edge(worldPoint([0, y]), grip) + handle(grip, side < 0 ? 'depth-top' : 'depth-bottom');
      }
    }
    if (item.kind === 'folding') {
      const y = item.flipY ? box.y + box.height : box.y;
      const flip = item.flipX ? -1 : 1;
      draw += foldingTriangleLayout(partVariant(item), item.foldingTriangles).map(({ center }, index) =>
        handle(worldPoint([(center - 0.5) * item.w * flip, y]), 'fold-triangle-' + index)).join('');
    }
  } else if (items.length) {
    const box = boundsOf(items);
    draw = selectionEdges(box) + corners(box).map((point, i) => handle(point, HANDLES[i])).join('');
    if (items.length > 1 && items.some(item => item.wallGroup)) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      draw += `<g transform="translate(${x} ${y}) scale(${1 / view.scale})">
        <circle class="move-group-handle" data-handle="move-group" r="8" fill="#ffffff" stroke-width="1.25"/>
        <path d="M-4 0H4 M-2-2l-2 2 2 2 M2-2l2 2-2 2 M0-4V4 M-2-2l2-2 2 2 M-2 2l2 2 2-2"
          stroke-width="1.15" stroke-linecap="round" pointer-events="none"/>
        </g>`;
    }
    if (items.length === 1 && items[0].points) {
      draw += items[0].points.map((point, i) => handle(point, 'vertex-' + i)).join('');
    }
  }
  return `<g stroke="#157f69" stroke-width="${stroke}" fill="none">${draw}</g>`;
}

function snapMarker([x, y], className) {
  return `<circle cx="${x}" cy="${y}" r="${10 / view.scale}" fill="#ffdea0" opacity=".84"/>
    <circle class="${className}" cx="${x}" cy="${y}" r="${5.5 / view.scale}" fill="#b65200"
      stroke="#ffffff" stroke-width="${1.5 / view.scale}"/>`;
}

function draftMarkup(wall) {
  let markup = '';
  const divider = drawingDivider() && hover && !temporarySelection ? dividerPoint(hover.point, hover.free) : null;
  if (pending.length && (!temporarySelection || tool === 'floor')) {
    const closing = hover?.atStart ? polygonForClosure(hover.free) : null;
    const vertices = closing ?? (wall ? [wall.start] : pending);
    const points = hover ? [...vertices, wall?.end ?? divider?.point ?? (closing ? vertices[0] : drawingPoint(hover.point, hover.free))] : vertices;
    markup += `<polyline points="${points.map(point => point.join(',')).join(' ')}"
      fill="${tool === 'color' ? defaults.color : 'none'}" fill-opacity=".35" stroke="#23876d"
      stroke-width="${tool === 'wall' ? defaults.width : 1.6 / view.scale}"
      ${tool === 'wall' && defaults.dashed ? `stroke-dasharray="${wallDashArray(defaults.width)}"` : ''} opacity=".8"/>`;
    for (const [x, y] of vertices) markup += `<circle cx="${x}" cy="${y}" r="${4 / view.scale}" fill="#20765f"/>`;
    if (closing) markup += snapMarker(vertices[0], 'closing-target');
    if (wall?.target) markup += snapMarker(wall.target, 'wall-snap-target');
  } else if (!temporarySelection && tool === 'wall' && hover?.wallTarget) {
    markup += snapMarker(hover.wallTarget, 'wall-snap-target');
  }
  if (divider?.frameId) markup += snapMarker(divider.point, 'divider-snap-target');
  if (tool === 'scissors' && !temporarySelection) {
    const end = hover?.cut;
    if (wallCutStart && end) {
      markup += `<path class="wall-cut-preview" d="M${wallCutStart.point.join(' ')}L${end.point.join(' ')}"
        stroke="#23876d" stroke-width="${end.wall.width + 3 / view.scale}" opacity=".68"/>`;
    }
    if (wallCutStart) markup += snapMarker(wallCutStart.point, 'wall-cut-start');
    if (end) markup += snapMarker(end.point, 'wall-cut-target');
  }
  if (draftPart && !temporarySelection && !drag) {
    const host = itemBy(draftPart.wallId);
    const draftDoc = { ...doc(), objects: host ? [host, draftPart] : [draftPart] };
    const entry = renderScene(draftDoc, { showUnderlay: false, entries: true }).find(item => item.id === draftPart.id);
    if (entry) markup += '<g class="part-preview" opacity=".62">' + entry.drawing + '</g>';
  }
  return `<g pointer-events="none">${markup}</g>`;
}

const sceneNodes = new Map();

function updateScene(graph) {
  const entries = renderScene(graph, { underlayImage: state.asset?.url, entries: true });
  const visible = new Set(entries.map(entry => entry.id));
  for (const [id, cached] of sceneNodes) {
    if (!visible.has(id)) {
      cached.node.remove();
      sceneNodes.delete(id);
    }
  }
  let next = scene.firstElementChild;
  const locked = new Set(doc().layers.filter(item => item.locked).map(item => item.id));
  for (const { id, layer: layerId, drawing } of entries) {
    let cached = sceneNodes.get(id);
    if (!cached) {
      const node = document.createElementNS(stage.namespaceURI, 'g');
      node.dataset.id = id;
      cached = { node, drawing: null };
      sceneNodes.set(id, cached);
    }
    if (cached.drawing !== drawing) {
      cached.node.innerHTML = drawing;
      cached.drawing = drawing;
    }
    const pointerEvents = locked.has(layerId) ? 'none' : '';
    if (cached.node.style.pointerEvents !== pointerEvents) cached.node.style.pointerEvents = pointerEvents;
    if (next !== cached.node) scene.insertBefore(cached.node, next);
    next = cached.node.nextElementSibling;
  }
}

function marqueeMarkup({ bounds }) {
  const { x, y, width, height } = bounds;
  return `<rect class="selection-marquee" x="${x}" y="${y}" width="${width}" height="${height}"
    fill="#18836b" fill-opacity=".08" stroke="#157f69" stroke-width="${1 / view.scale}"
    stroke-dasharray="${4 / view.scale} ${3 / view.scale}" pointer-events="none"/>`;
}

function horizontalTextCaretBar(item, editor, position, length) {
  const preceding = editor.value.slice(0, position).split('\n');
  const column = preceding.at(-1).length;
  const lines = sceneNodes.get(item.id)?.node.querySelector('.text-glyphs')?.children;
  const line = lines?.[preceding.length - 1];
  if (!line) return '';
  const count = line.getNumberOfChars();
  const x = column < count ? line.getStartPositionOfChar(column).x
    : count ? line.getEndPositionOfChar(count - 1).x : 0;
  const baseline = line.y.baseVal.getItem(0).value;
  return `M${x} ${baseline - item.size * 0.28 - length / 2}v${length}`;
}

function textCaretMarkup(item, editor) {
  const position = editor.selectionDirection === 'backward' ? editor.selectionStart : editor.selectionEnd;
  const length = Math.max(item.size, 11 / view.scale);
  let bar;
  if (item.vertical) {
    const [x, y] = verticalTextCaret(editor.value, position, item.size);
    bar = `M${x - length / 2} ${y}h${length}`;
  } else bar = horizontalTextCaretBar(item, editor, position, length);
  if (!bar) return '';
  return `<g class="text-edit-caret" transform="translate(${item.at.join(' ')}) rotate(${item.vertical ? 0 : item.angle})"
    aria-hidden="true" pointer-events="none" fill="none">
    <path d="${bar}" stroke="#ffffff" stroke-width="4" vector-effect="non-scaling-stroke"/>
    <path d="${bar}" stroke="#08786a" stroke-width="2" vector-effect="non-scaling-stroke"/>
  </g>`;
}

function draw() {
  drawFrame = 0;
  stage.classList.toggle('part-placement-cursor',
    draftPart?.layer === tool && !temporarySelection && !drag && !draggedKind);
  const wall = !temporarySelection && tool === 'wall' && pending.length && hover
    ? wallDraft(hover.point, hover.free, hover.wallTarget) : null;
  let graph = doc();
  const editor = document.activeElement;
  const editing = editor?.matches(TEXT_INPUT) ? itemBy(editor.dataset.objectId) : null;
  if (editing && editing.value !== editor.value) {
    graph = { ...graph, objects: graph.objects.map(item => item === editing ? { ...item, value: editor.value } : item) };
  }
  if (wall?.adjustment) {
    const { id } = wall.adjustment;
    graph = { ...graph, objects: graph.objects.map(item => item.id === id || item.wallId === id ? { ...item } : item) };
    applyWallAdjustment(graph, wall.adjustment);
  }
  $('#paper').setAttribute('width', graph.width);
  $('#paper').setAttribute('height', graph.height);
  updateScene(graph);
  overlay.innerHTML = draftMarkup(wall) + (drag?.type === 'marquee' && drag.bounds
    ? marqueeMarkup(drag)
    : editing ? textCaretMarkup(editing, editor) : handlesMarkup(graph.objects.filter(item => selection.has(item.id))));
}

function scheduleDraw() {
  if (!drawFrame) drawFrame = requestAnimationFrame(draw);
}

function renderAll() {
  renderControls();
  scheduleDraw();
}

function canEditItem(item) {
  if (!editable(item.layer)) return false;
  return !isWallSegment(item) || !layer('opening').locked || !doc().objects.some(part => part.wallId === item.id);
}

function groupWalls(items) {
  const groups = new Map();
  for (const item of items) {
    if (!item.wallGroup) continue;
    if (!groups.has(item.wallGroup)) groups.set(item.wallGroup, []);
    groups.get(item.wallGroup).push(item);
  }
  return groups;
}

function selectableMembers(item, groups) {
  const members = item.wallGroup ? groups.get(item.wallGroup) : [item];
  return members.every(canEditItem) ? members : [];
}

function editableSelection() {
  const objects = doc().objects;
  const groups = groupWalls(objects);
  const eligible = new Map();
  return selectedObjects().filter(item => {
    const key = item.wallGroup ?? item;
    if (!eligible.has(key)) eligible.set(key, selectableMembers(item, groups).length > 0);
    return eligible.get(key);
  });
}

function nearestWallEndpoint(point, { radius, excluded, accepts }) {
  if (!layer('wall').visible) return null;
  let nearest = null;
  let best = radius / view.scale;
  for (const item of doc().objects) {
    if (!isWallSegment(item) || excluded?.has(item.id)) continue;
    for (const endpoint of [item.a, item.b]) {
      const distance = lengthOf(endpoint, point);
      if (distance <= best && (!accepts || accepts(endpoint))) {
        nearest = endpoint;
        best = distance;
      }
    }
  }
  return nearest;
}

function snapWallPoint(point, { excluded, origin, free = false }) {
  const endpoint = nearestWallEndpoint(point, {
    radius: 9, excluded, accepts: target => free || isDrawingAngle(origin, target),
  });
  return endpoint ? [...endpoint] : free ? point : snapDrawingAngle(point, origin);
}

function wallSnapTarget(point, stickyTarget, accepts) {
  if (stickyTarget && lengthOf(stickyTarget, point) * view.scale <= SNAP_RELEASE_RADIUS
    && (!accepts || accepts(stickyTarget))) return stickyTarget;
  return nearestWallEndpoint(point, { radius: SNAP_RADIUS, accepts });
}

function wallGeometry(graph) {
  if (!wallGeometryCache.has(graph)) wallGeometryCache.set(graph, wallDrawingGeometry(graph.objects));
  return wallGeometryCache.get(graph);
}

function wallCutPoint(point) {
  if (!editable('wall')) return null;
  const geometry = wallGeometry(doc());
  const candidates = wallCutStart?.graph === doc()
    ? [...wallCutStart.run.keys()].map(id => geometry.get(id)) : geometry.values();
  let nearest = null;
  let best = Infinity;
  for (const entry of candidates) {
    if (!entry || !canEditItem(entry.wall)) continue;
    const { wall, segments } = entry;
    for (const [a, b] of segments) {
      const projection = projectOnWall(point, { a, b });
      if (projection.distance > wall.width / 2 + 5 / view.scale) continue;
      const center = lerp(a, b, clamp(projection.t, 0, 1));
      const length = lengthOf(wall.a, wall.b);
      const fraction = clamp(projectOnWall(center, wall).t, 0, 1);
      const distance = lengthOf(point, lerp(wall.a, wall.b, fraction));
      if (distance >= best) continue;
      const t = fraction <= 1 / length ? 0 : fraction >= 1 - 1 / length ? 1 : fraction;
      nearest = { wall, t, point: lerp(wall.a, wall.b, t) };
      best = distance;
    }
  }
  return nearest;
}

function cutWallClick(point) {
  if (wallCutStart && wallCutStart.graph !== doc()) {
    wallCutStart = null;
    hover = null;
    renderContext();
    scheduleDraw();
  }
  const target = wallCutPoint(point);
  if (!target) {
    status(wallCutStart ? '始点と同じ壁線上に終点を指定してください。' : '編集できる壁線上に始点を指定してください。', true);
    return;
  }
  if (!wallCutStart) {
    const walls = doc().objects.filter(item => isWallSegment(item) && canEditItem(item));
    wallCutStart = { ...target, graph: doc(), run: wallCutRun(walls, target.wall) };
    hover = null;
    renderContext();
    scheduleDraw();
    return;
  }
  let result;
  const changed = commit(graph => {
    result = cutWall(graph, wallCutStart.run, wallCutStart, target);
    return !result.error;
  });
  if (!changed) {
    const messages = {
      short: '終点を始点から離して指定してください。',
      opening: '窓や扉に重ならない切断位置を指定してください。',
      limit: '図形数が上限に達するため切断できません。',
      missing: '切断する壁線を選び直してください。',
    };
    status(messages[result.error], true);
    return;
  }
  selection.clear();
  for (const id of result.ids) selection.add(id);
  selectTool('select', { keepSelection: true });
  status('切り出した壁線を選択しました。Deleteで削除、ドラッグで移動できます。');
}

function updateDraftHover(point, free) {
  const stickyTarget = hover?.wallTarget;
  const wallTarget = tool !== 'wall' ? null : pending.length
    ? wallDraft(point, free, stickyTarget).stickyTarget
    : wallSnapTarget(point, stickyTarget);
  hover = { point, free, atStart: isClosingPoint(point), wallTarget };
  scheduleDraw();
}

function alignWallTail(tail, target) {
  if (!tail || !canEditItem(tail)) return null;
  const [dx, dy] = sub(tail.b, tail.a);
  const corner = dx === 0 ? [tail.b[0], target[1]]
    : dy === 0 ? [target[0], tail.b[1]] : null;
  if (!corner || lengthOf(corner, target) < 1) return null;

  const [newDx, newDy] = sub(corner, tail.a);
  const newLength = lengthOf(corner, tail.a);
  if (newLength < 1 || dx * newDx + dy * newDy <= 0) return null;
  if (nearestWallEndpoint(tail.b, { radius: 0.01, excluded: new Set([tail.id]) })) return null;
  if (doc().objects.some(item => item.wallId === tail.id && item.w > newLength)) return null;
  return corner;
}

function applyWallAdjustment(graph, adjustment) {
  const wall = graph.objects.find(item => item.id === adjustment.id);
  wall.b = adjustment.end;
  syncOpenings(graph, wall.id);
}

function intersectingWallTarget(point, start, end) {
  const axis = wallDirection({ a: start, b: end });
  if (axis === null || lengthOf(start, end) < 1) return null;
  let nearest = null;
  let best = SNAP_RADIUS / view.scale;
  for (const wall of doc().objects) {
    if (!isWallSegment(wall) || wallDirection(wall) !== 1 - axis) continue;
    const crossing = [...end];
    crossing[axis] = wall.a[axis];
    const { t } = projectOnWall(crossing, wall);
    const distance = lengthOf(point, crossing);
    if (t <= 0 || t >= 1 || distance > best || lengthOf(start, crossing) < 1) continue;
    nearest = crossing;
    best = distance;
  }
  return nearest;
}

function wallDraft(point, free, stickyTarget) {
  const start = pending[0];
  const tail = wallChain?.tailId ? itemBy(wallChain.tailId) : null;
  const anchored = !free && nearestWallEndpoint(start, { radius: 0.01 });
  function connection(target) {
    if (lengthOf(start, target) < 1) return null;
    const allowed = free || isDrawingAngle(start, target);
    const closesChain = wallChain && lengthOf(wallChain.first, target) < 1e-7;
    if (!free && (!allowed || closesChain)) {
      const corner = alignWallTail(tail, target);
      if (corner && lengthOf(corner, start) > 1e-7) {
        return { start: corner, adjustment: { id: tail.id, end: corner } };
      }
    }
    if (allowed) return { start };
    if (anchored) return null;
    const aligned = snapDrawingAngle(start, target);
    return lengthOf(aligned, start) * view.scale <= SNAP_RADIUS ? { start: aligned } : null;
  }
  const target = wallSnapTarget(point, stickyTarget, connection);
  if (target) return { ...connection(target), end: [...target], target, stickyTarget: target };
  const end = free ? point : snapDrawingAngle(point, start);
  const intersection = free ? null : intersectingWallTarget(point, start, end);
  return { start, end: intersection ?? end, target: intersection };
}

function isClosingPoint(point) {
  if (pending.length < 3 || (tool !== 'floor' && tool !== 'color')) return false;
  const radius = hover?.atStart ? SNAP_RELEASE_RADIUS : SNAP_RADIUS;
  return lengthOf(point, pending[0]) * view.scale <= radius;
}

function drawingPoint(point, free) {
  const origin = pending.at(-1);
  if (!origin) return point;
  if (free) return point;
  const corner = pending.length >= 2 && snapClosingCorner(point, origin, pending[0], 9 / view.scale);
  return corner || snapDrawingAngle(point, origin);
}

function snapPart(part, point, graph, { excluded = new Set(), join = false, preview = false } = {}) {
  part.at = point;
  if (part.layer !== 'opening') return;
  detach(part);
  const wallLayer = graph.layers.find(item => item.id === 'wall');
  if (!wallLayer.visible) return;
  const radius = 13 / view.scale;
  const walls = graph.objects.filter(item => isWallSegment(item) && !excluded.has(item.id));
  const canJoin = part.kind === 'window' && !wallLayer.locked && (join || preview);
  let target;
  let nearest;
  for (const wall of walls) {
    const result = projectOnWall(point, wall);
    if (result.distance >= radius) continue;
    const candidate = { wall, ...result };
    if (canJoin && (!nearest || result.distance < nearest.distance)) nearest = candidate;
    if ((!target || result.distance < target.distance) && lengthOf(wall.a, wall.b) >= part.w) {
      target = candidate;
    }
  }
  if (nearest) {
    const joined = windowWallJoin(walls, nearest.wall, nearest.t, part.w);
    if (joined) {
      if (join) mergeWindowHost(graph, joined);
      target = joined;
    }
  }
  if (target) positionOpening(part, target.wall, target.t);
}

function snapFixture(part, graph) {
  if (!graph.layers.find(item => item.id === 'wall').visible) return;
  const radius = Math.min(FIXTURE_SNAP_RADIUS / view.scale, Math.min(part.w, part.h) / 4);
  part.at = snapFixtureToWall(part, wallGeometry(graph).values(), radius);
}

function addItem(item, message, prepare) {
  if (!editable(item.layer)) {
    status('「' + names(item.layer) + '」レイヤーの表示とロックを確認してください。', true);
    return;
  }
  if (doc().objects.length >= OBJECT_LIMIT) {
    status('図形数の上限は' + OBJECT_LIMIT.toLocaleString('ja-JP') + '個です。', true);
    return;
  }
  selection.clear();
  selection.add(item.id);
  return commit(d => {
    prepare?.(d);
    d.objects.push(item);
  }, message);
}

function partAt(kind, point, variant) {
  const part = makePart(kind, point, undefined, variant);
  if (part.layer === 'fixture') snapFixture(part, doc());
  else if (part.layer === 'opening') snapPart(part, point, doc(), { preview: true });
  return part;
}

function textAt(point, value) {
  return { id: uid(), layer: 'text', at: point, value, size: defaults.size, font: defaults.font, angle: 0 };
}

function paletteItemAt(kind, point, variant = partDesigns[kind]) {
  if (Object.hasOwn(ROOM_LABELS, kind)) {
    return textAt(point, roomLabelText(ROOM_LABELS[kind], ROOM_LABEL_TATAMI.initial));
  }
  if (Object.hasOwn(parts, kind)) return partAt(kind, point, variant);
  return null;
}

function dividerPoint(point, free, kind = activeParts.fixture) {
  const candidate = drawingPoint(point, free);
  return snapDividerToFrame(candidate, free ? null : pending[0], doc().objects,
    Math.min(7 / view.scale, 9), kind, dividerStartFrame) ?? { point: candidate };
}

function drawDivider(kind, variant, point, free) {
  const start = pending[0];
  const { point: end, frameId } = dividerPoint(point, free, kind);
  if (!start) {
    pending = [end];
    dividerStartFrame = frameId;
    hover = null;
    renderContext();
    scheduleDraw();
    return;
  }
  const length = lengthOf(start, end);
  if (length < 1) return;
  if (length > 50000) {
    status('仕切り線が長すぎます。終点を始点に近づけてください。', true);
    return;
  }
  const part = makePart(kind, lerp(start, end, 0.5), undefined, variant);
  part.h = length;
  part.angle = (angleOf(start, end) + 270) % 360;
  placeItem(part, '仕切り線を配置しました。');
}

function placePaletteItem(kind, point, free = false, variant = partDesigns[kind]) {
  if (isDividerPart(kind, variant)) {
    drawDivider(kind, variant, point, free);
    return;
  }
  const opening = parts[kind]?.layer === 'opening';
  const item = opening ? makePart(kind, point, undefined, variant) : paletteItemAt(kind, point, variant);
  const name = kind === 'kitchen' || kind === 'bath' ? PART_DESIGNS[kind].choices[variant]
    : item?.layer === 'text' ? ROOM_LABELS[kind] : parts[kind]?.name;
  if (item) placeItem(item, name + 'を配置しました。', opening ? graph => snapPart(item, point, graph, { join: true }) : undefined);
}

function placeItem(item, message, prepare) {
  if (!addItem(item, message, prepare)) return false;
  selectTool('select', { keepSelection: true });
  return true;
}

function polygonForClosure(free) {
  if (free) return pending;
  const corner = alignFinalCorner(pending.at(-2), pending.at(-1), pending[0]);
  return corner ? [...pending.slice(0, -1), corner] : null;
}

function finishPolygon(free = false) {
  if (pending.length < 3 || !editable(tool)) return;
  const points = polygonForClosure(free);
  if (!points) {
    status('角を追加するか、Shiftを押しながら閉じてください。', true);
    return;
  }
  clearDraft();
  renderEditStatus();
  if (Math.abs(points.reduce((area, p, i) => {
    const q = points[(i + 1) % points.length];
    return area + p[0] * q[1] - p[1] * q[0];
  }, 0)) < 2) {
    status('面積のある形を描いてください。', true);
    scheduleDraw();
    return;
  }
  const item = { id: uid(), layer: tool, points };
  if (tool === 'floor') Object.assign(item, {
    preset: defaults.preset, direction: defaults.direction, spacing: defaults.spacing, tatami: defaults.tatami,
  });
  else Object.assign(item, { room: defaults.room, fill: defaults.color });
  addItem(item, names(tool) + 'を追加しました。');
}

function drawingClick(event, point) {
  if (tool === 'scissors') {
    cutWallClick(point);
    return;
  }
  if (!editable(tool)) {
    status('「' + names(tool) + '」レイヤーの表示とロックを確認してください。', true);
    return;
  }
  const kind = placementKind();
  if (kind) {
    placePaletteItem(kind, point, event.shiftKey);
    return;
  }
  if (tool === 'wall') {
    if (!pending.length) {
      const target = wallSnapTarget(point, hover?.wallTarget);
      pending = [target ? [...target] : point];
      wallChain = { first: pending[0], groupId: uid() };
      hover = null;
    } else if (wallChain.lastClick && Math.min(lengthOf(point, pending[0]), lengthOf(point, wallChain.lastClick)) * view.scale <= 6) {
      finishWallChain();
      updateDraftHover(point, event.shiftKey);
    } else {
      const { start, end, adjustment } = wallDraft(point, event.shiftKey, hover?.wallTarget);
      const wall = {
        id: uid(), layer: 'wall', wallGroup: wallChain.groupId, a: start, b: end, width: defaults.width, dashed: defaults.dashed,
      };
      if (lengthOf(start, end) >= 1 && addItem(wall, '壁を追加しました。', adjustment ? graph => applyWallAdjustment(graph, adjustment) : undefined)) {
        pending = [end];
        hover = null;
        wallChain.tailId = wall.id;
        wallChain.lastClick = point;
      }
    }
  } else if (tool === 'floor' || tool === 'color') {
    if (isClosingPoint(point) || (pending.length >= 3 && event.detail === 2)) finishPolygon(event.shiftKey);
    else {
      const next = drawingPoint(point, event.shiftKey);
      if (pending.length < 1000 && (!pending.length || lengthOf(next, pending.at(-1)) > 0.5)) {
        pending.push(next);
        hover = null;
        if (tool === 'floor') renderEditStatus();
      }
    }
  } else if (tool === 'text') {
    // Suppress the canvas's default mouse focus after focusing the editor.
    event.preventDefault();
    if (placeItem(textAt(point, '部屋名'), '文字を追加しました。')) {
      const editor = inspector.querySelector(TEXT_INPUT);
      editor.focus();
      editor.select();
    }
  }
  scheduleDraw();
}

function finishWallChain() {
  const tail = itemBy(wallChain?.tailId);
  if (tail) {
    const members = selectableMembers(tail, groupWalls(doc().objects));
    selection.clear();
    for (const member of members) selection.add(member.id);
  }
  clearDraft();
  renderAll();
  status('壁の連続描画を終了しました。');
}

function setTemporarySelection(active) {
  if (temporarySelection === active) return;
  temporarySelection = active;
  stage.dataset.tool = active ? 'select' : tool;
  stage.classList.toggle('temporary-selection', active);
  scheduleDraw();
}

function beginDrag(event, type, data = {}) {
  stage.setPointerCapture(event.pointerId);
  const screen = screenPoint(event);
  drag = { type, pointer: event.pointerId, start: toWorld(screen), screen, before: state, moved: false, ...data };
  stage.classList.toggle('is-panning', type === 'pan');
  stage.classList.toggle('rotating-part', data.handle === 'rotate-part');
}

function cancelDrag() {
  if (!drag) return;
  const current = drag;
  drag = null;
  if (current.type !== 'pan' && current.type !== 'marquee') {
    state = current.before;
    selection.clear();
    for (const id of current.ids ?? []) selection.add(id);
  }
  if (stage.hasPointerCapture(current.pointer)) stage.releasePointerCapture(current.pointer);
  renderAll();
}

stage.addEventListener('pointerdown', event => {
  if (fileBusy || event.button > 1 || partDesignMenu.matches(':popover-open')) return;
  const screen = screenPoint(event);
  const point = toWorld(screen);
  stage.focus({ preventScroll: true });
  if (space || event.button === 1) {
    event.preventDefault();
    beginDrag(event, 'pan', { view: { ...view } });
    return;
  }
  const pointerTool = event.ctrlKey ? 'select' : tool;
  setTemporarySelection(event.ctrlKey);
  const endedWall = event.ctrlKey && tool === 'wall' && pending.length > 0;
  if (endedWall) finishWallChain();
  if (pointerTool === 'zoom') {
    zoom(event.shiftKey ? 1 / 1.25 : 1.25, screen);
    return;
  }
  let handle = !endedWall && ['select', 'underlay', 'opening', 'fixture'].includes(pointerTool)
    ? event.target.closest('[data-handle]')?.dataset.handle : null;
  if (handle?.startsWith('fold-triangle-')) {
    let nearest = Infinity;
    for (const dot of overlay.querySelectorAll('[data-handle^="fold-triangle-"]')) {
      const distance = lengthOf(point, [dot.cx.baseVal.value, dot.cy.baseVal.value]);
      if (distance >= nearest) continue;
      nearest = distance;
      handle = dot.dataset.handle;
    }
  }
  const throughEdge = EDGE_HANDLES.includes(handle) && (event.shiftKey || event.altKey);
  const hitTarget = throughEdge
    ? document.elementsFromPoint(event.clientX, event.clientY).map(node => node.closest('[data-id]')).find(Boolean)
    : event.target.closest('[data-id]');
  const hit = hitTarget?.dataset.id;
  if (handle && !throughEdge) {
    const items = selectedObjects();
    if (items.every(canEditItem)) {
      if (handle === 'move-group') beginDrag(event, 'move', { ids: [...selection], duplicate: event.altKey });
      else beginDrag(event, 'handle', { handle, ids: [...selection] });
    }
    return;
  }
  if (pointerTool === 'underlay' || pointerTool === 'select') {
    const clicked = itemBy(hit);
    const members = clicked && pointerTool === 'select' ? selectableMembers(clicked, groupWalls(doc().objects)) : [];
    if (pointerTool === 'select' && !members.length) {
      beginDrag(event, 'marquee', { clicked, underlay: hit === 'underlay' && editable('underlay') });
      return;
    }
    if (hit === 'underlay' && !editable('underlay')) return;
    if (clicked && (!canEditItem(clicked) || pointerTool === 'underlay')) return;
    if (!event.shiftKey && (!hit || !selection.has(hit))) selection.clear();
    if (hit === 'underlay') {
      const deselect = event.shiftKey && selection.has(hit);
      selection.clear();
      if (!deselect) selection.add(hit);
    } else if (members.length) {
      if (event.shiftKey && members.every(item => selection.has(item.id))) {
        for (const item of members) selection.delete(item.id);
      } else {
        selection.delete('underlay');
        for (const item of members) selection.add(item.id);
      }
    }
    renderAll();
    if (hit && selection.has(hit) && !event.shiftKey && selectedObjects().every(canEditItem)) {
      beginDrag(event, 'move', { ids: [...selection], duplicate: event.altKey && hit !== 'underlay' });
    }
    return;
  }
  drawingClick(event, point);
});

function moveItems(copy, current, delta) {
  if (current.ids.includes('underlay')) {
    copy.underlay.at = add(copy.underlay.at, delta);
    return;
  }
  const chosen = new Set(current.ids);
  let items = copy.objects.filter(item => chosen.has(item.id));
  if (current.duplicate) {
    if (copy.objects.length + items.length > OBJECT_LIMIT) return;
    for (const item of items) if (!current.copyIds.has(item.id)) current.copyIds.set(item.id, uid());
    items = items.map(source => {
      const item = structuredClone(source);
      item.id = current.copyIds.get(source.id);
      if (item.wallGroup) {
        if (!current.copyWallGroups.has(item.wallGroup)) current.copyWallGroups.set(item.wallGroup, uid());
        item.wallGroup = current.copyWallGroups.get(item.wallGroup);
      }
      if (item.wallId) {
        if (chosen.has(item.wallId)) item.wallId = current.copyIds.get(item.wallId);
        else detach(item);
      }
      return item;
    });
    copy.objects.push(...items);
  }
  const movedWalls = new Set(items.filter(isWallSegment).map(item => item.id));
  for (const item of items) {
    if (item.a) {
      item.a = add(item.a, delta);
      item.b = add(item.b, delta);
    } else if (item.points) {
      item.points = item.points.map(point => add(point, delta));
    } else if (item.layer === 'opening') {
      if (!movedWalls.has(item.wallId)) snapPart(item, add(item.at, delta), copy, { excluded: movedWalls, join: items.length === 1 });
    } else {
      item.at = add(item.at, delta);
      if (item.layer === 'fixture' && items.length === 1) snapFixture(item, current.before.doc);
    }
  }
  for (const wallId of movedWalls) syncOpenings(copy, wallId);
  if (current.duplicate) {
    selection.clear();
    for (const item of items) selection.add(item.id);
  }
}

function resizeOpening(item, graph, handle, to) {
  const side = handle === 'part-left' ? -1 : 1;
  const axis = rotate([1, 0], item.angle);
  const opposite = add(item.at, axis.map(v => v * -side * item.w / 2));
  const delta = sub(to, opposite);
  let max = 50000;
  const wall = graph.objects.find(candidate => candidate.id === item.wallId);
  if (wall) {
    const wallLength = lengthOf(wall.a, wall.b);
    const t = clamp(projectOnWall(opposite, wall).t, 0, 1);
    max = Math.max(4, (side === 1 ? 1 - t : t) * wallLength);
  }
  const width = clamp(side * (delta[0] * axis[0] + delta[1] * axis[1]), 4, max);
  item.h = clamp(item.h * width / item.w, 1, 50000);
  item.w = width;
  item.at = add(opposite, axis.map(v => v * side * width / 2));
  if (wall) positionOpening(item, wall, projectOnWall(item.at, wall).t);
}

function resizeGroup(graph, items, handle, from, to, proportional) {
  const box = boundsOf(items);
  const [signX, signY] = DIRECTIONS[handle];
  const anchor = [box.x + (signX < 0 ? box.width : 0), box.y + (signY < 0 ? box.height : 0)];
  const [dx, dy] = sub(to, anchor);
  const side = !signX || !signY;
  const delta = sub(to, from);
  let sx = signX && box.width > 0.01 ? clamp(side ? 1 + signX * delta[0] / box.width : signX * dx / box.width, 0.03, 30) : 1;
  let sy = signY && box.height > 0.01 ? clamp(side ? 1 + signY * delta[1] / box.height : signY * dy / box.height, 0.03, 30) : 1;
  if (proportional && !side) sx = sy = box.width >= box.height ? sx : sy;
  const scalePoint = ([x, y]) => [
    sx === 1 ? x : anchor[0] + (x - anchor[0]) * sx,
    sy === 1 ? y : anchor[1] + (y - anchor[1]) * sy,
  ];
  const wallItems = items.filter(isWallSegment);
  if (wallItems.some(item => lengthOf(scalePoint(item.a), scalePoint(item.b)) < 1)) return;
  const walls = new Set(wallItems.map(item => item.id));
  for (const item of items) {
    if (item.a) {
      item.a = scalePoint(item.a);
      item.b = scalePoint(item.b);
    } else if (item.points) item.points = item.points.map(scalePoint);
    else {
      item.at = scalePoint(item.at);
      if (item.layer === 'text') item.size = clamp(item.size * Math.min(sx, sy), 4, 300);
      else {
        const radians = item.angle * Math.PI / 180;
        const wScale = Math.hypot(sx * Math.cos(radians), sy * Math.sin(radians));
        const hScale = Math.hypot(sx * Math.sin(radians), sy * Math.cos(radians));
        item.w = clamp(item.w * wScale, 4, 50000);
        item.h = clamp(item.h * hScale, 1, 50000);
        if (item.steppedDepth !== undefined) item.steppedDepth = clamp(item.steppedDepth * hScale, 1, 50000);
        if (item.wallId && !walls.has(item.wallId)) snapPart(item, item.at, graph);
      }
    }
  }
  for (const id of walls) syncOpenings(graph, id);
}

function rotatePart(item, from, to, free) {
  if (lengthOf(item.at, to) < 0.001) return false;
  const raw = item.angle + angleOf(item.at, to) - angleOf(item.at, from);
  const angle = free ? raw : 45 * Math.round(raw / 45);
  const difference = ((angle - item.angle) % 360 + 540) % 360 - 180;
  if (Math.abs(difference) < 1e-7) return false;
  detach(item);
  item.angle = (angle % 360 + 360) % 360;
  return true;
}

function resizeFixture(item, corner, from, to, proportional) {
  const [signX, signY] = DIRECTIONS[corner];
  const [dx, dy] = rotate(sub(to, from), -item.angle);
  let w = clamp(item.w + signX * dx, 4, 50000);
  let h = clamp(item.h + signY * dy, 1, 50000);
  if (proportional) {
    const progress = 1 + (signX * item.w * dx + signY * item.h * dy) / (item.w ** 2 + item.h ** 2);
    const scale = clamp(progress, Math.max(4 / item.w, 1 / item.h), Math.min(50000 / item.w, 50000 / item.h));
    w = item.w * scale;
    h = item.h * scale;
  }
  item.at = add(item.at, rotate([signX * (w - item.w) / 2, signY * (h - item.h) / 2], item.angle));
  item.w = w;
  item.h = h;
}

function handleDrag(graph, current, point, proportional) {
  const { handle, ids } = current;
  if (ids.includes('underlay')) {
    const info = graph.underlay;
    const initial = lengthOf(info.at, current.start);
    info.scale = clamp(info.scale * lengthOf(info.at, point) / Math.max(1, initial), 0.01, 50);
    return;
  }
  const chosen = new Set(ids);
  const items = graph.objects.filter(item => chosen.has(item.id));
  const item = items[0];
  if (handle.startsWith('wall-')) {
    const endpoint = handle.at(-1);
    const other = endpoint === 'a' ? item.b : item.a;
    const snapped = snapWallPoint(point, { excluded: chosen, origin: other, free: proportional });
    if (lengthOf(snapped, other) >= 1) item[endpoint] = snapped;
    syncOpenings(graph, item.id);
  } else if (handle === 'rotate-part') {
    current.rotationChanged = rotatePart(item, current.start, point, proportional);
  } else if (handle === 'depth-top' || handle === 'depth-bottom') {
    const side = handle === 'depth-top' ? -1 : 1;
    const [, movement] = rotate(sub(point, current.start), -item.angle);
    item.steppedDepth = clamp(partRotationBox(item).height + 2 * side * movement, 1, 50000);
  } else if (handle.startsWith('fold-triangle-')) {
    const index = Number(handle.slice('fold-triangle-'.length));
    const triangles = foldingTriangleLayout(partVariant(item), item.foldingTriangles);
    const { center, leftWidth, rightWidth } = triangles[index];
    const [dx] = rotate(sub(point, current.start), -item.angle);
    const position = center + dx * (item.flipX ? -1 : 1) / item.w;
    item.foldingTriangles = triangles.map((triangle, i) =>
      i === index ? clamp(position, leftWidth, 1 - rightWidth) : triangle.center);
  } else if (handle.startsWith('part-')) resizeOpening(item, graph, handle, point);
  else if (handle.startsWith('fixture-')) resizeFixture(item, handle.slice(8), current.start, point, proportional);
  else if (handle.startsWith('vertex-')) item.points[Number(handle.slice(7))] = point;
  else resizeGroup(graph, items, handle, current.start, point, proportional);
}

function updateDrag(event, proportional = event.shiftKey) {
  const current = drag;
  current.lastPointer = event;
  const screen = screenPoint(event);
  const movement = sub(screen, current.screen);
  if (!current.moved && lengthOf([0, 0], movement) < 3) return;
  current.moved = true;
  if (current.type === 'pan') {
    view = { ...current.view, x: current.view.x + movement[0], y: current.view.y + movement[1] };
    fitOnResize = false;
    transformView();
    return;
  }
  const point = toWorld(screen);
  if (current.type === 'marquee') {
    current.bounds = polygonBounds([current.start, point]);
    scheduleDraw();
    return;
  }
  const graph = structuredClone(current.before.doc);
  if (current.type === 'move') {
    current.copyIds ??= new Map();
    current.copyWallGroups ??= new Map();
    if (current.duplicate && graph.objects.length + current.ids.length > OBJECT_LIMIT) {
      current.moved = false;
      return;
    }
    moveItems(graph, current, sub(point, current.start));
  } else handleDrag(graph, current, point, proportional);
  state = { ...current.before, doc: graph };
  scheduleDraw();
}

let queuedMove = 0;
let latestMove;
function updateRotationModifier(free) {
  if (drag?.handle !== 'rotate-part') return;
  const event = queuedMove ? latestMove : drag.lastPointer;
  if (!event) return;
  if (queuedMove) {
    cancelAnimationFrame(queuedMove);
    queuedMove = 0;
  }
  updateDrag(event, free);
}

stage.addEventListener('pointermove', event => {
  const kind = placementKind();
  if (drag?.pointer === event.pointerId) {
    latestMove = event;
    if (!queuedMove) queuedMove = requestAnimationFrame(() => {
      queuedMove = 0;
      if (drag?.pointer === latestMove.pointerId) updateDrag(latestMove);
    });
  } else if (tool === 'scissors' && !fileBusy) {
    hover = { cut: wallCutPoint(toWorld(screenPoint(event))) };
    scheduleDraw();
  } else if (kind && !isDividerPart(kind, partDesigns[kind]) && editable(tool) && !fileBusy) {
    draftPart = paletteItemAt(kind, toWorld(screenPoint(event)));
    scheduleDraw();
  } else if (pending.length || ((tool === 'wall' || drawingDivider()) && editable(tool))) {
    updateDraftHover(toWorld(screenPoint(event)), event.shiftKey);
  }
});

stage.addEventListener('pointerleave', () => {
  if (!hover && !draftPart) return;
  hover = null;
  if (!draggedKind) draftPart = null;
  scheduleDraw();
});

function finishMarquee(current, addToSelection) {
  if (!current.bounds) {
    if (current.clicked || (addToSelection && !current.underlay)) return;
    selection.clear();
    if (current.underlay) selection.add('underlay');
    return;
  }

  if (!addToSelection) selection.clear();
  selection.delete('underlay');
  const items = doc().objects;
  const geometry = wallGeometry(doc());
  const groups = groupWalls(items);
  const checkedGroups = new Set();
  for (const item of items) {
    if (checkedGroups.has(item.wallGroup)
      || !objectIntersectsBox(item, current.bounds, geometry.get(item.id)?.segments, geometry.get(item.wallId)?.wall.width)) continue;
    if (item.wallGroup) checkedGroups.add(item.wallGroup);
    for (const member of selectableMembers(item, groups)) selection.add(member.id);
  }
  status(selection.size ? selection.size + '個の図形を選択しました。' : '選択を解除しました。');
}

stage.addEventListener('pointerup', event => {
  if (drag?.pointer !== event.pointerId) return;
  if (queuedMove) {
    cancelAnimationFrame(queuedMove);
    queuedMove = 0;
  }
  const current = drag;
  if (current.moved || lengthOf(screenPoint(event), current.screen) >= 3) updateDrag(event);
  drag = null;
  if (current.type === 'marquee') {
    finishMarquee(current, event.shiftKey);
  } else if (current.type !== 'pan' && current.moved
    && (current.handle !== 'rotate-part' || current.rotationChanged)) {
    record(current.before);
    status(current.duplicate ? '図形を複製しました。' : '図形を更新しました。');
  }
  renderAll();
});
stage.addEventListener('dblclick', event => {
  if (!event.ctrlKey || event.button !== 0 || fileBusy || drag || tool === 'select') return;
  event.preventDefault();
  selectTool('select', { keepSelection: true });
});
stage.addEventListener('pointercancel', cancelDrag);
stage.addEventListener('lostpointercapture', event => {
  if (drag?.pointer === event.pointerId) cancelDrag();
});
stage.addEventListener('wheel', event => {
  event.preventDefault();
  if (!drag) zoom(event.deltaY > 0 ? 1 / 1.12 : 1.12, screenPoint(event));
}, { passive: false });

function removeSelection() {
  const ids = new Set(editableSelection().map(item => item.id));
  const underlay = Boolean(doc().underlay && editable('underlay') && (selection.has('underlay') || tool === 'underlay'));
  if (!ids.size && !underlay) return;
  selection.clear();
  commit(graph => {
    graph.objects = graph.objects.filter(item => !ids.has(item.id));
    for (const item of graph.objects) if (ids.has(item.wallId)) detach(item);
    if (underlay) graph.underlay = null;
  }, '削除しました。', underlay ? null : state.asset);
}

function confirmUnsaved() {
  return !dirty() || window.confirm('未保存の変更があります。この図面を閉じますか？');
}

async function loadFile(file, underlayOnly = false) {
  if (!file || fileBusy || drag) return;
  const project = !underlayOnly && /\.madori$/i.test(file.name);
  if (project && !confirmUnsaved()) return;
  fileBusy = true;
  status('ファイルを読み込み中…');
  try {
    if (project) {
      const loaded = await readProject(file);
      let asset = null;
      if (loaded.underlay) {
        const info = loaded.doc.underlay;
        const raster = await renderUnderlay(loaded.underlay, info.format, info.page);
        if (Math.abs(raster.width - info.naturalWidth) > 0.01 || Math.abs(raster.height - info.naturalHeight) > 0.01) {
          throw new Error('下絵のサイズが制作ファイルの設定と一致しません。');
        }
        asset = rasterAsset(loaded.underlay, raster.count, raster.image);
      }
      reset(loaded.doc, asset);
      status('制作ファイルを開きました。');
      return;
    }

    if (file.size > UNDERLAY_LIMIT) throw new Error('下絵ファイルは50 MBまでです。');
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const format = detectImageFormat(signature) ?? (isPdf ? 'pdf' : null);
    if (!format) throw new Error('PDF、PNG、JPEG、WebP、または .madori ファイルを読み込めます。');
    const previous = doc().underlay;
    if (previous && !window.confirm('現在の下絵を置き換えますか？')) {
      status('下絵の置き換えをキャンセルしました。');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const raster = await renderUnderlay(bytes, format);
    const d = doc();
    const width = previous ? previous.naturalWidth * previous.scale : d.width * 0.86;
    const height = previous ? previous.naturalHeight * previous.scale : d.height * 0.86;
    const info = {
      name: file.name.slice(0, 255), format, page: 1, opacity: previous?.opacity ?? 0.46,
      angle: previous?.angle ?? 0, at: previous?.at ?? [d.width / 2, d.height / 2],
      scale: clamp(Math.min(width / raster.width, height / raster.height), 0.01, 50),
      naturalWidth: raster.width, naturalHeight: raster.height,
    };
    const asset = rasterAsset(bytes, raster.count, raster.image);
    tool = 'underlay';
    contextTool = 'underlay';
    selection.clear();
    selection.add('underlay');
    clearDraft();
    const message = format !== 'pdf' ? '画像を下絵に読み込みました。'
      : raster.count > 1 ? `PDFを読み込みました。右の設定でページを選べます（全${raster.count}ページ）。`
        : 'PDFを下絵に読み込みました。';
    commit(graph => {
      graph.underlay = info;
      Object.assign(graph.layers.find(item => item.id === 'underlay'), { visible: true, locked: false });
    }, message, asset);
    if (!doc().objects.length) fit();
  } catch (error) {
    status(error.message || 'ファイルを読み込めませんでした。', true);
    renderAll();
  } finally {
    fileBusy = false;
    pruneRasterUrls();
  }
}

function rasterAsset(bytes, count, image) {
  const url = URL.createObjectURL(image);
  rasterUrls.add(url);
  return { bytes, count, image, url };
}

async function changePage(page) {
  const source = state.asset;
  const info = doc().underlay;
  if (fileBusy || !source || info?.format !== 'pdf' || page === info.page) return;
  fileBusy = true;
  status('PDFページを読み込み中…');
  try {
    const raster = await renderUnderlay(source.bytes, 'pdf', page);
    const asset = rasterAsset(source.bytes, raster.count, raster.image);
    commit(graph => {
      Object.assign(graph.underlay, { page, naturalWidth: raster.width, naturalHeight: raster.height });
    }, `下絵を${page}ページ目に変更しました。`, asset);
  } catch (error) {
    renderAll();
    status(error.message || 'ページを変更できませんでした。', true);
  } finally {
    fileBusy = false;
  }
}

function save() {
  try {
    const blob = saveProject(doc(), state.asset?.bytes ?? null);
    download(blob, doc().name, 'madori');
    savedRevision = state.revision;
    renderAll();
    status('制作ファイルのダウンロードを開始しました。');
  } catch (error) {
    status(error.message || '制作ファイルを保存できませんでした。', true);
  }
}

function optionsFromForm() {
  const values = exportForm.elements;
  return {
    format: values.format.value, mono: values.mode.value === 'mono',
    margin: clamp(Number(values.margin.value) || 0, 0, 100),
    pixels: clamp(Number(values.pixels.value) || 2000, 240, 6000),
    quality: clamp(Number(values.quality.value) || 92, 10, 100),
    includeUnderlay: values.includeUnderlay.checked && Boolean(state.asset),
    groupLayers: values.format.value === 'svg' && values.groupLayers.checked,
  };
}

async function updatePreview() {
  const serial = ++previewSerial;
  previewSetup = null;
  const options = optionsFromForm();
  const raster = ['jpg', 'png'].includes(options.format);
  $('[data-raster]').hidden = !raster;
  exportForm.elements.pixels.disabled = !raster;
  $('[data-jpeg]').hidden = options.format !== 'jpg';
  exportForm.elements.quality.disabled = options.format !== 'jpg';
  exportForm.elements.includeUnderlay.disabled = !state.asset;
  $('[data-svg-grouping]').hidden = options.format !== 'svg';
  exportForm.elements.groupLayers.disabled = options.format !== 'svg';
  const button = exportForm.querySelector('[type="submit"]');
  button.disabled = true;
  const preview = $('#export-preview');
  const output = $('#export-status');
  output.textContent = 'プレビューを生成中…';
  try {
    const graph = structuredClone(doc());
    if (options.includeUnderlay) graph.layers.find(item => item.id === 'underlay').visible = true;
    const result = await exportSetup(graph, options, state.asset?.image, $('#measure'));
    if (serial !== previewSerial) return;
    preview.innerHTML = svgDocument(result.drawing, result.box);
    previewSetup = result;
    output.textContent = '';
    button.disabled = false;
  } catch (error) {
    if (serial !== previewSerial) return;
    preview.replaceChildren();
    output.textContent = error.message || '図面を表示できませんでした。';
  }
}

exportForm.addEventListener('change', updatePreview);
exportForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!previewSetup) return;
  const options = optionsFromForm();
  const button = exportForm.querySelector('[type="submit"]');
  const output = $('#export-status');
  button.disabled = true;
  output.textContent = 'ファイルを生成中…';
  try {
    const blob = await makeExport(previewSetup, options);
    download(blob, doc().name, options.format);
    exportDialog.close();
    status(options.format.toUpperCase().replace('JPG', 'JPEG') + 'を書き出しました。');
  } catch (error) {
    output.textContent = error.message || '書き出しに失敗しました。';
  } finally {
    button.disabled = false;
  }
});

partDesignMenu.addEventListener('toggle', event => {
  const anchor = $(`[data-design-kind="${partDesignMenu.dataset.kind}"]`);
  const open = event.newState === 'open';
  anchor?.setAttribute('aria-expanded', open);
  if (!open || !anchor) return;
  const bounds = anchor.getBoundingClientRect();
  partDesignMenu.style.left = clamp(bounds.left, 8, window.innerWidth - partDesignMenu.offsetWidth - 8) + 'px';
  partDesignMenu.style.top = clamp(bounds.bottom + 6, 8, window.innerHeight - partDesignMenu.offsetHeight - 8) + 'px';
  partDesignMenu.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
});

function runAction(action, source) {
  if (action === 'close-dialog') {
    source.closest('dialog').close();
    return;
  }
  if (fileBusy || drag) return;
  if (action === 'new') {
    if (confirmUnsaved()) {
      reset(blank(), null);
      status('新規図面を作成しました。');
    }
  } else if (action === 'open') $('#open-input').click();
  else if (action === 'import') $('#underlay-input').click();
  else if (action === 'save') save();
  else if (action === 'export') {
    exportForm.elements.includeUnderlay.checked = false;
    exportDialog.showModal();
    updatePreview();
  } else if (action === 'undo') {
    if (canUndoFloorVertex()) {
      pending.pop();
      if (hover) updateDraftHover(hover.point, hover.free);
      else scheduleDraw();
      renderEditStatus();
      status('床の角を一つ戻しました。');
    } else restore(undoStack, redoStack, '元に戻しました。');
  } else if (action === 'redo') restore(redoStack, undoStack, 'やり直しました。');
  else if (action === 'delete') removeSelection();
  else if (action === 'fit') fit();
  else if (action === 'zoom-in') zoom(1.25);
  else if (action === 'zoom-out') zoom(1 / 1.25);
  else if (action === 'help') $('#help-dialog').showModal();
  else if (action === 'wall-line') selectTool('wall');
  else if (action === 'wall-cut') selectTool('scissors');
  else if (action === 'part-designs') {
    if (!partDesignMenu.matches(':popover-open')) {
      const kind = source.dataset.designKind;
      partDesignMenu.dataset.kind = kind;
      partDesignMenu.setAttribute('aria-label', (kind === 'kitchen' ? 'コンロ' : parts[kind].name) + 'のデザイン');
      partDesignMenu.innerHTML = partDesignChoices(kind, partDesigns[kind === 'kitchen' ? 'stove' : kind]);
    }
  }
  else if (['flip-x', 'flip-y'].includes(action)) {
    const item = selectedObjects()[0];
    if (!item?.kind || !canEditItem(item)) return;
    commit(graph => {
      const target = graph.objects.find(object => object.id === item.id);
      if (action === 'flip-x') target.flipX = !target.flipX;
      else target.flipY = !target.flipY;
    }, 'パーツの向きを変更しました。');
  }
}
document.addEventListener('click', event => {
  const source = event.target.closest('button');
  if (!source) return;
  if (source.dataset.action) runAction(source.dataset.action, source);
  else if (fileBusy || drag) return;
  else if (source.dataset.partDesign) {
    const kind = partDesignMenu.dataset.kind;
    clearDraft();
    partDesigns[kind] = source.dataset.partDesign;
    if (kind === 'kitchen') partDesigns.stove = source.dataset.partDesign;
    activeParts[parts[kind].layer] = kind;
    partDesignMenu.hidePopover();
    if (tool !== contextTool) selectTool(contextTool);
    else {
      renderContext();
      scheduleDraw();
      stage.focus({ preventScroll: true });
    }
  } else if (source.dataset.tool) {
    selectTool(source.dataset.tool);
    if (tool === 'underlay' && doc().underlay && editable('underlay')) {
      selection.add('underlay');
      renderAll();
    }
  } else if (source.dataset.part || Object.hasOwn(source.dataset, 'roomLabel')) {
    if (drawingDivider()) clearDraft();
    if (tool !== contextTool) selectTool(contextTool);
    if (source.dataset.part === 'column') {
      columnPlacement = true;
      clearDraft();
    } else if (source.dataset.part) {
      activeParts[parts[source.dataset.part].layer] = source.dataset.part;
      if (source.dataset.variant) partDesigns[source.dataset.part] = source.dataset.variant;
    }
    else activeRoomLabel = source.dataset.roomLabel;
    draftPart = null;
    scheduleDraw();
    renderContext();
    stage.focus({ preventScroll: true });
  } else if (source.dataset.toggle) {
    const id = source.dataset.layer;
    const key = source.dataset.toggle;
    clearDraft();
    for (const selected of selection) if (selected === id || itemBy(selected)?.layer === id) selection.delete(selected);
    commit(graph => { const target = graph.layers.find(item => item.id === id); target[key] = !target[key]; }, names(id) + 'レイヤーの設定を変更しました。');
  }
});

function fieldValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type !== 'number') return input.value;
  return Number.isFinite(input.valueAsNumber) ? clamp(input.valueAsNumber, Number(input.min), Number(input.max)) : null;
}

function modifyObject(id, key, value) {
  const changesRoomArea = key === 'roomArea' || key === 'roomApproximate';
  let refresh = renderAll;
  if (key === 'value') refresh = renderTextEdit;
  else if (changesRoomArea) refresh = () => renderTextEdit(true);
  commit(graph => {
    const target = graph.objects.find(item => item.id === id);
    if (key === 'room') Object.assign(target, { room: value, fill: roomColors[value].color ?? target.fill });
    else if (key === 'fill') Object.assign(target, { room: 'custom', fill: value });
    else if (key === 'tatami') target.tatami = Number(value);
    else if (changesRoomArea) {
      const room = readRoomLabel(target.value);
      if (!room) return false;
      if (key === 'roomArea') room.count = Number(value.toFixed(2));
      else room.approximate = value;
      target.value = roomLabelText(room.name, room.count, room.approximate);
    } else if (key === 'triangleCount') {
      target.foldingTriangles = foldingTrianglePositions(partVariant(target), target.foldingTriangles, Math.round(value));
    } else if (key === 'variant' && (target.layer === 'fixture' || target.kind === 'folding')) {
      const [previousWidth, previousHeight] = partSize(target.kind, partVariant(target));
      const [newWidth, newHeight] = partSize(target.kind, value);
      target.w = clamp(target.w * newWidth / previousWidth, 4, 50000);
      target.h = clamp(target.h * newHeight / previousHeight, 1, 50000);
      target.variant = value;
      if (target.kind === 'folding') delete target.foldingTriangles;
      if (!hasAdjustableRadius(target.kind, value)) delete target.cornerRadius;
    } else if (key === 'variant' && target.kind === 'sliding') {
      target.variant = value;
      if (!isSteppedSliding(target.kind, value)) delete target.steppedDepth;
    } else if (key === 'w' && target.layer === 'opening') {
      const wall = graph.objects.find(object => object.id === target.wallId);
      if (wall) value = Math.min(value, lengthOf(wall.a, wall.b));
      target.h = clamp(target.h * value / target.w, 1, 50000);
      target.w = value;
      if (wall) positionOpening(target, wall, target.t);
    } else target[key] = value;
  }, undefined, state.asset, refresh);
}

for (const eventName of ['input', 'focusin', 'focusout', 'select']) {
  inspector.addEventListener(eventName, event => {
    if (event.target.matches(TEXT_INPUT)) scheduleDraw();
  });
}
function redrawTextCaret() {
  if (document.activeElement?.matches(TEXT_INPUT)) scheduleDraw();
}
document.addEventListener('selectionchange', redrawTextCaret);
document.fonts.addEventListener('loadingdone', redrawTextCaret);

document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'open-input' || input.id === 'underlay-input') {
    const file = input.files?.[0];
    input.value = '';
    loadFile(file, input.id === 'underlay-input');
    return;
  }
  if (fileBusy || drag) return;
  if (input.id === 'project-name') {
    const name = input.value.trim() || '無題の間取り';
    if (doc().name !== name) commit(graph => { graph.name = name; });
    return;
  }
  if (!input.dataset.field) return;
  const value = fieldValue(input);
  if (value === null) {
    renderAll();
    return;
  }
  const [group, key] = input.dataset.field.split('-');
  if (group === 'default') {
    defaults[key] = key === 'tatami' ? Number(value) : value;
    if (key === 'room') defaults.color = roomColors[value].color ?? defaults.color;
    if (key === 'color') defaults.room = 'custom';
    renderContext();
    scheduleDraw();
  } else if (group === 'selected' && (key === 'wallWidth' || key === 'wallDashed')) {
    const walls = new Set(editableSelection().filter(isWallSegment).map(item => item.id));
    const property = key === 'wallWidth' ? 'width' : 'dashed';
    if (walls.size) commit(graph => {
      for (const item of graph.objects) if (walls.has(item.id)) item[property] = value;
    }, key === 'wallWidth' ? '選択した壁の太さを変更しました。' : '選択した壁の線種を変更しました。');
  } else if (group === 'object') {
    const item = key === 'value' ? itemBy(input.dataset.objectId) : selectedObjects()[0];
    if (item && canEditItem(item)) modifyObject(item.id, key, value);
  } else if (group === 'underlay' && doc().underlay && editable('underlay')) {
    if (key === 'page') {
      changePage(Math.round(value));
      return;
    }
    commit(graph => {
      const info = graph.underlay;
      if (key === 'x' || key === 'y') info.at[key === 'x' ? 0 : 1] = value;
      else info[key] = ['opacity', 'scale'].includes(key) ? value / 100 : value;
    });
  }
});

const partMime = 'application/x-madorikun-part';
const partVariantMime = 'application/x-madorikun-part-variant';
let draggedKind = '';
let draggedVariant;
context.addEventListener('dragstart', event => {
  const button = event.target.closest('[data-part], [data-room-label][draggable="true"]');
  const kind = button?.dataset.part ?? button?.dataset.roomLabel;
  const layer = Object.hasOwn(ROOM_LABELS, kind) ? 'text' : parts[kind]?.layer;
  if (!layer || fileBusy || !editable(layer)) {
    event.preventDefault();
    return;
  }
  draggedKind = kind;
  draggedVariant = button.dataset.variant;
  event.dataTransfer.setData(partMime, draggedKind);
  if (draggedVariant) event.dataTransfer.setData(partVariantMime, draggedVariant);
  event.dataTransfer.effectAllowed = 'copy';
});
document.addEventListener('dragend', () => {
  draggedKind = '';
  draggedVariant = undefined;
  draftPart = null;
  $('#drag-note').hidden = true;
  scheduleDraw();
});
area.addEventListener('dragover', event => {
  const types = [...event.dataTransfer.types];
  if (!types.includes(partMime) && !types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  if (types.includes('Files')) $('#drag-note').hidden = false;
  else if (draggedKind && !isDividerPart(draggedKind, draggedVariant ?? partDesigns[draggedKind])) {
    const point = toWorld(screenPoint(event));
    draftPart = paletteItemAt(draggedKind, point, draggedVariant);
    scheduleDraw();
  }
});
area.addEventListener('dragleave', event => {
  if (area.contains(event.relatedTarget)) return;
  $('#drag-note').hidden = true;
  draftPart = null;
  scheduleDraw();
});
area.addEventListener('drop', event => {
  event.preventDefault();
  $('#drag-note').hidden = true;
  draftPart = null;
  scheduleDraw();
  const kind = event.dataTransfer.getData(partMime);
  if (kind && !fileBusy && !drag) {
    const variant = event.dataTransfer.getData(partVariantMime);
    if (kind === 'kitchen' && variant && Object.hasOwn(PART_DESIGNS.kitchen.choices, variant) && variant !== 'counter') {
      activeParts.fixture = kind;
      partDesigns.kitchen = variant;
    }
    if (isDividerPart(kind, partDesigns[kind])) {
      if (!editable('fixture')) return;
      activeParts.fixture = kind;
      selectTool('fixture');
    }
    stage.focus({ preventScroll: true });
    placePaletteItem(kind, toWorld(screenPoint(event)));
  } else if (event.dataTransfer.files.length) loadFile(event.dataTransfer.files[0]);
});
window.addEventListener('dragover', event => {
  if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
});
window.addEventListener('drop', event => {
  if (event.dataTransfer.files.length) event.preventDefault();
});

window.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')) return;
  if (event.target.closest('input, textarea, select, [contenteditable], #part-designs')) return;
  const key = event.key.toLowerCase();
  if (key === 'control' && !fileBusy) setTemporarySelection(true);
  if (event.ctrlKey && !event.altKey) {
    if (key === '0' || event.code === 'Numpad0') {
      event.preventDefault();
      if (!drag) fit();
    } else if (key === '-' || key === '−' || event.code === 'NumpadSubtract') {
      event.preventDefault();
      if (!drag) zoom(1 / 1.25);
    } else if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) runAction('redo');
      else runAction('undo');
    } else if (key === 'y') {
      event.preventDefault();
      runAction('redo');
    } else if (key === 's') {
      event.preventDefault();
      runAction('save');
    }
    return;
  }
  if (event.altKey || fileBusy) return;
  if (key === 'shift') {
    updateRotationModifier(true);
    if (hover) {
      hover.free = true;
      scheduleDraw();
    }
  } else if (key === 'z') selectTool('zoom');
  else if (key === 'v') selectTool('select');
  else if (event.code === 'Space' && event.target === stage) {
    event.preventDefault();
    space = true;
    stage.classList.add('is-panning');
  } else if (key === 'escape') {
    if (drag) cancelDrag();
    clearDraft();
    selection.clear();
    renderAll();
  } else if (key === 'delete' && !drag) removeSelection();
  else if (key === 'enter' && event.target === stage && ['floor', 'color'].includes(tool)) finishPolygon(event.shiftKey);
});

function stopSpace() {
  space = false;
  stage.classList.toggle('is-panning', drag?.type === 'pan');
}
function releaseFreeAngle() {
  if (!hover?.free) return;
  hover.free = false;
  scheduleDraw();
}
window.addEventListener('keyup', event => {
  if (event.code === 'Space') stopSpace();
  if (event.key === 'Control' && !event.ctrlKey) setTemporarySelection(false);
  if (event.key === 'Shift' && !event.shiftKey) {
    updateRotationModifier(false);
    releaseFreeAngle();
  }
});
window.addEventListener('blur', () => {
  stopSpace();
  setTemporarySelection(false);
  releaseFreeAngle();
});
window.addEventListener('beforeunload', event => {
  if (!dirty()) return;
  event.preventDefault();
  event.returnValue = true;
});
new ResizeObserver(() => { if (fitOnResize) fit(); }).observe(stage);

renderAll();
fit();
