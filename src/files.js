import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import CRC32 from 'crc-32';
import { floors, isWallSegment, layers, lengthOf, OBJECT_LIMIT, PART_DESIGNS, PART_STROKE, parts, PROJECT_VERSION, roomColors, syncOpenings, TEXT_FONTS, textFontId, uid, WASHER_DASH } from './model.js';
import { renderScene, svgDocument } from './scene.js';
import gothicUrl from '../assets/NotoSansJP-Regular.ttf?url';
import minchoUrl from '../assets/NotoSerifJP-Regular.ttf?url';
import maruUrl from '../assets/ZenMaruGothic-Regular.ttf?url';
import bizUrl from '../assets/BIZUDPGothic-Regular.ttf?url';
import mplusUrl from '../assets/MPLUS1p-Regular.ttf?url';
import zenKakuUrl from '../assets/ZenKakuGothicNew-Regular.ttf?url';
import kiwiUrl from '../assets/KiwiMaru-Regular.ttf?url';
import shipporiUrl from '../assets/ShipporiMincho-Regular.ttf?url';

const fontUrls = {
  gothic: gothicUrl, mincho: minchoUrl, maru: maruUrl,
  biz: bizUrl, mplus: mplusUrl, zenKaku: zenKakuUrl, kiwi: kiwiUrl, shippori: shipporiUrl,
};

const MB = 1024 * 1024;
export const UNDERLAY_LIMIT = 50 * MB;
const JSON_LIMIT = 12 * MB;
export const PROJECT_LIMIT = 64 * MB;
const imageTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const underlayFormats = new Set(['pdf', ...Object.keys(imageTypes)]);
const underlayPath = format => 'assets/underlay.' + format;
const assetLimits = new Map([
  ['project.json', JSON_LIMIT],
  ...Array.from(underlayFormats, format => [underlayPath(format), UNDERLAY_LIMIT]),
]);
const number = (value, min = -1e6, max = 1e6) => Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isInteger(value) && number(value, min, max);
const point = value => Array.isArray(value) && value.length === 2 && value.every(n => number(n));
const flag = value => typeof value === 'boolean';
const hex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const string = (value, max) => typeof value === 'string' && value.length <= max;

function ensure(condition, message = '制作ファイルの内容に誤りがあります。') {
  if (!condition) throw new Error(message);
}

