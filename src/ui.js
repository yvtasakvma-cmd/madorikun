import { floors, layers, parts, roomColors } from './model.js';
import { escapeHtml, partDrawing } from './scene.js';

const icons = {
  logo: 'M3 3h18v18H3z M3 10h8v11 M11 16h5 M16 16v5 M15 3v9h6',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  open: 'M3 8V5h6l2 2h10v3M3 8v11h16l3-9H7l-4 9',
  save: 'M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7',
  export: 'M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6',
  select: 'm5 3 14 10-7 1-3 7z',
  floor: 'M3 4h18v16H3zM9 4v16m6-16v16M3 11h6m6 2h6',
  wall: 'M3 5h18v14H3zM3 12h18M8 5v7m8 0v7',
  door: 'M4 20V4h15v16M4 20h16M8 20V6l8 3v11M11 14h.1',
  bath: 'M3 13h18v2a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 13V6a3 3 0 1 1 6 0M7 19l-1 2m11-2 1 2',
  text: 'M4 6V4h16v2M12 4v16M8 20h8',
  palette: 'M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 1.4-3.4 1.6 1.6 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9zM7 11h.1M10 7h.1m5 0h.1m3 4h.1',
  file: 'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h6',
  undo: 'M9 5 4 10l5 5m-5-5h10a5 5 0 0 1 0 10h-3',
  redo: 'm15 5 5 5-5 5m5-5H10a5 5 0 0 0 0 10h3',
  zoom: 'M20 20l-4.4-4.4M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM7 10h6m-3-3v6',
  fit: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',
  layers: 'm12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5',
  eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeoff: 'm3 3 18 18M10 6a13 13 0 0 1 2 0c6 0 10 6 10 6a17 17 0 0 1-3 3M6 7.5A17 17 0 0 0 2 12s4 6 10 6a13 13 0 0 0 4-.7',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4m-4 4v2',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7-2.6m-3 10.6v2',
  settings: 'M5 4v16M12 4v16m7-16v16M2 8h6m1 7h6m1-5h6',
  close: 'm5 5 14 14M19 5 5 19',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9a2.6 2.6 0 0 1 5 1c0 1.6-2.5 2-2.5 4m0 3h.1',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  flip: 'M12 3v18M9 6l-6 11h6zm6 0 6 11h-6z',
  rotate: 'M19 4v5h-5M19 9a8 8 0 1 0 1 6',
  upload: 'M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5',
  check: 'm4 12 5 5L20 6',
  grid: 'M4 4h16v16H4zM4 12h16M12 4v16',
};

export function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
}

const button = (action, iconName, label, className = 'button', title = label) =>
  `<button type="button" class="${className}" data-action="${action}" title="${title}" aria-label="${title}">${icon(iconName)}${label ? `<span>${label}</span>` : ''}</button>`;
const iconButton = (action, iconName, title) => button(action, iconName, '', 'icon-button', title);

export const tools = [
  { id: 'select', name: '選択', icon: 'select' },
  ...['floor', 'wall', 'opening', 'fixture', 'text', 'color', 'underlay'].map(id => layers.find(layer => layer.id === id)),
  { id: 'zoom', name: '虫眼鏡', icon: 'zoom' },
];

