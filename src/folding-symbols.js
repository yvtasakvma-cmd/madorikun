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

export const MAX_FOLDING_TRIANGLES = 12;

export function foldingTriangleLayout(variant, positions) {
  if (!Object.hasOwn(foldingSymbols, variant)) return [];
  const symbol = foldingSymbols[variant];
  const [left, , right] = symbol.frame;
  const span = right - left;
  return (positions ?? symbol.triangles.map(([, tip]) => (tip - left) / span)).map((position, index) => {
    const [a, tip, b] = symbol.triangles[index] ?? symbol.triangles[0];
    const leftWidth = (tip - a) / span;
    const rightWidth = (b - tip) / span;
    const center = Math.max(leftWidth, Math.min(1 - rightWidth, position));
    return { center, leftWidth, rightWidth };
  });
}

export function foldingTrianglePositions(variant, positions, count) {
  const result = foldingTriangleLayout(variant, positions).map(triangle => triangle.center).slice(0, count);
  while (result.length < count) {
    const layout = foldingTriangleLayout(variant, [...result, 0.5]);
    const { leftWidth, rightWidth } = layout.pop();
    const limits = [leftWidth, 1 - rightWidth];
    const occupied = layout.map(({ center, leftWidth: left, rightWidth: right }) =>
      [center - left - rightWidth, center + right + leftWidth]).sort((a, b) => a[0] - b[0]);
    let widest = 0;
    let center = 0.5;
    const findGap = (segments, reserve = 0) => {
      let start = limits[0];
      for (const [low, high] of [...segments, [limits[1], limits[1]]]) {
        const stop = Math.min(low, limits[1]);
        if (stop - start > widest) {
          widest = stop - start;
          center = (stop + start - Math.min(widest, reserve)) / 2;
        }
        start = Math.max(start, high);
      }
    };
    findGap(occupied, (count - result.length - 1) * (leftWidth + rightWidth));
    // When the frame is crowded, still allow another movable triangle.
    if (!widest) findGap(result.toSorted((a, b) => a - b).map(point => [point, point]));
    result.push(center);
  }
  return result;
}

export function foldingDrawing(variant, width, height, depth, positions) {
  const x = value => (value - 0.5) * width;
  const top = -depth / 2;
  const triangles = foldingTriangleLayout(variant, positions).map(({ center, leftWidth, rightWidth }) =>
    `M${x(center - leftWidth)} ${top}L${x(center)} ${top - height}L${x(center + rightWidth)} ${top}`).join('');
  return `<rect x="${-width / 2}" y="${top}" width="${width}" height="${depth}" fill="#ffffff"/>
    <path d="${triangles}"/>`;
}
