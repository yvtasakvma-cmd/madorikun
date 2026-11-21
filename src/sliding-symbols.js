// The coordinates describe the stroke centerlines in the supplied drawings.
export const slidingSymbols = {
  stepped: {
    name: '3枚引込み',
    bounds: [50, 68.5, 980, 140.5],
    stroke: 5.5,
    frames: [
      [310, 109.5, 535, 123], [513, 94.5, 759, 107.7], [737, 80.5, 980, 94.5],
    ],
    rails: [[525, 85.5, 525, 140.5], [746.5, 68.5, 746.5, 128.5]],
    pocket: { end: 301, rows: [84, 100.5, 117], dash: 9.5, gap: 9 },
  },
  threePanel: {
    name: '3枚引き違い',
    bounds: [69, 55, 832.5, 93.3],
    stroke: 5.5,
    frames: [[69, 55, 832.5, 93.3, 1.5]],
    rails: [
      [325, 55, 325, 93.3], [587.5, 55, 587.5, 93.3],
      [69, 80.8, 334.5, 80.8], [314.5, 66.4, 601, 66.4], [577, 78.4, 832.5, 78.4],
    ],
  },
  fourPanel: {
    name: '4枚引き違い',
    bounds: [54.8, 39.9, 1051.5, 79.2],
    stroke: 5.5,
    frames: [[54.8, 39.9, 1051.5, 79.2, 1.5]],
    rails: [
      [282.5, 39.9, 282.5, 79.2], [541.2, 39.9, 541.2, 79.2], [807.3, 39.9, 807.3, 79.2],
      [54.8, 51.6, 303, 51.6], [265, 65.7, 561.8, 65.7],
      [527.5, 51.6, 831, 51.6], [783, 65.7, 1051.5, 65.7],
    ],
  },
  accordion: {
    name: 'アコーディオンカーテン',
    bounds: [0, 0, 294, 116],
    stroke: 6,
    peaks: 4,
  },
};

export const windowSymbols = {
  centerRail: {
    name: '中央線',
    bounds: [39, 36.9, 270.9, 58.2],
    stroke: 2.4,
    frames: [[39, 36.9, 270.9, 58.2]],
    rails: [[39, 47.5, 270.9, 47.5]],
  },
  threePanel: {
    name: '3枚引き違い',
    bounds: [29, 27.7, 601.5, 56.5],
    stroke: 4.3,
    frames: [[29, 27.7, 601.5, 56.5, 1.1]],
    rails: [
      [221, 27.7, 221, 56.5], [417.5, 27.7, 417.5, 56.5],
      [29, 47, 228, 47], [213, 36.3, 428, 36.3], [409.5, 45.2, 601.5, 45.2],
    ],
  },
  fourPanel: {
    name: '4枚引き違い',
    bounds: [58.5, 37.9, 806, 67.1],
    stroke: 4.3,
    frames: [[58.5, 37.9, 806, 67.1, 1.1]],
    rails: [
      [229, 37.9, 229, 67.1], [423, 37.9, 423, 67.1], [622.5, 37.9, 622.5, 67.1],
      [58.5, 46.7, 244.5, 46.7], [216, 57, 439, 57],
      [413, 46.7, 640.5, 46.7], [604.5, 57, 806, 57],
    ],
  },
};

export function slidingSymbol(kind, variant) {
  const symbols = kind === 'window' ? windowSymbols : kind === 'sliding' ? slidingSymbols : null;
  return symbols && Object.hasOwn(symbols, variant) ? symbols[variant] : null;
}

export function slidingDrawing(symbol, width, depth) {
  if (symbol.peaks) {
    const segments = symbol.peaks * 2;
    const points = Array.from({ length: segments + 1 }, (_, i) =>
      `${width * (i / segments - 0.5)} ${i % 2 ? -depth / 2 : depth / 2}`);
    return `<path d="M${points.join('L')}"/>`;
  }
  const [left, top, right, bottom] = symbol.bounds;
  const sx = width / (right - left);
  const sy = depth / (bottom - top);
  const x = value => (value - left) * sx - width / 2;
  const y = value => (value - top) * sy - depth / 2;
  const frames = symbol.frames.map(([x1, y1, x2, y2, radius = 0]) =>
    `<rect x="${x(x1)}" y="${y(y1)}" width="${(x2 - x1) * sx}" height="${(y2 - y1) * sy}"
      rx="${radius * sx}" ry="${radius * sy}" fill="#ffffff"/>`).join('');
  const line = (x1, y1, x2, y2) => `M${x(x1)} ${y(y1)}L${x(x2)} ${y(y2)}`;
  const rails = symbol.rails.map(points => line(...points)).join('');
  const pocket = symbol.pocket;
  const dashes = pocket ? pocket.rows.map(row =>
    `<path d="${line(left, row, pocket.end, row)}" stroke-dasharray="${pocket.dash * sx} ${pocket.gap * sx}"/>`).join('') : '';
  return `${frames}<path d="${rails}"/>${dashes}`;
}
