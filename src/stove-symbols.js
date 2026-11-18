// Dimensions and burner centers measured from the supplied reference drawings.
export const stoveSymbols = {
  stove2: { name: 'コンロ２口', size: [320, 216], burners: [[84, 108], [232, 110]] },
  stove3: { name: 'コンロ３口', size: [325, 260], burners: [[161, 75], [84, 188], [245, 190]] },
};

export function stoveDrawing(symbol, width, height) {
  const [referenceWidth, referenceHeight] = symbol.size;
  const sx = width / referenceWidth;
  const sy = height / referenceHeight;
  const round = 20;
  const frame = `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}"
    rx="${round * sx}" ry="${round * sy}"/>`;
  const burners = symbol.burners.map(([left, top]) => {
    const x = left * sx - width / 2;
    const y = top * sy - height / 2;
    const tab = (dx, dy) => `M${x + dx * 45 * sx} ${y + dy * 45 * sy}L${x + dx * 16 * sx} ${y + dy * 16 * sy}`;
    return `<ellipse cx="${x}" cy="${y}" rx="${42.5 * sx}" ry="${42.5 * sy}"/>
      <path d="${tab(-1, -1)}${tab(1, -1)}${tab(-1, 1)}${tab(1, 1)}"/>`;
  });
  return frame + burners.join('');
}
