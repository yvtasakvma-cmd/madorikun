import './style.css';
import fontUrl from '../assets/NotoSansJP-Regular.ttf?url';
import {
  add, alignFinalCorner, blank, clamp, detach, floors, isDrawingAngle, layers, lengthOf, makePart, OBJECT_LIMIT, parts, positionOpening, roomColors,
  projectOnWall, rotate, snapClosingCorner, snapDrawingAngle, sub, syncOpenings, uid, wallDirection,
} from './model.js';
import { escapeHtml, objectBounds, polygonBounds, renderScene, rotatedBounds, svgDocument } from './scene.js';
import {
  detectImageFormat, download, exportSetup, makeExport, readProject, renderUnderlay, saveProject, UNDERLAY_LIMIT,
} from './files.js';
import {
  colorField, floorChoices, icon, importButton, layout, numberField, partPalette,
  propertyMarkup, removeButton, roomChoices, selectField, tools,
} from './ui.js';

document.fonts.add(new FontFace('Madori Drawing', `url("${fontUrl}")`));
document.querySelector('#app').innerHTML = layout();
const $ = selector => document.querySelector(selector);
const stage = $('#stage');
const area = $('#canvas-area');
const world = $('#world');
const scene = $('#scene');
const overlay = $('#overlay');
const context = $('#context-bar');
const inspector = $('#inspector');
const exportForm = $('#export-form');
const exportDialog = $('#export-dialog');

let state = { doc: blank(), asset: null, revision: 0 };
let nextRevision = 0;
let savedRevision = 0;
const undoStack = [];
const redoStack = [];
let tool = 'select';
const selection = new Set();
let defaults = { width: 8, preset: 'wood', room: 'western', color: roomColors.western.color, direction: 'vertical', tatami: 6, spacing: 12, size: 18 };
let activeParts = { opening: 'swing', fixture: 'bath' };
let pending = [];
let wallChain = null;
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
const HANDLES = ['nw', 'ne', 'se', 'sw'];
const DIRECTIONS = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
const HISTORY_LIMIT = 60;

const doc = () => state.doc;
const layer = id => doc().layers.find(item => item.id === id);
const itemBy = id => doc().objects.find(item => item.id === id);
const names = id => layers.find(item => item.id === id)?.name ?? '';
const dirty = () => state.revision !== savedRevision;
const selectedObjects = () => doc().objects.filter(item => selection.has(item.id));
const editable = id => layer(id)?.visible && !layer(id).locked;

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

function commit(edit, message, asset = state.asset) {
  const previous = state;
  const copy = structuredClone(doc());
  if (edit(copy) === false) return false;
  state = { doc: copy, asset, revision: previous.revision };
  record(previous);
  renderAll();
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
  pruneRasterUrls();
  renderAll();
  fit();
}

function clearDraft() {
  pending = [];
  wallChain = null;
  hover = null;
  draftPart = null;
}

function selectTool(next) {
  if (drag) cancelDrag();
  tool = next;
  clearDraft();
  selection.clear();
  stage.focus({ preventScroll: true });
  renderAll();
}

function fieldInstructions() {
  const label = {
    select: '空いている所からドラッグで複数選択 · 図形をドラッグで移動',
    wall: 'クリックで続けて描く · 終点を再クリックかCtrl＋クリックで終了 · Shiftで自由な角度',
    floor: '角をクリックして囲む · Shiftで角度を自由に',
    color: '角をクリックして囲む · Shiftで角度を自由に',
    text: '配置する場所をクリック',
    zoom: 'クリックで拡大 · Ctrl＋0で全体表示',
  }[tool];
  return label ? `<span class="context-hint">${label}</span>` : '';
}

