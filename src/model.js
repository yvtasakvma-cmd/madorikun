import { basinSymbols } from './basin-symbols.js';
import { foldingSymbols } from './folding-symbols.js';
import { slidingSymbol, slidingSymbols, windowSymbols } from './sliding-symbols.js';
import { stoveFrameRadii, stoveSymbols } from './stove-symbols.js';
import { toiletSymbols } from './toilet-symbols.js';

export const layers = [
  { id: 'underlay', name: '下絵', icon: 'file', swatch: '#a0a9b6' },
  { id: 'color', name: '色', icon: 'palette', swatch: '#daa499' },
  { id: 'floor', name: '床', icon: 'floor', swatch: '#e9cc77' },
  { id: 'wall', name: '壁', icon: 'wall', swatch: '#303630' },
  { id: 'opening', name: '窓・扉', icon: 'door', swatch: '#a99b83' },
  { id: 'fixture', name: '設備', icon: 'bath', swatch: '#88bbc9' },
  { id: 'text', name: '文字情報', icon: 'text', swatch: '#829288' },
];

export const floors = {
  wood: { name: 'フローリング', pattern: 'boards' },
  tatami: { name: '畳', pattern: 'tatami' },
};

export const roomColors = {
  western: { name: '洋室・LDK・廊下', color: '#f7efc3' },
  japanese: { name: '和室', color: '#d3e48d' },
  wet: { name: '水回り', color: '#c8e8f3' },
  storage: { name: '収納', color: '#f2d0c4' },
  entry: { name: '玄関', color: '#e8e8ea' },
  balcony: { name: 'バルコニー', color: '#e8e8ea' },
  custom: { name: 'カスタム' },
};

export const TEXT_FONTS = {
  gothic: { name: 'ゴシック（Noto Sans JP）', family: 'MadoriGothic' },
  mincho: { name: '明朝（Noto Serif JP）', family: 'MadoriMincho' },
  maru: { name: '丸ゴシック（Zen Maru Gothic）', family: 'MadoriMaru' },
  biz: { name: 'BIZ UDPゴシック', family: 'MadoriBiz' },
  mplus: { name: 'M PLUS 1p', family: 'MadoriMPlus' },
  zenKaku: { name: 'Zen Kaku Gothic New', family: 'MadoriZenKaku' },
  kiwi: { name: 'Kiwi Maru', family: 'MadoriKiwi' },
  shippori: { name: 'しっぽり明朝', family: 'MadoriShippori' },
};
export const DEFAULT_TEXT_FONT = 'biz';
export const textFontId = item => item.font ?? 'gothic'; // Older projects may omit the font ID.

export const ROOM_LABELS = { western: '洋室', japanese: '和室', ldk: 'LDK', dk: 'DK', k: 'K' };
export const ROOM_LABEL_TATAMI = { initial: 6, min: 0.01, max: 999.99 };
export const roomLabelText = (name, count, approximate = false) => `${name}\n（${approximate ? '約' : ''}${count}帖）`;

export function readRoomLabel(value) {
  const lines = value.split('\n');
  const [name, area] = lines;
  if (lines.length !== 2 || !Object.values(ROOM_LABELS).includes(name)) return null;
  const match = /^（(約?)(\d+(?:\.\d{1,2})?)帖）$/.exec(area);
  const count = Number(match?.[2]);
  if (!(count >= ROOM_LABEL_TATAMI.min && count <= ROOM_LABEL_TATAMI.max)) return null;
  return { name, count, approximate: match[1] === '約' };
}

export const PART_STROKE = { defaultWidth: 1.15, min: 0.1, max: 8 };
export const BATH_BOWL_BOUNDS = [51, 45, 266, 330];
export const WASHER_DASH = { min: 0.01, max: 2500 };
export const washerDashDefault = (w, h) => Math.min(w, h) * 0.043;
const dividerSize = [8, 116 * 166 / 522];
const kitchenPieces = {
  worktop: { name: '台', size: [116, 116 * 166 / 522] },
  sink: { name: 'シンク', size: [44, 44 * 300 / 442] },
  divider: { name: '仕切り線', size: dividerSize },
  burner: { name: 'コンロ口', size: [16.25, 16.25] },
};
export const STOVE_CHOICES = { stove2: stoveSymbols.stove2.name, stove3: stoveSymbols.stove3.name, burner: kitchenPieces.burner.name };