export function layout() {
  return `
    <header class="topbar">
      <div class="brand"><span class="brand-icon">${icon('logo', 22)}</span><span>まどりくん</span></div>
      <span class="top-divider"></span>
      <label class="project-title"><input id="project-name" aria-label="図面の名前" maxlength="120"><span id="dirty-dot" title="未保存の変更"></span></label>
      <div class="file-actions">
        ${button('new', 'plus', '新規', 'button quiet')}
        ${button('open', 'open', '開く', 'button quiet')}
        ${button('save', 'save', '保存', 'button bordered')}
        ${button('export', 'export', '書き出し', 'button primary')}
      </div>
    </header>
    <nav class="tool-strip" aria-label="作図ツール">
      <div class="tool-list">${tools.map(tool => `<button class="tool" type="button" data-tool="${tool.id}" aria-pressed="false" ${tool.id === 'zoom' ? 'title="虫眼鏡（Z）"' : ''}>${icon(tool.icon, 19)}<span>${tool.name}</span></button>`).join('')}</div>
      <div class="history-actions">${iconButton('undo', 'undo', '元に戻す（Ctrl＋Z）')}${iconButton('redo', 'redo', 'やり直す（Ctrl＋Y）')}</div>
    </nav>
    <div class="context-bar" id="context-bar"></div>
    <main class="workspace">
      <div class="canvas-area" id="canvas-area">
        <div class="canvas-title"><span class="canvas-indicator"></span>作図キャンバス</div>
        <svg id="stage" tabindex="0" aria-label="間取り図の編集キャンバス" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
          <g id="world">
            <rect id="paper" class="paper" x="0" y="0" fill="#ffffff"/>
            <g id="scene"></g>
            <g id="overlay"></g>
          </g>
        </svg>
        <div id="empty-note" class="empty-note" hidden>
          <span class="empty-icon">${icon('file', 28)}</span>
          <strong>PDFや画像をドロップ</strong>
          <span>壁や床ツールで直接描き始めることもできます</span>
          ${button('import', 'upload', '下絵を選ぶ', 'button bordered')}
        </div>
        <div class="drag-note" id="drag-note" hidden>${icon('upload', 30)}<strong>ファイルをドロップして読み込む</strong></div>
        <div class="zoom-controls" aria-label="表示倍率">
          ${iconButton('zoom-out', 'minus', '縮小（Ctrl＋−）')}
          <output id="zoom-value">100%</output>
          ${iconButton('zoom-in', 'plus', '拡大')}
          <span></span>${iconButton('fit', 'fit', '全体表示（Ctrl＋0）')}
        </div>
      </div>
      <aside class="sidebar" aria-label="図面の設定">
        <section class="side-section">
          <h2>${icon('layers', 18)}レイヤー</h2>
          <div id="layer-list"></div>
        </section>
        <section class="side-section detail-section">
          <h2>${icon('settings', 18)}<span id="detail-title">プロパティ</span></h2>
          <div id="inspector"></div>
        </section>
      </aside>
    </main>
    <footer class="statusbar">
      <span id="status" role="status"><i></i>準備完了</span>
      <span class="footer-meta"><span id="object-count"></span>${iconButton('help', 'help', 'キーボード操作')}</span>
    </footer>
    <input id="open-input" type="file" accept=".madori,.pdf,.png,.jpg,.jpeg,.webp" hidden>
    <input id="underlay-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden>
    <dialog id="export-dialog">
      <form id="export-form">
        <div class="dialog-heading"><h2>図面を書き出す</h2>${iconButton('close-dialog', 'close', '閉じる')}</div>
        <div class="export-body">
          <div id="export-preview" class="export-preview" aria-label="書き出しプレビュー"></div>
          <div class="export-options">
            <label class="stack-field">ファイル形式<select name="format"><option value="jpg">JPEG</option><option value="png">PNG</option><option value="pdf">PDF</option><option value="svg">SVG</option></select></label>
            <label class="stack-field">配色<select name="mode"><option value="color">カラー</option><option value="mono">白黒</option></select></label>
            <label class="stack-field" data-raster>長辺（px）<input name="pixels" type="number" min="240" max="6000" value="2000" required></label>
            <label class="stack-field" data-jpeg>JPEG画質（%）<input name="quality" type="number" min="10" max="100" value="92" required></label>
            <label class="stack-field">図面の余白<input name="margin" type="number" min="0" max="100" value="16" required></label>
            <label class="check-field"><input name="includeUnderlay" type="checkbox">下絵を含める</label>
          </div>
        </div>
        <div class="dialog-footer"><span id="export-status" role="status"></span><button type="submit" class="button primary">${icon('export')}書き出す</button></div>
      </form>
    </dialog>
    <dialog id="help-dialog">
      <div class="dialog-heading"><h2>キーボード操作</h2>${iconButton('close-dialog', 'close', '閉じる')}</div>
      <dl class="shortcut-list">
        <dt>Alt ＋ ドラッグ</dt><dd>選択した図形を複製して移動</dd>
        <dt>Shift ＋ 角をドラッグ</dt><dd>縦横比を保って拡大・縮小</dd>
        <dt>Shift ＋ クリック</dt><dd>作図時は自由な角度、選択時は図形を追加</dd>
        <dt>Space ＋ ドラッグ</dt><dd>キャンバスを移動</dd>
        <dt>Z</dt><dd>虫眼鏡に切り替え</dd>
        <dt>Ctrl ＋ 0 ／ −</dt><dd>全体表示 ／ 縮小</dd>
        <dt>Ctrl ＋ Z ／ Y</dt><dd>元に戻す ／ やり直す</dd>
        <dt>Delete ／ Esc</dt><dd>選択した図形を削除 ／ 操作を中断</dd>
      </dl>
    </dialog>
    <div id="measure" aria-hidden="true"></div>
  `;
}

