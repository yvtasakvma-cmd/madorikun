import { add, DEFAULT_TEXT_FONT, floors, isSlidingSymbol, isWallSegment, lengthOf, openingFrameDepth, PART_DESIGNS, partStrokeDefault, rotate, TEXT_FONTS, wallDashArray, wallJunctionCaps, wallSegments, washerDashDefault } from './model.js';
import { stoveDrawing, stoveSymbols } from './stove-symbols.js';
import { toiletPaths, toiletSymbols } from './toilet-symbols.js';
import { washerLabel } from './washer-label.js';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const pointList = points => points.map(point => point.join(',')).join(' ');
const ink = '#151b17';

export function partDrawing(kind, w, h, mono = false, frameDepth = 7, strokeWidth, variant = PART_DESIGNS[kind]?.default, { dashLength, dashGap } = {}) {
  const x = -w / 2;
  const y = -h / 2;
  const stroke = mono ? '#000000' : ink;
  const lineWidth = strokeWidth ?? partStrokeDefault(kind, variant);
  const stove = kind === 'kitchen' && Object.hasOwn(stoveSymbols, variant) ? stoveSymbols[variant] : null;
  const rect = (a, b, width, height, fill = 'none', radius = 0) =>
    `<rect x="${a}" y="${b}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"/>`;
  const line = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}"/>`;
  const circle = (cx, cy, r, fill = 'none') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  const depth = openingFrameDepth(kind, w, frameDepth);
  const frame = rect(x, -depth / 2, w, depth, '#ffffff');
  let body = '';
  switch (kind) {
    case 'column':
      return rect(x, y, w, h, stroke);
    case 'swing':
      body = frame + `<path d="M${x} 0V${-w} A${w} ${w} 0 0 1 ${-x} 0"/>`;
      break;
    case 'double':
      body = frame + `<path d="M${x} 0V${x} A${-x} ${-x} 0 0 1 0 0M${-x} 0V${x} A${-x} ${-x} 0 0 0 0 0"/>`;
      break;
    case 'folding':
      body = frame + `<path d="M${x} 0l${w / 5} ${-h} ${w / 5} ${h} ${w / 5} ${-h} ${w / 5} ${h}"/>`;
      break;
    case 'window':
    case 'sliding': {
      if (kind === 'sliding' && variant === 'pocket') {
        const seam = -w * 0.013;
        const rail = -depth * 0.2;
        const bandTop = depth * 0.12;
        body = frame + `<rect x="${seam}" y="${bandTop}" width="${-x - seam}" height="${depth / 2 - bandTop}" fill="${stroke}" stroke="none"/>`
          + line(x, rail, seam, rail)
          + `<path d="M${seam} ${rail}H${-x}" stroke-dasharray="${w * 0.03} ${w * 0.026}"/>`
          + line(seam, -depth / 2, seam, depth / 2);
      } else {
        const seam = w * 0.015;
        const lap = depth * 0.24;
        const rail = depth / 6;
        body = frame
          + line(x, -rail, seam + lap, -rail)
          + line(seam - lap, rail, -x, rail)
          + line(seam, -depth / 2, seam, depth / 2);
      }
      break;
    }
    case 'bath':
      body = rect(x, y, w, h, 'none', Math.min(w, h) * 0.06)
        + rect(x + w * 0.12, y + h * 0.09, w * 0.76, h * 0.82, 'none', Math.min(w, h) * 0.19)
        + circle(0, h * 0.32, w * 0.025);
      break;
    case 'basin':
      body = rect(x, y, w, h, 'none', 2)
        + `<ellipse cy="${h * 0.05}" rx="${w * 0.35}" ry="${h * 0.31}"/>`
        + circle(0, -h * 0.35, Math.min(w, h) * 0.05);
      break;
    case 'toilet':
      body = toiletPaths(toiletSymbols[variant], w, h).map(path => `<path d="${path}"/>`).join('');
      break;
    case 'kitchen': {
      if (stove) {
        body = stoveDrawing(stove, w, h);
        break;
      }
      const ring = Math.min(w * 0.043, h * 0.13);
      body = rect(x, y, w, h)
        + rect(w * -0.43, h * -0.35, w * 0.37, h * 0.7, 'none', Math.min(w, h) * 0.09)
        + line(w * 0.12, y, w * 0.12, -y)
        + circle(w * 0.26, h * -0.19, ring) + circle(w * 0.4, h * 0.17, ring)
        + circle(w * 0.23, h * 0.2, ring * 0.73);
      break;
    }
    case 'washer': {
      const dash = washerDashDefault(w, h);
      const insetX = w * 0.21;
      const insetY = h * 0.21;
      body = `<g stroke-dasharray="${dashLength ?? dash} ${dashGap ?? dash}">
        ${rect(x, y, w, h)}
        ${line(x, y, x + insetX, y + insetY)}
        ${line(-x, y, -x - insetX, y + insetY)}
        ${line(x, -y, x + insetX, -y - insetY)}
        ${line(-x, -y, -x - insetX, -y - insetY)}
      </g><path aria-label="洗濯機置場" fill="${stroke}" stroke="none"
        transform="scale(${w / 100} ${h / 100})" d="${washerLabel}"/>`;
      break;
    }
    case 'compass':
      body = circle(0, 3, Math.min(w, h) * 0.48)
        + `<path d="M0 ${-h / 2}L${w * 0.31} ${h * 0.29}L0 ${h * 0.13}L${-w * 0.31} ${h * 0.29}Z"/>`;
      break;
  }
  const square = isSlidingSymbol(kind) || kind === 'toilet' || Boolean(stove);
  return `<g fill="none" stroke="${stroke}" stroke-width="${lineWidth}" stroke-linecap="${square ? 'butt' : 'round'}"
    stroke-linejoin="${square ? 'miter' : 'round'}">${body}</g>`;
}

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function polygonBounds(points) {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [px, py] of points) {
    x = Math.min(x, px);
    y = Math.min(y, py);
    right = Math.max(right, px);
    bottom = Math.max(bottom, py);
  }
  return { x, y, width: right - x, height: bottom - y };
}