export const PART_DESIGNS = {
  bath: { default: 'tub', choices: { tub: '浴槽', withBowl: '浴室（ボウル付き）', rounded: '角丸浴槽' } },
  window: {
    default: 'overlap',
    choices: {
      overlap: '引き違い',
      ...Object.fromEntries(Object.entries(windowSymbols).map(([id, symbol]) => [id, symbol.name])),
    },
  },
  folding: {
    default: 'singleTriangle',
    choices: {
      zigzag: 'ジグザグ',
      ...Object.fromEntries(Object.entries(foldingSymbols).map(([id, symbol]) => [id, symbol.name])),
    },
  },
  basin: {
    default: 'rounded',
    choices: Object.fromEntries(Object.entries(basinSymbols).map(([id, symbol]) => [id, symbol.name])),
  },
  toilet: {
    default: 'roundedTank',
    choices: Object.fromEntries(Object.entries(toiletSymbols).map(([id, symbol]) => [id, symbol.name])),
  },
  kitchen: {
    default: 'counter',
    choices: {
      counter: 'キッチン',
      ...Object.fromEntries(Object.entries({ ...stoveSymbols, ...kitchenPieces }).map(([id, symbol]) => [id, symbol.name])),
    },
  },
  sliding: {
    default: 'overlap',
    choices: {
      overlap: '引き違い', pocket: '片引き',
      ...Object.fromEntries(Object.entries(slidingSymbols).map(([id, symbol]) => [id, symbol.name])),
    },
  },
};

// Preserve the original symbols when saved projects omit a variant.
const legacyPartVariants = { toilet: 'tank', folding: 'zigzag' };
export const partVariant = item => item.variant ?? (legacyPartVariants[item.kind] ?? PART_DESIGNS[item.kind]?.default);

export const isSlidingSymbol = kind => kind === 'window' || kind === 'sliding';
export const isSteppedSliding = (kind, variant) => kind === 'sliding' && variant === 'stepped';
export const isAccordionSliding = (kind, variant) => kind === 'sliding' && variant === 'accordion';
export const isDividerPart = (kind, variant) => kind === 'bathDivider' || (kind === 'kitchen' && variant === 'divider');
export const hasAdjustableRadius = (kind, variant) => (kind === 'bath' && variant === 'rounded') || (kind === 'kitchen' && variant === 'sink');
const stoveScale = 39 / stoveSymbols.stove2.size[1];
const stoveStrokeWidth = Number((5.7 * stoveScale).toFixed(2));
export function partStrokeDefault(kind, variant = PART_DESIGNS[kind]?.default) {
  if (kind === 'bath' && variant === 'withBowl') return 1.57;
  if (kind === 'bath' && variant === 'rounded') return 1.35;
  if (kind === 'folding' && Object.hasOwn(foldingSymbols, variant)) {
    const { frame: [left, , right], stroke } = foldingSymbols[variant];
    return Number((stroke * parts.folding.size[0] / (right - left)).toFixed(2));
  }
  const sliding = slidingSymbol(kind, variant);
  if (sliding) {
    const { bounds: [left, , right], stroke } = sliding;
    return Number((stroke * parts[kind].size[0] / (right - left)).toFixed(2));
  }
  if (isSlidingSymbol(kind)) return 0.8;
  if (kind === 'compass') return 1.4;
  if (kind === 'basin') {
    const { bounds: [left, , right], stroke } = basinSymbols[variant];
    return Number((stroke * parts.basin.size[0] / (right - left)).toFixed(2));
  }
  if (kind === 'kitchen' && (variant === 'burner' || Object.hasOwn(stoveSymbols, variant))) return stoveStrokeWidth;
  if (kind !== 'toilet') return PART_STROKE.defaultWidth;
  const { bounds: [, top, , bottom], lineWidth } = toiletSymbols[variant];
  return Number((lineWidth * parts.toilet.size[1] / (bottom - top)).toFixed(2));
}