function renderContext() {
  const title = tools.find(item => item.id === tool).name;
  let controls = '';
  if (tool === 'wall') controls = numberField('太さ', 'default-width', defaults.width, 1, 80);
  if (tool === 'floor') {
    const { pattern } = floors[defaults.preset];
    controls = selectField('種類', 'default-preset', defaults.preset, floorChoices());
    if (pattern) controls += selectField('向き', 'default-direction', defaults.direction, [['vertical', '縦'], ['horizontal', '横']]);
    if (pattern === 'boards') controls += numberField('板の間隔', 'default-spacing', defaults.spacing, 3, 150);
    if (pattern === 'tatami') controls += selectField('畳の枚数', 'default-tatami', String(defaults.tatami), [['4', '4枚'], ['6', '6枚'], ['8', '8枚']]);
  }
  if (tool === 'color') controls = selectField('部屋の種別', 'default-room', defaults.room, roomChoices())
    + colorField('default-color', defaults.color);
  if (tool === 'text') controls = numberField('サイズ', 'default-size', defaults.size, 4, 300);
  if (tool === 'opening' || tool === 'fixture') controls = partPalette(tool, activeParts[tool])
    + (tool === 'opening'
      ? '<span class="context-hint">パーツを選び、キャンバスをクリックして配置</span>'
      : '<span class="context-hint">パーツをキャンバスへドラッグ</span>');
  if (tool === 'underlay') controls = importButton() + (doc().underlay
    ? `<span class="context-hint underlay-name" title="${escapeHtml(doc().underlay.name)}">${escapeHtml(doc().underlay.name)}</span>`
    : '<span class="context-hint">PDF・PNG・JPEG・WebPをキャンバスへドロップできます</span>');
  context.innerHTML = `<strong class="context-label">${title}</strong>${controls}${fieldInstructions()}`;
}