export const numberField = (label, key, value, min, max, step = 1) =>
  `<label class="field">${label}<input type="number" data-field="${key}" value="${Number(value.toFixed(2))}" min="${min}" max="${max}" step="${step}"></label>`;

export const selectField = (label, key, value, options) =>
  `<label class="field">${label}<select data-field="${key}">${options.map(([id, name]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;

export const floorChoices = () => Object.entries(floors).map(([id, floor]) => [id, floor.name]);

export const roomChoices = () => Object.entries(roomColors).map(([id, room]) => [id, room.name]);

export const colorField = (key, fill) => `<label class="field color-field">塗り色<input type="color" value="${fill}" data-field="${key}"></label>`;

export function partPalette(layer, current) {
  return '<div class="part-palette">' + Object.entries(parts).filter(([, part]) => part.layer === layer).map(([id, part]) => {
    const [width, height] = part.size;
    const opening = layer === 'opening';
    const arc = ['swing', 'double', 'folding'].includes(id);
    const viewTop = arc ? -Math.max(id === 'swing' ? width : height, 12) - 5 : -height / 2 - 6;
    const viewBottom = arc ? 8 : height / 2 + 6;
    return `<button type="button" draggable="true" data-part="${id}" aria-pressed="${current === id}">
      <svg aria-hidden="true" viewBox="${-width / 2 - 6} ${viewTop} ${width + 12} ${viewBottom - viewTop}">${partDrawing(id, width, height, false, opening ? 7 : undefined)}</svg>
      <span>${part.name}</span></button>`;
  }).join('') + '</div>';
}

export function propertyMarkup(item) {
  if (item.layer === 'wall') return numberField('太さ', 'object-width', item.width, 1, 80);
  if (item.layer === 'floor') {
    const pattern = floors[item.preset].pattern;
    return selectField('種類', 'object-preset', item.preset, floorChoices())
      + (pattern ? selectField('向き', 'object-direction', item.direction, [['vertical', '縦'], ['horizontal', '横']]) : '')
      + (pattern === 'boards' ? numberField('板の間隔', 'object-spacing', item.spacing, 3, 150) : '')
      + (pattern === 'tatami' ? selectField('畳の枚数', 'object-tatami', String(item.tatami), [['4', '4枚'], ['6', '6枚'], ['8', '8枚']]) : '');
  }
  if (item.layer === 'color') return selectField('部屋の種別', 'object-room', item.room, roomChoices())
    + colorField('object-fill', item.fill);
  if (item.layer === 'text') return `<label class="stack-field">文字<textarea data-field="object-value" maxlength="500" rows="3">${escapeHtml(item.value)}</textarea></label>`
    + numberField('サイズ', 'object-size', item.size, 4, 300)
    + numberField('回転（°）', 'object-angle', item.angle, -360, 360);
  return numberField('幅', 'object-w', item.w, 4, 50000)
    + (item.layer === 'fixture' ? numberField('高さ', 'object-h', item.h, 1, 50000) : '')
    + (!item.wallId ? numberField('回転（°）', 'object-angle', item.angle, -360, 360) : '')
    + `<div class="property-actions">${iconButton('flip-x', 'flip', '左右反転')}${iconButton('flip-y', 'flip', '上下反転')}${!item.wallId ? iconButton('rotate', 'rotate', '90度回転') : ''}</div>`;
}

export const removeButton = () => button('delete', 'trash', '削除', 'button danger quiet');
export const importButton = () => button('import', 'upload', '下絵を選ぶ', 'button bordered compact');