export function openingFrameDepth(kind, width, depth, variant, steppedDepth, wallWidth) {
  if (kind === 'window' && wallWidth !== undefined) return wallWidth;
  depth = wallWidth ?? depth;
  if (isSteppedSliding(kind, variant) && steppedDepth !== undefined) return steppedDepth;
  if (kind === 'folding' && Object.hasOwn(foldingSymbols, variant)) {
    const [left, top, right, bottom] = foldingSymbols[variant].frame;
    return width * (bottom - top) / (right - left);
  }
  const sliding = slidingSymbol(kind, variant);
  if (sliding) {
    const [left, top, right, bottom] = sliding.bounds;
    const symbolDepth = width * (bottom - top) / (right - left);
    return isAccordionSliding(kind, variant) ? symbolDepth : Math.min(depth, symbolDepth);
  }
  return isSlidingSymbol(kind) ? Math.min(depth, width * 0.074) : depth;
}

export function openingSwingDepth(kind, width, height, depth, variant) {
  if (kind === 'swing') return width;
  if (kind === 'double') return width / 2;
  if (kind === 'folding') return height + (Object.hasOwn(foldingSymbols, variant) ? depth / 2 : 0);
  return 0;
}

export const parts = {
  column: { name: '柱', layer: 'wall', size: [32, 32] },
  swing: { name: '片開き戸', layer: 'opening', size: [50, 50] },
  double: { name: '両開き戸', layer: 'opening', size: [70, 35] },
  sliding: { name: '引き戸', layer: 'opening', size: [72, 12] },
  folding: { name: '折れ戸', layer: 'opening', size: [64, 22] },
  window: { name: '窓', layer: 'opening', size: [74, 10] },
  bath: { name: '浴槽', layer: 'fixture', size: [46, 72] },
  bathDivider: { name: '仕切り線', layer: 'fixture', size: dividerSize },
  basin: { name: '洗面台', layer: 'fixture', size: [42, 34] },
  toilet: { name: 'トイレ', layer: 'fixture', size: [33, 49] },
  kitchen: { name: 'キッチン', layer: 'fixture', size: [116, 39] },
  washer: { name: '洗濯機置場', layer: 'fixture', size: [36, 36] },
  compass: { name: '方位記号', layer: 'fixture', size: [38, 38] },
};

export const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function partCornerRadius(kind, w, h, radius) {
  const shortSide = Math.min(w, h);
  return Math.min(radius ?? shortSide * (kind === 'bath' ? 0.25 : 0.38), shortSide / 2);
}
export const lerp = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
export const lengthOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const angleOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
export const rotate = ([x, y], angle) => {
  const r = angle * Math.PI / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);

export function isDrawingAngle(a, b) {
  const [dx, dy] = sub(b, a).map(Math.abs);
  const epsilon = 1e-7;
  return dx < epsilon || dy < epsilon || Math.abs(dx - dy) < epsilon;
}

export function snapDrawingAngle(point, origin) {
  const [dx, dy] = sub(point, origin);
  const limit = Math.SQRT2 - 1;
  if (Math.abs(dy) <= Math.abs(dx) * limit) return [point[0], origin[1]];
  if (Math.abs(dx) <= Math.abs(dy) * limit) return [origin[0], point[1]];
  const diagonal = (Math.abs(dx) + Math.abs(dy)) / 2;
  return add(origin, [Math.sign(dx) * diagonal, Math.sign(dy) * diagonal]);
}