function renderLayers() {
  $('#layer-list').innerHTML = [...doc().layers].reverse().map(item => {
    const details = layers.find(entry => entry.id === item.id);
    const count = item.id === 'underlay' ? Number(Boolean(doc().underlay)) : doc().objects.filter(object => object.layer === item.id).length;
    const active = tool === item.id || [...selection].some(id => id === 'underlay' ? item.id === id : itemBy(id)?.layer === item.id);
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
    inspector.innerHTML = `<p class="inspector-placeholder">${items.length}個の図形を選択中</p>${removeButton()}`;
  } else {
    inspector.innerHTML = '<p class="inspector-placeholder">図形を選ぶと、ここに設定が表示されます。</p>';
  }
}

function renderControls() {
  for (const button of document.querySelectorAll('.tool')) button.setAttribute('aria-pressed', button.dataset.tool === tool);
  stage.dataset.tool = temporarySelection ? 'select' : tool;
  stage.classList.toggle('is-panning', drag?.type === 'pan' || space);
  $('#project-name').value = doc().name;
  $('#dirty-dot').hidden = !dirty();
  $('[data-action="undo"]').disabled = !undoStack.length;
  $('[data-action="redo"]').disabled = !redoStack.length;
  $('#object-count').textContent = doc().objects.length + ' 個の図形';
  $('#empty-note').hidden = Boolean(doc().objects.length || doc().underlay || tool !== 'select');
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
  const bounds = d.objects.map(objectBounds);
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
  return polygonBounds(items.flatMap(item => corners(objectBounds(item))));
}

function handlesMarkup(items) {
  if (!items.length && !selection.has('underlay')) return '';
  const radius = 4.8 / view.scale;
  const stroke = 1.25 / view.scale;
  const edge = (a, b, c = 'none') =>
    `<path pointer-events="none" d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke-dasharray="${c}"/>`;
  const handle = (point, id) => `<circle class="drag-handle" data-handle="${id}" cx="${point[0]}" cy="${point[1]}" r="${radius}" fill="#ffffff"/>`;
  let draw = '';
  if (selection.has('underlay') && doc().underlay && editable('underlay')) {
    const { at, scale, naturalWidth, naturalHeight, angle } = doc().underlay;
    const box = rotatedBounds(at, naturalWidth * scale, naturalHeight * scale, angle);
    const points = corners(box);
    draw = points.map((point, i) => edge(point, points[(i + 1) % 4], `${4 / view.scale} ${3 / view.scale}`)).join('')
      + points.map((point, i) => handle(point, HANDLES[i])).join('');
  } else if (items.length === 1 && items[0].layer === 'wall') {
    const item = items[0];
    draw = edge(item.a, item.b) + handle(item.a, 'wall-a') + handle(item.b, 'wall-b');
  } else if (items.length === 1 && items[0].layer === 'opening') {
    const item = items[0];
    const left = add(item.at, rotate([-item.w / 2, 0], item.angle));
    const right = add(item.at, rotate([item.w / 2, 0], item.angle));
    draw = edge(left, right) + handle(left, 'part-left') + handle(right, 'part-right');
  } else if (items.length) {
    const points = corners(boundsOf(items));
    draw = points.map((point, i) => edge(point, points[(i + 1) % 4], `${4 / view.scale} ${3 / view.scale}`)).join('')
      + points.map((point, i) => handle(point, HANDLES[i])).join('');
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
  if (pending.length && !temporarySelection) {
    const closing = hover?.atStart ? polygonForClosure(hover.free) : null;
    const vertices = closing ?? (wall ? [wall.start] : pending);
    const points = hover ? [...vertices, wall?.end ?? (closing ? vertices[0] : drawingPoint(hover.point, hover.free))] : vertices;
    markup += `<polyline points="${points.map(point => point.join(',')).join(' ')}"
      fill="${tool === 'color' ? defaults.color : 'none'}" fill-opacity=".35" stroke="#23876d"
      stroke-width="${tool === 'wall' ? defaults.width : 1.6 / view.scale}" opacity=".8"/>`;
    for (const [x, y] of vertices) markup += `<circle cx="${x}" cy="${y}" r="${4 / view.scale}" fill="#20765f"/>`;
    if (closing) markup += snapMarker(vertices[0], 'closing-target');
    if (wall?.target) markup += snapMarker(wall.target, 'wall-snap-target');
  } else if (!temporarySelection && tool === 'wall' && hover?.wallTarget) {
    markup += snapMarker(hover.wallTarget, 'wall-snap-target');
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
    const pointerEvents = locked.has(layerId) || (tool === 'underlay' && layerId !== 'underlay') ? 'none' : '';
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

function draw() {
  drawFrame = 0;
  stage.classList.toggle('part-placement-cursor',
    tool === 'opening' && draftPart?.layer === 'opening' && !temporarySelection && !drag && !draggedKind);
  const wall = !temporarySelection && tool === 'wall' && pending.length && hover
    ? wallDraft(hover.point, hover.free, hover.wallTarget) : null;
  let graph = doc();
  if (wall?.adjustment) {
    const { id } = wall.adjustment;
    graph = { ...graph, objects: graph.objects.map(item => item.id === id || item.wallId === id ? { ...item } : item) };
    applyWallAdjustment(graph, wall.adjustment);
  }
  $('#paper').setAttribute('width', graph.width);
  $('#paper').setAttribute('height', graph.height);
  updateScene(graph);
  overlay.innerHTML = draftMarkup(wall) + (drag?.type === 'marquee' && drag.bounds
    ? marqueeMarkup(drag) : handlesMarkup(graph.objects.filter(item => selection.has(item.id))));
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
  return item.layer !== 'wall' || !layer('opening').locked || !doc().objects.some(part => part.wallId === item.id);
}

function nearestWallEndpoint(point, { radius, excluded, accepts }) {
  if (!layer('wall').visible) return null;
  let nearest = null;
  let best = radius / view.scale;
  for (const item of doc().objects) {
    if (item.layer !== 'wall' || excluded?.has(item.id)) continue;
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
    if (wall.layer !== 'wall' || wallDirection(wall) !== 1 - axis) continue;
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

function snapPart(part, point, graph, excluded = new Set()) {
  part.at = point;
  if (part.layer !== 'opening') return;
  detach(part);
  let best = 13 / view.scale;
  let target;
  if (graph.layers.find(item => item.id === 'wall').visible) {
    for (const wall of graph.objects) {
      if (wall.layer !== 'wall' || excluded.has(wall.id) || lengthOf(wall.a, wall.b) < part.w) continue;
      const result = projectOnWall(point, wall);
      if (result.distance < best) {
        best = result.distance;
        target = { wall, t: result.t };
      }
    }
  }
  if (target) positionOpening(part, target.wall, target.t);
}

function addItem(item, message, adjustment) {
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
    if (adjustment) applyWallAdjustment(d, adjustment);
    d.objects.push(item);
  }, message);
}

function partAt(kind, point) {
  const part = makePart(kind, point);
  snapPart(part, point, doc());
  return part;
}

function placePart(kind, point) {
  if (!Object.hasOwn(parts, kind)) return;
  const part = partAt(kind, point);
  if (addItem(part, parts[kind].name + 'を配置しました。') && part.layer === 'opening') {
    tool = 'select';
    clearDraft();
    renderAll();
  }
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
  if (!editable(tool)) {
    status('「' + names(tool) + '」レイヤーの表示とロックを確認してください。', true);
    return;
  }
  if (tool === 'wall') {
    if (!pending.length) {
      const target = wallSnapTarget(point, hover?.wallTarget);
      pending = [target ? [...target] : point];
      wallChain = { first: pending[0] };
      hover = null;
    } else if (wallChain.lastClick && Math.min(lengthOf(point, pending[0]), lengthOf(point, wallChain.lastClick)) * view.scale <= 6) {
      finishWallChain();
      updateDraftHover(point, event.shiftKey);
    } else {
      const { start, end, adjustment } = wallDraft(point, event.shiftKey, hover?.wallTarget);
      const wall = { id: uid(), layer: 'wall', a: start, b: end, width: defaults.width };
      if (lengthOf(start, end) >= 1 && addItem(wall, '壁を追加しました。', adjustment)) {
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
      }
    }
  } else if (tool === 'text') {
    addItem({ id: uid(), layer: 'text', at: point, value: '部屋名', size: defaults.size, angle: 0 }, '文字を追加しました。');
    inspector.querySelector('textarea')?.select();
  } else if (tool === 'opening' || tool === 'fixture') {
    placePart(activeParts[tool], point);
  }
  scheduleDraw();
}

function finishWallChain() {
  clearDraft();
  scheduleDraw();
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
  if (fileBusy || event.button > 1) return;
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
  const handle = !endedWall && ['select', 'underlay', 'opening', 'fixture'].includes(pointerTool)
    ? event.target.closest('[data-handle]')?.dataset.handle : null;
  const hit = event.target.closest('[data-id]')?.dataset.id;
  if (handle) {
    const items = selectedObjects();
    if (items.every(canEditItem)) beginDrag(event, 'handle', { handle, ids: [...selection] });
    return;
  }
  if (pointerTool === 'underlay' || pointerTool === 'select') {
    const clicked = itemBy(hit);
    if (pointerTool === 'select' && (!clicked || !canEditItem(clicked))) {
      beginDrag(event, 'marquee', { clicked, underlay: hit === 'underlay' && editable('underlay') });
      return;
    }
    if (hit === 'underlay' && !editable('underlay')) return;
    if (clicked && (!canEditItem(clicked) || pointerTool === 'underlay')) return;
    if (!event.shiftKey && (!hit || !selection.has(hit))) selection.clear();
    if (hit && event.shiftKey && selection.has(hit)) selection.delete(hit);
    else if (hit) {
      if (hit === 'underlay') selection.clear();
      else selection.delete('underlay');
      selection.add(hit);
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
      if (item.wallId) {
        if (chosen.has(item.wallId)) item.wallId = current.copyIds.get(item.wallId);
        else detach(item);
      }
      return item;
    });
    copy.objects.push(...items);
  }
  const movedWalls = new Set(items.filter(item => item.layer === 'wall').map(item => item.id));
  for (const item of items) {
    if (item.a) {
      item.a = add(item.a, delta);
      item.b = add(item.b, delta);
    } else if (item.points) {
      item.points = item.points.map(point => add(point, delta));
    } else if (item.layer === 'opening') {
      if (!movedWalls.has(item.wallId)) snapPart(item, add(item.at, delta), copy, movedWalls);
    } else item.at = add(item.at, delta);
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

function resizeGroup(graph, items, handle, to, proportional) {
  const box = boundsOf(items);
  const [signX, signY] = DIRECTIONS[handle];
  const anchor = [box.x + (signX < 0 ? box.width : 0), box.y + (signY < 0 ? box.height : 0)];
  const [dx, dy] = sub(to, anchor);
  let sx = box.width > 0.01 ? clamp(signX * dx / box.width, 0.03, 30) : 1;
  let sy = box.height > 0.01 ? clamp(signY * dy / box.height, 0.03, 30) : 1;
  if (proportional) sx = sy = box.width >= box.height ? sx : sy;
  const scalePoint = p => [anchor[0] + (p[0] - anchor[0]) * sx, anchor[1] + (p[1] - anchor[1]) * sy];
  const walls = new Set(items.filter(item => item.layer === 'wall').map(item => item.id));
  for (const item of items) {
    if (item.a) {
      const a = scalePoint(item.a);
      const b = scalePoint(item.b);
      if (lengthOf(a, b) >= 1) Object.assign(item, { a, b, width: clamp(item.width * Math.min(sx, sy), 1, 80) });
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
        if (item.wallId && !walls.has(item.wallId)) snapPart(item, item.at, graph);
      }
    }
  }
  for (const id of walls) syncOpenings(graph, id);
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
  } else if (handle.startsWith('part-')) resizeOpening(item, graph, handle, point);
  else if (handle.startsWith('vertex-')) item.points[Number(handle.slice(7))] = point;
  else resizeGroup(graph, items, handle, point, proportional);
}

function updateDrag(event) {
  const current = drag;
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
    if (current.duplicate && graph.objects.length + current.ids.length > OBJECT_LIMIT) {
      current.moved = false;
      return;
    }
    moveItems(graph, current, sub(point, current.start));
  } else handleDrag(graph, current, point, event.shiftKey);
  state = { ...current.before, doc: graph };
  scheduleDraw();
}

let queuedMove = 0;
let latestMove;
stage.addEventListener('pointermove', event => {
  if (drag?.pointer === event.pointerId) {
    latestMove = event;
    if (!queuedMove) queuedMove = requestAnimationFrame(() => {
      queuedMove = 0;
      if (drag?.pointer === latestMove.pointerId) updateDrag(latestMove);
    });
  } else if (tool === 'opening' && editable('opening') && !fileBusy) {
    draftPart = partAt(activeParts.opening, toWorld(screenPoint(event)));
    scheduleDraw();
  } else if (pending.length || (tool === 'wall' && editable('wall'))) {
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
  const { x, y, width, height } = current.bounds;
  for (const item of doc().objects) {
    if (!canEditItem(item)) continue;
    const box = objectBounds(item);
    if (box.x >= x && box.y >= y && box.x + box.width <= x + width && box.y + box.height <= y + height) {
      selection.add(item.id);
    }
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
  } else if (current.type !== 'pan' && current.moved) {
    record(current.before);
    status(current.duplicate ? '図形を複製しました。' : '図形を更新しました。');
  }
  renderAll();
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
  const ids = new Set(selectedObjects().filter(canEditItem).map(item => item.id));
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
  } else if (action === 'undo') restore(undoStack, redoStack, '元に戻しました。');
  else if (action === 'redo') restore(redoStack, undoStack, 'やり直しました。');
  else if (action === 'delete') removeSelection();
  else if (action === 'fit') fit();
  else if (action === 'zoom-in') zoom(1.25);
  else if (action === 'zoom-out') zoom(1 / 1.25);
  else if (action === 'help') $('#help-dialog').showModal();
  else if (['flip-x', 'flip-y', 'rotate'].includes(action)) {
    const item = selectedObjects()[0];
    if (!item?.kind || !canEditItem(item)) return;
    commit(graph => {
      const target = graph.objects.find(object => object.id === item.id);
      if (action === 'flip-x') target.flipX = !target.flipX;
      else if (action === 'flip-y') target.flipY = !target.flipY;
      else if (!target.wallId) target.angle = (target.angle + 90) % 360;
    }, 'パーツの向きを変更しました。');
  }
}
document.addEventListener('click', event => {
  const source = event.target.closest('button');
  if (!source) return;
  if (source.dataset.action) runAction(source.dataset.action, source);
  else if (fileBusy || drag) return;
  else if (source.dataset.tool) {
    selectTool(source.dataset.tool);
    if (tool === 'underlay' && doc().underlay && editable('underlay')) {
      selection.add('underlay');
      renderAll();
    }
  } else if (source.dataset.part) {
    activeParts[parts[source.dataset.part].layer] = source.dataset.part;
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
  if (input.type !== 'number') return input.value;
  return Number.isFinite(input.valueAsNumber) ? clamp(input.valueAsNumber, Number(input.min), Number(input.max)) : null;
}

function modifyObject(id, key, value) {
  commit(graph => {
    const target = graph.objects.find(item => item.id === id);
    if (key === 'room') Object.assign(target, { room: value, fill: roomColors[value].color ?? target.fill });
    else if (key === 'fill') Object.assign(target, { room: 'custom', fill: value });
    else if (key === 'tatami') target.tatami = Number(value);
    else if (key === 'w' && target.layer === 'opening') {
      const wall = graph.objects.find(object => object.id === target.wallId);
      if (wall) value = Math.min(value, lengthOf(wall.a, wall.b));
      target.h = clamp(target.h * value / target.w, 1, 50000);
      target.w = value;
      if (wall) positionOpening(target, wall, target.t);
    } else target[key] = value;
  });
}

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
  } else if (group === 'object') {
    const item = selectedObjects()[0];
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
let draggedKind = '';
context.addEventListener('dragstart', event => {
  const button = event.target.closest('[data-part]');
  if (!button || fileBusy || !editable(parts[button?.dataset.part]?.layer)) {
    event.preventDefault();
    return;
  }
  draggedKind = button.dataset.part;
  event.dataTransfer.setData(partMime, draggedKind);
  event.dataTransfer.effectAllowed = 'copy';
});
document.addEventListener('dragend', () => {
  draggedKind = '';
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
  else if (draggedKind) {
    const point = toWorld(screenPoint(event));
    draftPart = partAt(draggedKind, point);
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
    stage.focus({ preventScroll: true });
    placePart(kind, toWorld(screenPoint(event)));
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
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
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
  if (key === 'shift' && hover) {
    hover.free = true;
    scheduleDraw();
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
  if (event.key === 'Shift' && !event.shiftKey) releaseFreeAngle();
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