function validateProject(doc, underlay, assetPath) {
  ensure(doc && typeof doc === 'object');
  ensure([1, 2, PROJECT_VERSION].includes(doc.version), 'この制作ファイルの形式バージョンには対応していません。');
  ensure(string(doc.name, 120) && number(doc.width, 100, 100000) && number(doc.height, 100, 100000));
  ensure(Array.isArray(doc.layers) && doc.layers.length === layers.length);
  const layerIds = new Set(layers.map(layer => layer.id));
  for (const layer of doc.layers) ensure(layer && layerIds.delete(layer.id) && flag(layer.visible) && flag(layer.locked));
  const legacy = doc.version < PROJECT_VERSION;
  ensure(Array.isArray(doc.objects) && doc.objects.length <= (legacy ? 5000 : OBJECT_LIMIT), '図形の情報または数に問題があります。');
  const ids = new Map();
  for (const item of doc.objects) {
    ensure(item && string(item.id, 120) && item.id.length && item.id !== 'underlay' && !ids.has(item.id));
    ids.set(item.id, item);
    if (item.wallGroup !== undefined) {
      ensure(isWallSegment(item) && string(item.wallGroup, 120) && item.wallGroup.length > 0);
    }
    if (isWallSegment(item)) {
      ensure(point(item.a) && point(item.b) && number(item.width, 1, 80) && lengthOf(item.a, item.b) >= 1);
      if (item.dashed !== undefined) ensure(flag(item.dashed));
    } else if (item.layer === 'floor' || item.layer === 'color') {
      ensure(Array.isArray(item.points) && item.points.length >= 3 && item.points.length <= 1000
        && item.points.every(point));
      if (legacy || item.layer === 'color') ensure(hex(item.fill));
      if (!legacy && item.layer === 'color') ensure(Object.hasOwn(roomColors, item.room));
      const oldSolidFloor = legacy && ['wet', 'storage', 'entry', 'plain'].includes(item.preset);
      if (item.layer === 'floor') ensure((Object.hasOwn(floors, item.preset) || oldSolidFloor)
        && ['vertical', 'horizontal'].includes(item.direction) && [4, 6, 8].includes(item.tatami)
        && number(item.spacing, 3, 150));
    } else if (item.layer === 'text') {
      ensure(point(item.at) && string(item.value, 500) && number(item.size, 4, 300) && number(item.angle));
      if (item.vertical !== undefined) ensure(flag(item.vertical));
      if (item.font !== undefined) ensure(string(item.font, 20) && Object.hasOwn(TEXT_FONTS, item.font), '文字の書体に対応していません。');
    } else {
      ensure(Object.hasOwn(parts, item.kind) && parts[item.kind].layer === item.layer && point(item.at)
        && number(item.angle) && number(item.w, 4, 50000) && number(item.h, 1, 50000)
        && flag(item.flipX) && flag(item.flipY));
      if (item.kind === 'column') ensure(item.a === undefined && item.b === undefined && item.points === undefined);
      if (item.wallId !== undefined) ensure(item.layer === 'opening' && string(item.wallId, 120) && number(item.t, 0, 1));
      if (item.variant !== undefined) {
        ensure(Object.hasOwn(PART_DESIGNS, item.kind) && string(item.variant, 20)
          && Object.hasOwn(PART_DESIGNS[item.kind].choices, item.variant));
      }
      if (item.strokeWidth !== undefined) {
        ensure(number(item.strokeWidth, PART_STROKE.min, PART_STROKE.max));
      }
      for (const value of [item.dashLength, item.dashGap]) {
        if (value !== undefined) ensure(item.kind === 'washer' && number(value, WASHER_DASH.min, WASHER_DASH.max));
      }
    }
  }
  for (const item of doc.objects) {
    if (item.wallId === undefined) continue;
    const wall = ids.get(item.wallId);
    ensure(isWallSegment(wall) && lengthOf(wall.a, wall.b) + 0.001 >= item.w, '建具と壁の対応が正しくありません。');
  }
  if (doc.underlay !== null) {
    const info = doc.underlay;
    const format = doc.version === 1 ? 'pdf' : info?.format;
    ensure(underlayFormats.has(format), '制作ファイルの下絵の形式に対応していません。');
    ensure(underlay?.length && assetPath === underlayPath(format), '下絵ファイルが制作ファイルに入っていません。');
    ensure(underlay.length <= UNDERLAY_LIMIT, '下絵ファイルは50 MBまでです。');
    ensure(info && string(info.name, 255) && integer(info.page, 1, format === 'pdf' ? 100000 : 1) && point(info.at)
      && number(info.angle) && number(info.scale, 0.01, 50) && number(info.opacity, 0, 1)
      && number(info.naturalWidth, 1, 100000) && number(info.naturalHeight, 1, 100000));
  } else ensure(!underlay, '下絵の参照情報がありません。');
}

// Read the central directory before inflating. Only known filenames and bounded
// decoded sizes are accepted, and the inflated contents must match their CRCs.
function directoryEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557)) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
    end--;
  }
  ensure(end >= 0 && end >= bytes.length - 65557, 'ZIPが壊れています。');
  ensure(view.getUint32(end + 4, true) === 0, '分割ZIPには対応していません。');
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  ensure(count > 0 && count <= 2 && offset + directorySize === end && view.getUint16(end + 8, true) === count);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    ensure(offset + 46 <= end && view.getUint32(offset, true) === 0x02014b50);
    const length = view.getUint16(offset + 28, true);
    const next = offset + 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    ensure(next <= end && (view.getUint16(offset + 8, true) & 1) === 0);
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + length));
    const size = view.getUint32(offset + 24, true);
    const crc = view.getUint32(offset + 16, true);
    ensure(assetLimits.has(name) && !entries.has(name) && size <= assetLimits.get(name), '制作ファイルの構成またはサイズに問題があります。');
    entries.set(name, { size, crc });
    offset = next;
  }
  ensure(offset === end && entries.has('project.json'));
  return entries;
}