// Convert patterns to ordinary paths so SVG and PDF use the same geometry.
function clippedPattern(polygon, vertical, position, low, high) {
  const axes = point => vertical ? point : [point[1], point[0]];
  const intersections = [];
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = axes(polygon[i]);
    const [bx, by] = axes(polygon[(i + 1) % polygon.length]);
    if ((ax > position) === (bx > position)) continue;
    intersections.push(ay + (by - ay) * (position - ax) / (bx - ax));
  }
  intersections.sort((a, b) => a - b);
  let path = '';
  for (let i = 1; i < intersections.length; i += 2) {
    const start = Math.max(low, intersections[i - 1]);
    const end = Math.min(high, intersections[i]);
    if (end > start) path += `M${axes([position, start]).join(' ')}L${axes([position, end]).join(' ')}`;
  }
  return path;
}

function floorPattern(item, mono, interactive) {
  const pattern = floors[item.preset]?.pattern;
  if (!pattern) return '';
  const { x, y, width, height } = polygonBounds(item.points);
  const vertical = item.direction !== 'horizontal';
  if (!width || !height) return '';
  const start = vertical ? x : y;
  const span = vertical ? width : height;
  const low = vertical ? y : x;
  const high = low + (vertical ? height : width);
  let path = '';
  if (pattern === 'boards') {
    const spacing = Math.max(item.spacing, span / 500);
    for (let offset = span <= spacing ? span / 2 : spacing; offset < span; offset += spacing) {
      path += clippedPattern(item.points, vertical, start + offset, low, high);
    }
  } else {
    const count = item.tatami;
    const rows = count === 4 ? 2 : count === 6 ? 3 : 4;
    const split = start + span / 2;
    path += clippedPattern(item.points, vertical, split, low, high);
    for (let row = 1; row < rows; row++) {
      const pos = low + (high - low) * row / rows;
      path += clippedPattern(item.points, !vertical, pos, start, start + span);
    }
  }
  const hit = interactive ? `<path d="${path}" fill="none" stroke="transparent" stroke-width="5"/>` : '';
  return hit + `<path d="${path}" fill="none" stroke="${mono ? '#000000' : pattern === 'boards' ? '#8b8b83' : '#67675d'}" stroke-width="${pattern === 'boards' ? 0.8 : 1.25}"/>`;
}

const textLineSpacing = 1.22;
const textBaseline = 0.32;
const textSegmenter = new Intl.Segmenter('ja');
const verticalRotatedPunctuation = new Set('ー―〜～…‥「」『』【】〔〕〈〉《》（）［］｛｝()[]{}');
const splitCharacters = text => Array.from(textSegmenter.segment(text), entry => entry.segment);

function verticalTextLayout(value, size) {
  const columns = value.split('\n').map(splitCharacters);
  const rows = Math.max(1, ...columns.map(column => column.length));
  const step = size * textLineSpacing;
  return {
    columns, rows, step,
    xAt: column => ((columns.length - 1) / 2 - column) * step,
    yAt: row => (row - (rows - 1) / 2) * step,
  };
}

