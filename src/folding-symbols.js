// Centerlines traced from the two supplied reference drawings.
export const foldingSymbols = {
  singleTriangle: {
    name: '片側折れ戸',
    frame: [42.2, 199, 385.8, 262.6],
    tipY: 51.2,
    triangles: [[276, 322, 365.5]],
    stroke: 5.5,
  },
  doubleTriangle: {
    name: '両側折れ戸',
    frame: [72.2, 152.2, 913.7, 199.9],
    tipY: 42.8,
    triangles: [[92.6, 126.9, 159], [833.6, 868, 900.3]],
    stroke: 4.3,
  },
};

export function foldingDrawing(symbol, width, height, depth) {
  const [left, , right] = symbol.frame;
  const x = value => (value - left) * width / (right - left) - width / 2;
  const top = -depth / 2;
  const triangles = symbol.triangles.map(([start, tip, end]) =>
    `M${x(start)} ${top}L${x(tip)} ${top - height}L${x(end)} ${top}`).join('');
  return `<rect x="${-width / 2}" y="${top}" width="${width}" height="${depth}" fill="#ffffff"/>
    <path d="${triangles}"/>`;
}