function migrateProject(doc) {
  if (doc.version === PROJECT_VERSION) return;
  if (doc.version === 1 && doc.underlay) doc.underlay.format = 'pdf';

  const floorIndex = doc.layers.findIndex(layer => layer.id === 'floor');
  const colorIndex = doc.layers.findIndex(layer => layer.id === 'color');
  const floorLayer = doc.layers[floorIndex];
  const colorLayer = doc.layers[colorIndex];
  if (!doc.objects.some(item => item.layer === 'color')) {
    Object.assign(colorLayer, { visible: floorLayer.visible, locked: floorLayer.locked });
  }
  if (floorIndex < colorIndex) {
    [doc.layers[floorIndex], doc.layers[colorIndex]] = [colorLayer, floorLayer];
  }

  const roomForFill = fill => Object.keys(roomColors).find(key => roomColors[key].color === fill.toLowerCase()) ?? 'custom';
  const oldFloorColors = [];
  const objects = [];
  const usedIds = new Set(doc.objects.map(item => item.id));
  for (const item of doc.objects) {
    if (item.layer !== 'floor') {
      if (item.layer === 'color') item.room = roomForFill(item.fill);
      objects.push(item);
      continue;
    }
    const { fill, ...pattern } = item;
    let id = item.id;
    if (Object.hasOwn(floors, item.preset)) {
      objects.push(pattern);
      do { id = uid(); } while (usedIds.has(id));
      usedIds.add(id);
    }
    oldFloorColors.push({ id, layer: 'color', points: structuredClone(item.points), fill, room: roomForFill(fill) });
  }
  doc.objects = [...oldFloorColors, ...objects];
  doc.version = PROJECT_VERSION;
}

export async function readProject(file) {
  ensure(file.size <= PROJECT_LIMIT, '制作ファイルは64 MBまでです。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = directoryEntries(bytes);
  const decoded = unzipSync(bytes, { filter: entry => entries.get(entry.name)?.size === entry.originalSize });
  for (const [name, { size, crc }] of entries) {
    const data = decoded[name];
    ensure(data?.length === size && (CRC32.buf(data) >>> 0) === crc, '制作ファイルが破損しています。');
  }
  let doc;
  try {
    doc = JSON.parse(strFromU8(decoded['project.json']));
  } catch {
    throw new Error('図面データのJSONを読み込めません。');
  }
  const assetPath = [...entries.keys()].find(name => name !== 'project.json');
  const underlay = assetPath ? decoded[assetPath] : null;
  validateProject(doc, underlay, assetPath);
  migrateProject(doc);
  for (const wall of doc.objects.filter(isWallSegment)) syncOpenings(doc, wall.id);
  return { doc, underlay };
}

export function saveProject(doc, underlay) {
  const assetPath = doc.underlay ? underlayPath(doc.underlay.format) : null;
  validateProject(doc, underlay, assetPath);
  const json = strToU8(JSON.stringify(doc));
  ensure(json.length <= JSON_LIMIT, '図面データが大きすぎます。');
  const files = { 'project.json': json };
  if (underlay) files[assetPath] = [underlay, { level: 0 }];
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

let pdfEngine;
async function loadPdfEngine() {
  if (!pdfEngine) {
    pdfEngine = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      .then(([engine, worker]) => {
        engine.GlobalWorkerOptions.workerSrc = worker.default;
        return engine;
      }).catch(error => { pdfEngine = null; throw error; });
  }
  return pdfEngine;
}

async function openPdf(bytes) {
  ensure(bytes?.length > 0 && bytes.length <= UNDERLAY_LIMIT, '下絵PDFは50 MBまでです。');
  const engine = await loadPdfEngine();
  const base = new URL('pdfjs/', document.baseURI).href;
  const task = engine.getDocument({
    data: bytes.slice(), cMapUrl: base + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/', wasmUrl: base + 'wasm/', iccUrl: base + 'iccs/',
    isEvalSupported: false,
  });
  try {
    return await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    if (error.name === 'PasswordException') throw new Error('パスワード保護されたPDFは、保護を解除してから読み込んでください。');
    throw new Error('PDFを読み込めませんでした。ファイルを確認してください。');
  }
}

async function rasterPdfPage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  ensure(number(width, 1, 100000) && number(height, 1, 100000), 'PDFページのサイズに対応していません。');
  const viewport = page.getViewport({ scale: Math.min(3, 2400 / Math.max(width, height)) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({ canvas, viewport, background: '#ffffff' }).promise;
  const image = await canvasBlob(canvas, 'image/png');
  page.cleanup();
  return { width, height, image };
}

export function detectImageFormat(bytes) {
  const startsWith = (signature, offset = 0) => signature.every((byte, i) => bytes[i + offset] === byte);
  if (startsWith([137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
  if (startsWith([255, 216, 255])) return 'jpg';
  if (startsWith([82, 73, 70, 70]) && startsWith([87, 69, 66, 80], 8)) return 'webp';
  return null;
}

export async function renderUnderlay(bytes, format, page = 1) {
  if (format === 'pdf') {
    const pdf = await openPdf(bytes);
    try {
      ensure(page <= pdf.numPages, '下絵のページ番号がPDFに存在しません。');
      return { ...await rasterPdfPage(pdf, page), count: pdf.numPages };
    } finally {
      await pdf.loadingTask.destroy().catch(() => {});
    }
  }

  ensure(detectImageFormat(bytes) === format, '下絵の画像形式が一致しません。');
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: imageTypes[format] }));
  } catch {
    throw new Error('画像を読み込めませんでした。ファイルを確認してください。');
  }
  try {
    const { width, height } = bitmap;
    ensure(number(width, 1, 100000) && number(height, 1, 100000), '下絵画像のサイズに対応していません。');
    const scale = Math.min(1, 2400 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { width, height, image: await canvasBlob(canvas, 'image/png'), count: 1 };
  } finally {
    bitmap.close();
  }
}

export function canvasBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('画像を生成できませんでした。'));
  }, mime, quality));
}