const drawingDirections = [[1, 0], [0, 1], [1, 1], [1, -1]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

export function snapClosingCorner(point, previous, first, tolerance) {
  const delta = sub(first, previous);
  let nearest = null;
  let best = tolerance;
  for (const out of drawingDirections) {
    for (const back of drawingDirections) {
      const determinant = cross(out, back);
      if (!determinant) continue;
      const offset = cross(delta, back) / determinant;
      const candidate = add(previous, out.map(value => value * offset));
      if (lengthOf(candidate, previous) < 0.5 || lengthOf(candidate, first) < 0.5) continue;
      const distance = lengthOf(candidate, point);
      if (distance < best) {
        nearest = candidate;
        best = distance;
      }
    }
  }
  return nearest;
}

export function alignFinalCorner(previous, last, first) {
  if (isDrawingAngle(last, first)) return last;

  const incoming = sub(last, previous);
  const closing = sub(snapDrawingAngle(first, last), last).map(Math.sign);
  const determinant = cross(incoming, closing);
  if (Math.abs(determinant) < 1e-7) return null;

  const delta = sub(first, previous);
  const alongIncoming = cross(delta, closing) / determinant;
  const alongClosing = cross(delta, incoming) / determinant;
  const corner = add(first, closing.map(axis => axis * alongClosing));
  if (alongIncoming <= 0 || alongClosing >= 0
    || lengthOf(previous, corner) < 0.5 || lengthOf(corner, first) < 0.5) return null;
  return corner;
}

export const PROJECT_VERSION = 3;
export const OBJECT_LIMIT = 10000;

export function blank() {
  return {
    version: PROJECT_VERSION, name: '無題の間取り', width: 720, height: 900,
    layers: layers.map(({ id }) => ({ id, visible: true, locked: false })),
    objects: [], underlay: null,
  };
}

export function partSize(kind, variant = PART_DESIGNS[kind]?.default) {
  const size = parts[kind].size;
  if (isAccordionSliding(kind, variant)) return [size[0], openingFrameDepth(kind, size[0], 0, variant)];
  if (kind === 'bath' && variant === 'withBowl') {
    const [left, top, right, bottom] = BATH_BOWL_BOUNDS;
    return [(right - left) * size[1] / (bottom - top), size[1]];
  }
  if (kind === 'bath' && variant === 'rounded') return [72, 72 * 136 / 223];
  if (kind === 'folding' && Object.hasOwn(foldingSymbols, variant)) {
    const { frame: [left, top, right], tipY } = foldingSymbols[variant];
    return [size[0], size[0] * (top - tipY) / (right - left)];
  }
  if (kind === 'basin') {
    const [left, top, right, bottom] = basinSymbols[variant].bounds;
    return [size[0], (bottom - top) * size[0] / (right - left)];
  }
  if (kind === 'kitchen' && Object.hasOwn(stoveSymbols, variant)) {
    return stoveSymbols[variant].size.map(dimension => dimension * stoveScale);
  }
  if (kind === 'kitchen' && Object.hasOwn(kitchenPieces, variant)) return kitchenPieces[variant].size;
  if (kind !== 'toilet') return size;
  const [left, top, right, bottom] = toiletSymbols[variant].bounds;
  return [(right - left) * size[1] / (bottom - top), size[1]];
}

export function makePart(kind, at, width, variant = PART_DESIGNS[kind]?.default) {
  const [defaultWidth, defaultHeight] = partSize(kind, variant);
  const w = width ?? defaultWidth;
  return {
    id: uid(), layer: parts[kind].layer, kind, at, w, h: w * defaultHeight / defaultWidth, angle: 0,
    flipX: false, flipY: false, ...(variant ? { variant } : {}),
  };
}

export function projectOnWall(point, wall) {
  const vector = sub(wall.b, wall.a);
  const square = vector[0] ** 2 + vector[1] ** 2;
  const delta = sub(point, wall.a);
  const t = square ? (delta[0] * vector[0] + delta[1] * vector[1]) / square : 0;
  return { t, distance: lengthOf(point, lerp(wall.a, wall.b, clamp(t, 0, 1))) };
}

export function snapDividerToFrame(point, origin, objects, radius, dividerKind, frameId) {
  let best = radius;
  let target = null;
  const frameKind = dividerKind === 'bathDivider' ? 'bath' : 'kitchen';
  for (const item of objects) {
    if (item.kind !== frameKind || (frameId && item.id !== frameId)) continue;
    const symbol = frameKind === 'kitchen' && Object.hasOwn(stoveSymbols, item.variant) ? stoveSymbols[item.variant] : null;
    const roundedBath = frameKind === 'bath' && item.variant === 'rounded';
    if (!symbol && !roundedBath) continue;
    const local = rotate(sub(point, item.at), -item.angle);
    const [w, h] = [item.w / 2, item.h / 2];
    if (Math.abs(local[0]) > w + best || Math.abs(local[1]) > h + best) continue;
    const radius = roundedBath ? partCornerRadius(item.kind, item.w, item.h, item.cornerRadius) : null;
    const [rx, ry] = symbol ? stoveFrameRadii(symbol, item.w, item.h) : [radius, radius];
    if (Math.abs(local[0]) < w - rx - best && Math.abs(local[1]) < h - ry - best) continue;
    const frame = [[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sy], corner) =>
      Array.from({ length: 17 }, (_, i) => {
        const angle = (corner + i / 16) * Math.PI / 2;
        return [sx * (w - rx) + rx * Math.cos(angle), sy * (h - ry) + ry * Math.sin(angle)];
      }));
    const start = origin && rotate(sub(origin, item.at), -item.angle);
    const ray = start && sub(local, start);
    for (const [i, a] of frame.entries()) {
      const b = frame[(i + 1) % frame.length];
      let snapped;
      if (start) {
        // Intersect the frame along the chosen drawing angle.
        const edge = sub(b, a);
        const determinant = cross(ray, edge);
        if (Math.abs(determinant) < 1e-7) continue;
        const offset = sub(a, start);
        const t = cross(offset, edge) / determinant;
        const u = cross(offset, ray) / determinant;
        if (t < 1e-7 || u < -1e-7 || u > 1 + 1e-7) continue;
        snapped = lerp(start, local, t);
      } else {
        const { t } = projectOnWall(local, { a, b });
        snapped = lerp(a, b, clamp(t, 0, 1));
      }
      const distance = lengthOf(local, snapped);
      if (distance >= best) continue;
      best = distance;
      target = { point: add(item.at, rotate(snapped, item.angle)), frameId: item.id };
    }
  }
  return target;
}

