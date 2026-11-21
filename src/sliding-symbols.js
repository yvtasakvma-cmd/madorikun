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
};

export function slidingDrawing(symbol, width, depth) {
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
