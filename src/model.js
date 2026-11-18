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

export function blank(name = '無題の間取り') {
  return {
    version: 1, name, width: 720, height: 900,
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

export function sample() {
  const doc = blank('サンプル間取り');
  const polygon = (preset, points) => doc.objects.push({
    id: uid(), layer: 'floor', preset, points, fill: floors[preset].color, direction: 'vertical', tatami: 6, spacing: 12,
  });
  const rectangle = (preset, x, y, w, h) => polygon(preset, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const wall = (x, y, x2, y2, width = 7) => {
    const item = { id: uid(), layer: 'wall', a: [x, y], b: [x2, y2], width };
    doc.objects.push(item);
    return item;
  };
  const part = (kind, x, y, w, angle = 0, flipY = false) => {
    const item = makePart(kind, [x, y], w);
    Object.assign(item, { angle, flipY });
    doc.objects.push(item);
    return item;
  };
  const opening = (kind, host, t, w, flipX = false, flipY = false) => {
    const item = part(kind, 0, 0, w);
    Object.assign(item, { flipX, flipY });
    positionOpening(item, host, t);
    return item;
  };
  const label = (value, x, y, size = 17) => doc.objects.push({
    id: uid(), layer: 'text', at: [x, y], value, size, angle: 0,
  });

  rectangle('entry', 186, 737, 348, 69);
  rectangle('wood', 186, 94, 149, 239);
  rectangle('entry', 335, 94, 70, 108);
  polygon('wood', [[335, 202], [405, 202], [405, 94], [534, 94], [534, 737], [365, 737], [365, 511], [311, 511], [311, 333], [335, 333]]);
  rectangle('wet', 186, 333, 125, 117);
  rectangle('wet', 186, 450, 79, 61);
  rectangle('storage', 265, 450, 46, 61);
  rectangle('tatami', 186, 511, 179, 226);
  rectangle('storage', 186, 511, 94, 46);
  rectangle('storage', 405, 94, 55, 43);

  const top = wall(186, 94, 534, 94, 11);
  wall(186, 94, 186, 737, 12);
  wall(534, 94, 534, 737, 12);
  const bottom = wall(186, 737, 534, 737, 10);
  const bedroom = wall(335, 94, 335, 333);
  wall(186, 333, 335, 333);
  wall(405, 94, 405, 202);
  wall(335, 202, 405, 202, 4);
  const wet = wall(311, 333, 311, 511);
  wall(186, 450, 311, 450);
  wall(265, 450, 265, 511, 5);
  const tatami = wall(186, 511, 365, 511);
  wall(186, 557, 280, 557, 4);
  wall(280, 511, 280, 557, 4);
  wall(365, 511, 365, 737);
  wall(186, 737, 186, 806, 2);
  wall(534, 737, 534, 806, 2);
  wall(186, 806, 534, 806, 2);
  opening('swing', top, 0.53, 55, false, true);
  opening('window', top, 0.22, 104);
  opening('window', top, 0.85, 74);
  opening('swing', bedroom, 0.83, 52, true);
  opening('swing', wet, 0.36, 49, true);
  opening('swing', tatami, 0.79, 51, true, true);
  opening('window', bottom, 0.29, 116);
  opening('sliding', bottom, 0.75, 108);
  part('bath', 215, 379, 39);
  part('basin', 279, 420, 40);
  part('toilet', 219, 480, 30);
  part('washer', 275, 356, 27);
  part('kitchen', 508, 320, 120, 90);
  part('compass', 142, 779, 30);

  label('洋室\n（約6帖）', 254, 209);
  label('玄関', 370, 156, 15);
  label('収納', 432, 117, 13);
  label('浴室', 217, 428, 13);
  label('洗面', 278, 389, 13);
  label('トイレ', 242, 488, 12);
  label('物入', 288, 484, 12);
  label('押入', 233, 533, 14);
  label('和室\n（6帖）', 277, 638);
  label('LDK\n（約12帖）', 446, 508, 21);
  label('バルコニー', 361, 773, 16);
  return doc;
}