export function snapFixtureToWall(part, walls, radius) {
  const { at, w, h, angle } = part;
  const stroke = part.strokeWidth ?? partStrokeDefault(part.kind, partVariant(part));
  const halfAxes = [rotate([(w + stroke) / 2, 0], angle), rotate([0, (h + stroke) / 2], angle)];
  const dot = ([x, y], [u, v]) => x * u + y * v;
  let best = radius;
  let snapped = at;
  for (const { wall, segments } of walls) {
    const length = lengthOf(wall.a, wall.b);
    if (!length || !segments.length) continue;
    const axis = sub(wall.b, wall.a).map(value => value / length);
    const normal = [-axis[1], axis[0]];
    const local = sub(at, wall.a);
    const offset = dot(local, normal);
    const side = Math.sign(offset) || 1;
    const reach = halfAxes.map(half => dot(half, normal));
    const edge = reach.reduce((sum, extent) => sum + Math.abs(extent), 0);
    const correction = side * (wall.width / 2 + edge) - offset;
    if (Math.abs(correction) >= best) continue;

    // Project the touching edge (or corner for an angled fixture) along the wall.
    let contact = dot(local, axis);
    let span = 0;
    for (const [index, half] of halfAxes.entries()) {
      const along = dot(half, axis);
      if (Math.abs(reach[index]) < 1e-7) span += Math.abs(along);
      else contact -= side * Math.sign(reach[index]) * along;
    }
    if (!segments.some(([a, b]) =>
      contact + span >= dot(sub(a, wall.a), axis) && contact - span <= dot(sub(b, wall.a), axis))) continue;
    best = Math.abs(correction);
    snapped = add(at, normal.map(value => value * correction));
  }
  return snapped;
}

export function positionOpening(part, wall, t) {
  const half = part.w / (2 * lengthOf(wall.a, wall.b));
  part.t = clamp(t, half, 1 - half);
  part.wallId = wall.id;
  part.at = lerp(wall.a, wall.b, part.t);
  part.angle = angleOf(wall.a, wall.b);
}

export function detach(part) {
  delete part.wallId;
  delete part.t;
}

export function syncOpenings(doc, wallId) {
  const wall = doc.objects.find(object => object.id === wallId);
  for (const part of doc.objects) {
    if (part.wallId !== wallId) continue;
    if (!wall || lengthOf(wall.a, wall.b) + 0.001 < part.w) detach(part);
    else positionOpening(part, wall, part.t);
  }
}