export function verticalTextCaret(value, position, size) {
  const layout = verticalTextLayout(value, size);
  const preceding = value.slice(0, position).split('\n');
  const column = preceding.length - 1;
  const row = splitCharacters(preceding[column]).length;
  return [layout.xAt(column), layout.yAt(row) - layout.step / 2];
}

export function objectBounds(item) {
  if (item.points) return polygonBounds(item.points);
  if (item.a) return polygonBounds([item.a, item.b]);
  if (item.layer === 'text') {
    if (item.vertical) {
      const { columns, rows, step } = verticalTextLayout(item.value, item.size);
      return rotatedBounds(item.at, (columns.length - 1) * step + item.size, rows * step, 0);
    }
    const lines = item.value.split('\n');
    const width = Math.max(...lines.map(line => [...line].length), 1) * item.size;
    const height = lines.length * item.size * 1.25;
    return rotatedBounds(item.at, width, height, item.angle);
  }
  if (item.layer === 'opening' && ['swing', 'double', 'folding'].includes(item.kind)) {
    const extent = item.kind === 'swing' ? item.w : item.h;
    const y = item.flipY ? extent : -extent;
    return polygonBounds([[-item.w / 2, 0], [item.w / 2, 0], [item.w / 2, y], [-item.w / 2, y]]
      .map(point => add(item.at, rotate(point, item.angle))));
  }
  return rotatedBounds(item.at, item.w, item.h, item.angle);
}

export function rotatedBounds(center, width, height, angle) {
  return polygonBounds([[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]]
    .map(point => add(center, rotate(point, angle))));
}

const svgCommands = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' };

function outlineFontLine(font, line, size, baseline, center) {
  const shaped = font.layout(line);
  const scale = size / font.unitsPerEm;
  let x = center - shaped.advanceWidth * scale / 2;
  let y = baseline;
  let path = '';
  for (let i = 0; i < shaped.glyphs.length; i++) {
    const position = shaped.positions[i];
    const offsetX = x + position.xOffset * scale;
    const offsetY = y - position.yOffset * scale;
    for (const { command, args } of shaped.glyphs[i].path.commands) {
      const coords = args.map((value, axis) => Number((axis % 2
        ? offsetY - value * scale : offsetX + value * scale).toFixed(3)));
      path += svgCommands[command] + coords.join(' ');
    }
    x += position.xAdvance * scale;
    y -= position.yAdvance * scale;
  }
  return path;
}

function textDrawing(item, color, halo, fonts) {
  const id = item.font ?? DEFAULT_TEXT_FONT;
  const font = fonts?.get(id);
  const family = TEXT_FONTS[id].family;
  const run = (text, x, y, rotateGlyph = false) => {
    const transform = rotateGlyph ? ` transform="rotate(90 ${x} ${y - item.size * textBaseline})"` : '';
    if (font) return `<path d="${outlineFontLine(font, text, item.size, y, x)}"${transform}/>`;
    return `<text x="${x}" y="${y}" font-size="${item.size}" font-family="${family}, sans-serif" text-anchor="middle" xml:space="preserve"${transform}>${escapeHtml(text)}</text>`;
  };
  let glyphs;
  if (item.vertical) {
    const { columns, xAt, yAt } = verticalTextLayout(item.value, item.size);
    glyphs = columns.flatMap((column, index) => {
      const x = xAt(index);
      return column.map((character, row) =>
        run(character, x, yAt(row) + item.size * textBaseline, verticalRotatedPunctuation.has(character)));
    }).join('');
  } else {
    const lines = item.value.split('\n');
    glyphs = lines.map((line, i) =>
      run(line, 0, (i - (lines.length - 1) / 2) * item.size * textLineSpacing + item.size * textBaseline)).join('');
  }
  return `<g transform="translate(${item.at.join(' ')}) rotate(${item.vertical ? 0 : item.angle})">
    <g fill="${halo}" stroke="${halo}" stroke-linejoin="round" stroke-width="4">${glyphs}</g>
    <g class="text-glyphs" fill="${color}">${glyphs}</g>
  </g>`;
}

export function wallDrawingGeometry(objects) {
  const walls = objects.filter(isWallSegment);
  const openings = new Map();
  for (const item of objects) {
    if (item.layer !== 'opening' || !item.wallId) continue;
    if (!openings.has(item.wallId)) openings.set(item.wallId, []);
    openings.get(item.wallId).push(item);
  }
  const caps = wallJunctionCaps(walls, openings);
  return new Map(walls.map(wall => [
    wall.id, { wall, segments: wallSegments(wall, openings.get(wall.id), caps.get(wall.id)) },
  ]));
}

