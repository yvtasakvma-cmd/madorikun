import { basinSymbols } from './basin-symbols.js';
import { stoveSymbols } from './stove-symbols.js';
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
export const WASHER_DASH = { min: 0.01, max: 2500 };
export const washerDashDefault = (w, h) => Math.min(w, h) * 0.043;
const kitchenPieces = {
  worktop: { name: '台', size: [116, 116 * 166 / 522] },
  sink: { name: 'シンク', size: [44, 44 * 300 / 442] },
  divider: { name: '仕切り線', size: [8, 116 * 166 / 522] },
  burner: { name: 'コンロ口', size: [16.25, 16.25] },
};

export const PART_DESIGNS = {
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
  sliding: { default: 'overlap', choices: { overlap: '引き違い', pocket: '片引き' } },
};

// Projects saved before toilet variants used the side-mounted tank by default.
export const partVariant = item => item.variant ?? (item.kind === 'toilet' ? 'tank' : PART_DESIGNS[item.kind]?.default);

export const isSlidingSymbol = kind => kind === 'window' || kind === 'sliding';
const stoveScale = 39 / stoveSymbols.stove2.size[1];
const stoveStrokeWidth = Number((5.7 * stoveScale).toFixed(2));
export function partStrokeDefault(kind, variant = PART_DESIGNS[kind]?.default) {
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

export function openingFrameDepth(kind, width, depth) {
  return isSlidingSymbol(kind) ? Math.min(depth, width * 0.074) : depth;
}

export const parts = {
  column: { name: '柱', layer: 'wall', size: [32, 32] },
  swing: { name: '片開き戸', layer: 'opening', size: [50, 50] },
  double: { name: '両開き戸', layer: 'opening', size: [70, 35] },
  sliding: { name: '引き戸', layer: 'opening', size: [72, 12] },
  folding: { name: '折れ戸', layer: 'opening', size: [64, 22] },
  window: { name: '窓', layer: 'opening', size: [74, 10] },
  bath: { name: '浴槽', layer: 'fixture', size: [46, 72] },
  basin: { name: '洗面台', layer: 'fixture', size: [42, 34] },
  toilet: { name: 'トイレ', layer: 'fixture', size: [33, 49] },
  kitchen: { name: 'キッチン', layer: 'fixture', size: [116, 39] },
  washer: { name: '洗濯機置場', layer: 'fixture', size: [36, 36] },
  compass: { name: '方位記号', layer: 'fixture', size: [38, 38] },
};

export const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const sinkRadius = (w, h, radius) => Math.min(radius ?? Math.min(w, h) * 0.38, Math.min(w, h) / 2);
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
    for (const [tip, outward] of [[wall.a, -direction], [wall.b, direction]]) {
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
      const defaultCap = wall.width / 2;
      const radius = Math.max(searchRadius, defaultCap);
      const size = lengthOf(wall.a, wall.b);
      const direction = Math.sign(wall.b[axis] - wall.a[axis]);
      const ends = [wall.a, wall.b].map((tip, index) => {
        let cap = defaultCap;
        const outward = index === 0 ? -direction : direction;
        const first = firstWallAtOrBeyond(crossWalls, axis, tip[axis] - radius);
        for (let i = first; i < crossWalls.length; i++) {
          const mate = crossWalls[i];
          const offset = mate.a[axis] - tip[axis];
          if (offset > radius) break;
          if (Math.abs(offset) > Math.max(defaultCap, mate.width / 2) || offset * outward <= -size) continue;
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
  for (const wall of walls) {
    if (wallDirection(wall) !== null) continue;
    const clip = diagonalWallClip(wall, byDirection, maxHalfWidth, openings, joints);
    if (clip) joints.set(wall.id, { clip });
  }
  return joints;
}

export function wallSegments(wall, openings, caps = [wall.width / 2, wall.width / 2]) {
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