export const isWallSegment = item => item?.layer === 'wall' && item.kind !== 'column';
export const wallDashArray = width => `${width * 2} ${width * 1.25}`;
const wallEndCaps = wall => [0, 1].map(end => wall.cutEnds?.[end] ? 0 : wall.width / 2);

function regroupCutWall(walls, group) {
  const byEndpoint = new Map();
  const remaining = new Set(walls.filter(wall => wall.wallGroup === group));
  for (const wall of remaining) {
    for (const point of [wall.a, wall.b]) {
      const key = point.join(',');
      if (!byEndpoint.has(key)) byEndpoint.set(key, []);
      byEndpoint.get(key).push(wall);
    }
  }
  for (const wall of remaining) {
    const component = [wall];
    remaining.delete(wall);
    for (const member of component) {
      for (const point of [member.a, member.b]) {
        const key = point.join(',');
        for (const neighbor of byEndpoint.get(key) ?? []) {
          if (remaining.delete(neighbor)) component.push(neighbor);
        }
        byEndpoint.delete(key);
      }
    }
    if (component.length === 1) delete wall.wallGroup;
    else {
      const groupId = uid();
      for (const member of component) member.wallGroup = groupId;
    }
  }
}

export function cutWall(graph, wallId, first, second) {
  const index = graph.objects.findIndex(wall => wall.id === wallId);
  const wall = graph.objects[index];
  if (!isWallSegment(wall)) return { error: 'missing' };
  const length = lengthOf(wall.a, wall.b);
  const nearEnd = 1 / length;
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  if ((high - low) * length < 1) return { error: 'short' };
  const start = low <= nearEnd ? 0 : low;
  const end = high >= 1 - nearEnd ? 1 : high;
  const ranges = [
    ...(start > 0 ? [{ from: 0, to: start }] : []),
    { from: start, to: end, selected: true },
    ...(end < 1 ? [{ from: end, to: 1 }] : []),
  ];
  if (graph.objects.length + ranges.length - 1 > OBJECT_LIMIT) return { error: 'limit' };

  const placements = [];
  for (const part of graph.objects) {
    if (part.wallId !== wall.id) continue;
    const half = part.w / (2 * length);
    const host = ranges.find(({ from, to }) => part.t - half >= from - 1e-7 && part.t + half <= to + 1e-7);
    if (!host) return { error: 'opening' };
    placements.push({ part, host });
  }
  const segment = t => t === 0 ? wall.a : t === 1 ? wall.b : lerp(wall.a, wall.b, t);
  const pieces = ranges.map(range => {
    const { from, to, selected } = range;
    const piece = { ...wall, id: from === 0 ? wall.id : uid(), a: segment(from), b: segment(to),
      cutEnds: [from > 0 || Boolean(wall.cutEnds?.[0]), to < 1 || Boolean(wall.cutEnds?.[1])] };
    if (selected) delete piece.wallGroup;
    range.piece = piece;
    return piece;
  });
  if (pieces.some(piece => lengthOf(piece.a, piece.b) < 1)) return { error: 'short' };
  graph.objects.splice(index, 1, ...pieces);
  if (wall.wallGroup) regroupCutWall(graph.objects, wall.wallGroup);
  for (const { part, host } of placements) positionOpening(part, host.piece, (part.t - host.from) / (host.to - host.from));
  return { id: ranges.find(range => range.selected).piece.id };
}

export function wallDirection(wall) {
  if (wall.a[1] === wall.b[1]) return 0;
  if (wall.a[0] === wall.b[0]) return 1;
  return null;
}