export function download(blob, name, extension) {
  const safeName = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || '間取り図';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName + '.' + extension;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const fontPromises = new Map();
function outlineFont(id) {
  if (!fontPromises.has(id)) {
    const pending = Promise.all([import('fontkit'), fetch(fontUrls[id])])
      .then(async ([fontkit, response]) => {
        ensure(response.ok, '書き出し用フォントを読み込めませんでした。');
        return fontkit.create(new Uint8Array(await response.arrayBuffer()));
      }).catch(error => {
        fontPromises.delete(id);
        throw error;
      });
    fontPromises.set(id, pending);
  }
  return fontPromises.get(id);
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('下絵の読み込みに失敗しました。'));
    reader.readAsDataURL(blob);
  });
}

async function monochromeImage(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  context.putImageData(pixels, 0, 0);
  return canvasBlob(canvas, 'image/png');
}

export async function exportSetup(doc, options, image, measuredHost) {
  const { mono, includeUnderlay } = options;
  const fontIds = doc.layers.find(layer => layer.id === 'text').visible
    ? new Set(doc.objects.filter(item => item.layer === 'text').map(textFontId)) : [];
  const fonts = new Map(await Promise.all(Array.from(fontIds, async id => [id, await outlineFont(id)])));
  const underlayImage = includeUnderlay && image ? await toDataUrl(mono ? await monochromeImage(image) : image) : '';
  const drawing = renderScene(doc, { mono, showUnderlay: includeUnderlay, underlayImage, fonts });
  ensure(drawing.trim(), '書き出す図形がありません。表示中のレイヤーを確認してください。');
  measuredHost.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g>' + drawing + '</g></svg>';
  const group = measuredHost.querySelector('g');
  const { x, y, width, height } = group.getBBox();
  measuredHost.replaceChildren();
  ensure(width || height, '書き出す図形がありません。');
  const stroke = doc.layers.find(layer => layer.id === 'wall').visible
    ? doc.objects.reduce((max, item) => isWallSegment(item) ? Math.max(max, item.width) : max, 0) : 0;
  const visibleLayers = new Set(doc.layers.filter(layer => layer.visible).map(layer => layer.id));
  const partStroke = doc.objects.reduce((max, item) =>
    (item.layer === 'opening' || item.layer === 'fixture') && visibleLayers.has(item.layer) ? Math.max(max, item.strokeWidth ?? 0) : max, 0);
  const pad = options.margin + Math.max(3, stroke / 2, partStroke / 2);
  const box = { x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2 };
  return { drawing, box };
}

export async function makeExport({ drawing, box }, options) {
  if (options.format === 'svg') return new Blob([svgDocument(drawing, box)], { type: 'image/svg+xml;charset=utf-8' });
  if (options.format === 'pdf') {
    const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: box.width > box.height ? 'landscape' : 'portrait', compress: true });
    const margin = 10;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const scale = Math.min((pageWidth - 2 * margin) / box.width, (pageHeight - 2 * margin) / box.height);
    const width = box.width * scale;
    const height = box.height * scale;
    const element = new DOMParser().parseFromString(svgDocument(drawing, box), 'image/svg+xml').documentElement;
    await pdf.svg(element, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
    return pdf.output('blob');
  }
  const scale = options.pixels / Math.max(box.width, box.height);
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const url = URL.createObjectURL(new Blob([svgDocument(drawing, box, width, height)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await canvasBlob(canvas, options.format === 'jpg' ? 'image/jpeg' : 'image/png', options.quality / 100);
  } finally {
    URL.revokeObjectURL(url);
  }
}
