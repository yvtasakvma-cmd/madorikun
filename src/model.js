export const layers = [
  { id: 'underlay', name: '下絵', icon: 'file', swatch: '#a0a9b6' },
  { id: 'floor', name: '床', icon: 'floor', swatch: '#e9cc77' },
  { id: 'color', name: '色', icon: 'palette', swatch: '#daa499' },
  { id: 'wall', name: '壁', icon: 'wall', swatch: '#303630' },
  { id: 'opening', name: '窓・扉', icon: 'door', swatch: '#a99b83' },
  { id: 'fixture', name: '設備', icon: 'bath', swatch: '#88bbc9' },
  { id: 'text', name: '文字情報', icon: 'text', swatch: '#829288' },
];

export const floors = {
  wood: { name: '洋室・LDK', color: '#f7efc3', pattern: 'boards' },
  tatami: { name: '和室', color: '#d3e48d', pattern: 'tatami' },
  wet: { name: '水回り', color: '#c8e8f3', pattern: '' },
  storage: { name: '収納', color: '#f2d0c4', pattern: '' },
  entry: { name: '玄関・バルコニー', color: '#e8e8ea', pattern: '' },
  plain: { name: '無地', color: '#ffffff', pattern: '' },
};

export const parts = {
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
  compass: { name: '方位記号', layer: 'fixture', size: [37, 48] },
};

export const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const lerp = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
export const lengthOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const angleOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
export const rotate = ([x, y], angle) => {
  const r = angle * Math.PI / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);

export const PROJECT_VERSION = 2;

export function blank() {
  return {
    version: PROJECT_VERSION, name: '無題の間取り', width: 720, height: 900,
    layers: layers.map(({ id }) => ({ id, visible: true, locked: false })),
    objects: [], underlay: null,
  };
}

export function makePart(kind, at, width) {
  const { layer, size } = parts[kind];
  const w = width ?? size[0];
  return { id: uid(), layer, kind, at, w, h: w * size[1] / size[0], angle: 0, flipX: false, flipY: false };
}

export function projectOnWall(point, wall) {
  const vector = sub(wall.b, wall.a);
  const square = vector[0] ** 2 + vector[1] ** 2;
  const delta = sub(point, wall.a);
  const t = square ? (delta[0] * vector[0] + delta[1] * vector[1]) / square : 0;
  return { t, distance: lengthOf(point, lerp(wall.a, wall.b, clamp(t, 0, 1))) };
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

export function wallSegments(wall, openings) {
  const size = lengthOf(wall.a, wall.b);
  if (!size) return [];
  const intervals = (openings ?? []).map(part => {
    const half = part.w / (2 * size);
    return [Math.max(0, part.t - half), Math.min(1, part.t + half)];
  }).sort((a, b) => a[0] - b[0]);
  const segments = [];
  const cap = wall.width / (2 * size);
  let start = -cap;
  for (const [low, high] of intervals) {
    if (low > Math.max(0, start) + 0.0001) segments.push([lerp(wall.a, wall.b, start), lerp(wall.a, wall.b, low)]);
    start = Math.max(start, high);
  }
  if (start < 1) segments.push([lerp(wall.a, wall.b, start), lerp(wall.a, wall.b, 1 + cap)]);
  return segments;
}