function firstWallAtOrBeyond(walls, axis, value) {
  let low = 0;
  let high = walls.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (walls[middle].a[axis] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

const wallJoinEpsilon = 1e-7;
const crossProduct = ([x, y], [u, v]) => x * v - y * u;

function addAngledWallJoins(walls, openings, byDirection, joints) {
  const endpoints = new Map();
  for (const wall of walls) {
    for (const [end, tip] of [wall.a, wall.b].entries()) {
      const key = tip.join(',');
      if (!endpoints.has(key)) endpoints.set(key, []);
      endpoints.get(key).push({ wall, end, tip });
    }
  }

  for (const ends of endpoints.values()) {
    if (ends.length !== 2) continue;
    const [first, second] = ends;
    if (ends.every(({ wall }) => wallDirection(wall) !== null)) continue;
    if (ends.some(({ wall }) => wall.dashed)) continue;
    const solidLengths = ends.map(({ wall, end }) => {
      const length = lengthOf(wall.a, wall.b);
      return (openings.get(wall.id) ?? []).reduce((clear, part) =>
        Math.min(clear, (end ? 1 - part.t : part.t) * length - part.w / 2), length);
    });
    if (solidLengths.some(length => length <= wallJoinEpsilon)) continue;

    const tip = first.tip;
    const through = byDirection.some((candidates, along) => {
      const axis = 1 - along;
      const start = firstWallAtOrBeyond(candidates, axis, tip[axis] - wallJoinEpsilon);
      for (let i = start; i < candidates.length; i++) {
        const mate = candidates[i];
        if (mate.a[axis] > tip[axis] + wallJoinEpsilon) break;
        const t = (tip[along] - mate.a[along]) / (mate.b[along] - mate.a[along]);
        if (t > wallJoinEpsilon && t < 1 - wallJoinEpsilon) return true;
      }
      return false;
    });
    if (through) continue;

    const directions = ends.map(({ wall, end }) => {
      const other = end ? wall.a : wall.b;
      const length = lengthOf(other, tip);
      return sub(other, tip).map(value => value / length);
    });
    const [u, v] = directions;
    const turn = crossProduct(u, v);
    if (Math.abs(turn) < wallJoinEpsilon) continue;

    const outer = directions.map(([x, y], index) => {
      const side = (index ? 1 : -1) * Math.sign(turn) * ends[index].wall.width / 2;
      return add(tip, [-y * side, x * side]);
    });
    const [a, b] = outer;
    const advance = crossProduct(sub(b, a), v) / turn;
    const corner = add(a, u.map(value => value * advance));
    // Bevel long miters and overlap the strokes to prevent antialias seams.
    const limit = 2.5 * Math.max(first.wall.width, second.wall.width) / 2;
    const overlap = solidLengths.map((length, index) => Math.min(length, ends[index].wall.width) / 2);
    const wedge = [tip, add(a, u.map(value => value * overlap[0])), a];
    if (lengthOf(tip, corner) <= limit) wedge.push(corner);
    wedge.push(b, add(b, v.map(value => value * overlap[1])));

    for (const { wall, end } of ends) {
      const joint = joints.get(wall.id) ?? { caps: wallEndCaps(wall) };
      joint.joinedEnds ??= [false, false];
      joint.joinedEnds[end] = true;
      joint.caps[end] = 0;
      joints.set(wall.id, joint);
    }
    const firstJoint = joints.get(first.wall.id);
    firstJoint.wedges ??= [];
    firstJoint.wedges.push(wedge);
  }
}

function diagonalWallClip(wall, byDirection, maxHalfWidth, openings, joints) {
  const vector = sub(wall.b, wall.a);
  const [dx, dy] = vector.map(Math.abs);
  const reach = (dx + dy) * wall.width / (2 * Math.hypot(dx, dy));
  const low = wall.a.map((value, axis) => Math.min(value, wall.b[axis]) - reach);
  const high = wall.a.map((value, axis) => Math.max(value, wall.b[axis]) + reach);
  let clipped = false;

  for (const axis of [0, 1]) {
    const along = 1 - axis;
    const mates = byDirection[along];
    const searchRadius = maxHalfWidth[along];
    const direction = Math.sign(vector[axis]);
    for (const [end, tip] of [wall.a, wall.b].entries()) {
      if (joints.get(wall.id)?.joinedEnds?.[end]) continue;
      const outward = end ? direction : -direction;
      let outerFace = -Infinity;
      const first = firstWallAtOrBeyond(mates, axis, tip[axis] - searchRadius);
      for (let i = first; i < mates.length; i++) {
        const mate = mates[i];
        const offset = mate.a[axis] - tip[axis];
        if (offset > searchRadius) break;
        if (Math.abs(offset) > mate.width / 2) continue;
        const span = mate.b[along] - mate.a[along];
        const length = Math.abs(span);
        const distance = (tip[along] - mate.a[along]) * Math.sign(span);
        const [startCap, endCap] = joints.get(mate.id).caps;
        if (distance < -startCap - 1e-7 || distance > length + endCap + 1e-7) continue;
        const t = clamp(distance / length, 0, 1);
        if (openings.get(mate.id)?.some(part => Math.abs(t - part.t) * length <= part.w / 2 + 1e-7)) continue;
        outerFace = Math.max(outerFace, offset * outward + mate.width / 2);
      }
      if (outerFace >= reach || outerFace === -Infinity) continue;
      const limit = outward > 0 ? high : low;
      limit[axis] = tip[axis] + outward * outerFace;
      clipped = true;
    }
  }

  return clipped ? { x: low[0], y: low[1], width: high[0] - low[0], height: high[1] - low[1] } : null;
}

export function wallJunctions(walls, openings) {
  const byDirection = [[], []];
  for (const wall of walls) {
    const axis = wallDirection(wall);
    if (axis !== null) byDirection[axis].push(wall);
  }
  for (const axis of [0, 1]) byDirection[axis].sort((a, b) => a.a[1 - axis] - b.a[1 - axis]);

  const maxHalfWidth = byDirection.map(group => group.reduce((max, wall) => Math.max(max, wall.width / 2), 0));
  const joints = new Map();
  for (const axis of [0, 1]) {
    const crossWalls = byDirection[1 - axis];
    const searchRadius = maxHalfWidth[1 - axis];
    for (const wall of byDirection[axis]) {
      const halfWidth = wall.width / 2;
      const radius = Math.max(searchRadius, halfWidth);
      const size = lengthOf(wall.a, wall.b);
      const direction = Math.sign(wall.b[axis] - wall.a[axis]);
      const caps = wallEndCaps(wall);
      const ends = [wall.a, wall.b].map((tip, index) => {
        let cap = caps[index];
        const outward = index === 0 ? -direction : direction;
        const first = firstWallAtOrBeyond(crossWalls, axis, tip[axis] - radius);
        for (let i = first; i < crossWalls.length; i++) {
          const mate = crossWalls[i];
          const offset = mate.a[axis] - tip[axis];
          if (offset > radius) break;
          if (Math.abs(offset) > Math.max(halfWidth, mate.width / 2) || offset * outward <= -size) continue;
          const section = 1 - axis;
          const span = mate.b[section] - mate.a[section];
          const t = (tip[section] - mate.a[section]) / span;
          if (!(t >= 0 && t <= 1)) continue;
          if (openings.get(mate.id)?.some(part => Math.abs(t - part.t) * Math.abs(span) < part.w / 2)) continue;
          cap = Math.min(cap, offset * outward + mate.width / 2);
        }
        return cap;
      });
      joints.set(wall.id, { caps: ends });
    }
  }
  addAngledWallJoins(walls, openings, byDirection, joints);
  for (const wall of walls) {
    if (wallDirection(wall) !== null) continue;
    const clip = diagonalWallClip(wall, byDirection, maxHalfWidth, openings, joints);
    if (clip) joints.set(wall.id, { ...joints.get(wall.id), clip });
  }
  return joints;
}

export function wallSegments(wall, openings, caps = wallEndCaps(wall)) {
  const size = lengthOf(wall.a, wall.b);
  if (!size) return [];
  const intervals = (openings ?? []).map(part => {
    const half = part.w / (2 * size);
    return [Math.max(0, part.t - half), Math.min(1, part.t + half)];
  }).sort((a, b) => a[0] - b[0]);
  const segments = [];
  const stop = 1 + caps[1] / size;
  let start = -caps[0] / size;
  for (const [low, high] of intervals) {
    const end = Math.min(low, stop);
    if (end > Math.max(0, start) + 0.0001) segments.push([lerp(wall.a, wall.b, start), lerp(wall.a, wall.b, end)]);
    start = Math.max(start, high);
  }
  if (start < 1 && start < stop) segments.push([lerp(wall.a, wall.b, start), lerp(wall.a, wall.b, stop)]);
  return segments;
}
