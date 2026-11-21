// Dimensions and burner centers measured from the supplied reference drawings.
export const stoveSymbols = {
  stove2: { name: 'コンロ２口', size: [320, 216], burners: [[84, 108], [232, 110]] },
  stove3: { name: 'コンロ３口', size: [325, 260], burners: [[161, 75], [84, 188], [245, 190]] },
};

export const stoveFrameRadii = (symbol, width, height) => [20 * width / symbol.size[0], 20 * height / symbol.size[1]];

export function burnerDrawing(x, y, sx, sy) {
  const tab = (dx, dy) => `M${x + dx * 45 * sx} ${y + dy * 45 * sy}L${x + dx * 16 * sx} ${y + dy * 16 * sy}`;
  return `<ellipse cx="${x}" cy="${y}" rx="${42.5 * sx}" ry="${42.5 * sy}"/>
    <path d="${tab(-1, -1)}${tab(1, -1)}${tab(-1, 1)}${tab(1, 1)}"/>`;
}

export function stoveDrawing(symbol, width, height) {
  const [referenceWidth, referenceHeight] = symbol.size;
  const sx = width / referenceWidth;
  const sy = height / referenceHeight;
  const [rx, ry] = stoveFrameRadii(symbol, width, height);
  const frame = `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}"
    rx="${rx}" ry="${ry}"/>`;
  const burners = symbol.burners.map(([left, top]) =>
    burnerDrawing(left * sx - width / 2, top * sy - height / 2, sx, sy));
  return frame + burners.join('');
}
