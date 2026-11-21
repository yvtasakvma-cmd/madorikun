// Stroke centerlines measured from the three supplied reference drawings.
export const basinSymbols = {
  rounded: {
    name: '丸型ボウル',
    bounds: [56.5, 39, 572.3, 485.3],
    cabinetRadius: [59, 59],
    rails: [126.5, 160.1],
    bowl: [106.4, 197.8, 522.5, 454, 109, 109],
    drain: [314.6, 260, 20],
    stroke: 10.7,
  },
  rectangular: {
    name: '角型ボウル',
    bounds: [52, 28, 624.8, 509],
    cabinetRadius: [49, 49],
    rails: [127, 166],
    bowl: [101.8, 219.9, 567, 480, 34.5, 34.5],
    drain: [334.5, 315.5, 26.5],
    stroke: 10.8,
  },
  compact: {
    name: '小型ボウル',
    bounds: [49.7, 44.4, 430.4, 285.2],
    cabinetRadius: [33.5, 25.4],
    rails: [94, 113.2],
    bowl: [127.6, 161, 360.3, 267.6, 17.5, 17.5],
    drain: [244.1, 190.2, 13.1],
    stroke: 5.6,
  },
};

export function basinDrawing(symbol, width, height) {
  const [left, top, right, bottom] = symbol.bounds;
  const sx = width / (right - left);
  const sy = height / (bottom - top);
  const x = value => (value - left) * sx - width / 2;
  const y = value => (value - top) * sy - height / 2;
  const [rx, ry] = symbol.cabinetRadius;
  const radius = `${rx * sx} ${ry * sy}`;
  const cabinet = `<path d="M${x(left)} ${y(top)}H${x(right)}V${y(bottom - ry)}
    A${radius} 0 0 1 ${x(right - rx)} ${y(bottom)}
    H${x(left + rx)}A${radius} 0 0 1 ${x(left)} ${y(bottom - ry)}Z"/>`;
  const rails = symbol.rails.map(rail => `M${x(left)} ${y(rail)}H${x(right)}`).join('');
  const [bowlLeft, bowlTop, bowlRight, bowlBottom, bowlRx, bowlRy] = symbol.bowl;
  const [drainX, drainY, drainRadius] = symbol.drain;
  return cabinet + `<path d="${rails}"/>
    <rect x="${x(bowlLeft)}" y="${y(bowlTop)}" width="${(bowlRight - bowlLeft) * sx}" height="${(bowlBottom - bowlTop) * sy}"
      rx="${bowlRx * sx}" ry="${bowlRy * sy}"/>
    <ellipse cx="${x(drainX)}" cy="${y(drainY)}" rx="${drainRadius * sx}" ry="${drainRadius * sy}"/>`;
}