function strokeIntersectsBox(a, b, width, box) {
  const length = lengthOf(a, b);
  const ux = length ? (b[0] - a[0]) / length : 1;
  const uy = length ? (b[1] - a[1]) / length : 0;
  const dx = (a[0] + b[0]) / 2 - (box.x + box.width / 2);
  const dy = (a[1] + b[1]) / 2 - (box.y + box.height / 2);
  return [[1, 0], [0, 1], [ux, uy], [-uy, ux]].every(([x, y]) => {
    const extent = (length * Math.abs(x * ux + y * uy) + width * Math.abs(-x * uy + y * ux)
      + box.width * Math.abs(x) + box.height * Math.abs(y)) / 2;
    return Math.abs(x * dx + y * dy) <= extent + 1e-7;
  });
}

export function objectIntersectsBox(item, box, segments) {
  if (isWallSegment(item)) return segments.some(([a, b]) => strokeIntersectsBox(a, b, item.width, box));
  const bounds = objectBounds(item);
  if (bounds.x > box.x + box.width || bounds.x + bounds.width < box.x
    || bounds.y > box.y + box.height || bounds.y + bounds.height < box.y) return false;
  if (!item.points) return true;
  return pointInPolygon([box.x, box.y], item.points) || item.points.some((p, i) =>
    strokeIntersectsBox(p, item.points[(i + 1) % item.points.length], 0, box));
}

export function renderScene(doc, { mono = false, underlayImage = '', showUnderlay = true, fonts = null, entries = false } = {}) {
  const geometry = wallDrawingGeometry(doc.objects);
  const grouped = new Map(doc.layers.map(layer => [layer.id, []]));
  for (const item of doc.objects) grouped.get(item.layer)?.push(item);
  const fills = doc.layers.filter(layer => layer.visible && layer.id === 'color')
    .flatMap(layer => grouped.get(layer.id));
  const color = mono ? '#000000' : ink;
  const drawings = doc.layers.filter(layer => layer.visible).flatMap(layer => {
    if (layer.id === 'underlay') {
      const info = doc.underlay;
      if (!info || !showUnderlay || !underlayImage) return [];
      const w = info.naturalWidth * info.scale;
      const h = info.naturalHeight * info.scale;
      return [{ id: 'underlay', layer: layer.id, drawing: `<image href="${underlayImage}" x="${info.at[0] - w / 2}" y="${info.at[1] - h / 2}" width="${w}" height="${h}"
        xlink:href="${underlayImage}" opacity="${info.opacity}" transform="rotate(${info.angle} ${info.at.join(' ')})"/>` }];
    }
    return grouped.get(layer.id).map(item => {
      let drawing = '';
      if (item.layer === 'floor') {
        drawing = floorPattern(item, mono, entries);
      } else if (item.layer === 'color') {
        drawing = `<polygon points="${pointList(item.points)}" fill="${mono ? '#ffffff' : item.fill}"/>`;
      } else if (isWallSegment(item)) {
        const segments = geometry.get(item.id).segments;
        drawing = segments.map(([a, b]) => `<path d="M${a.join(' ')}L${b.join(' ')}"/>`).join('');
        const dash = item.dashed ? ` stroke-dasharray="${wallDashArray(item.width)}"` : '';
        drawing = `<g fill="none" stroke="${color}" stroke-width="${item.width}"${dash}>${drawing}</g>`;
      } else if (item.layer === 'text') {
        const surface = fills.findLast(fill => pointInPolygon(item.at, fill.points));
        const halo = mono ? '#ffffff' : surface?.fill ?? '#ffffff';
        drawing = textDrawing(item, color, halo, fonts);
      } else {
        const frame = geometry.get(item.wallId)?.wall.width ?? Math.min(10, Math.max(4, item.h));
        const hit = entries && item.layer === 'fixture'
          ? `<rect x="${-item.w / 2}" y="${-item.h / 2}" width="${item.w}" height="${item.h}" fill="transparent"/>` : '';
        drawing = `<g transform="translate(${item.at.join(' ')}) rotate(${item.angle}) scale(${item.flipX ? -1 : 1} ${item.flipY ? -1 : 1})">
          ${hit}${partDrawing(item.kind, item.w, item.h, mono, frame, item.strokeWidth, item.variant, item)}
        </g>`;
      }
      return { id: item.id, layer: layer.id, drawing };
    });
  });
  return entries ? drawings : drawings.map(({ drawing }) => '<g>' + drawing + '</g>').join('');
}

export function svgDocument(drawing, box, width = box.width, height = box.height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#ffffff"/>
    ${drawing}
  </svg>`;
}
