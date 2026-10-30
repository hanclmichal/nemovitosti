// Small DOM helpers shared by the views.

export const $ = (sel, root = document) => root.querySelector(sel);

/** h('div', { class: 'x', onclick }, child, [children], 'text') */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export function put(el, ...kids) { el.replaceChildren(); append(el, kids); }

const SVGNS = 'http://www.w3.org/2000/svg';
/** s('circle', { cx: 1 }) — SVG element helper. */
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v != null && v !== false) el.setAttribute(k, String(v)); }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

/* ---------- toast ---------- */
let toastTimer = null;
export function toast(msg, ms = 2800) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- bottom sheet ---------- */
const sheetStack = [];
export function openSheet(title, content, opts = {}) {
  const panel = h('div', { class: 'sheet__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h('div', { class: 'sheet__head' },
      h('h2', { text: title }),
      opts.action || null,
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Zavřít', onclick: () => closeSheet() }, icon('close'))),
    h('div', { class: 'sheet__body' }, content));
  const back = h('div', { class: 'sheet__back', onclick: () => closeSheet() });
  const sheet = h('div', { class: 'sheet' }, back, panel);
  document.body.append(sheet);
  document.body.classList.add('lock');
  sheetStack.push({ sheet, onClose: opts.onClose, prevFocus: document.activeElement });
  requestAnimationFrame(() => { sheet.classList.add('in'); panel.focus({ preventScroll: true }); });
  return { close: closeSheet, panel };
}
export function closeSheet() {
  const top = sheetStack.pop();
  if (!top) return;
  top.sheet.remove();
  if (!sheetStack.length) document.body.classList.remove('lock');
  if (top.onClose) top.onClose();
  if (top.prevFocus && top.prevFocus.focus && top.prevFocus.isConnected) top.prevFocus.focus({ preventScroll: true });
}
export function closeAllSheets() { while (sheetStack.length) closeSheet(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetStack.length) closeSheet(); });

export function confirmSheet(title, text, okLabel, onOk, danger = false) {
  openSheet(title, [
    h('p', { class: 'muted', text }),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => closeSheet() }, 'Zrušit'),
      h('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), type: 'button', onclick: () => { closeSheet(); onOk(); } }, okLabel))
  ]);
}

/* ---------- icons (stroke icons drawn inline) ---------- */
const PATHS = {
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M4 20h16M4 20V4M8.5 15.5h.01M12 11h.01M16 13h.01M18.5 7.5h.01M10.5 8h.01',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  check: 'M5 12.5l4.5 4.5L19 7.5'
};
export function icon(name, cls = 'ico') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', PATHS[name] || '');
  svg.append(p);
  return svg;
}

/** External link that opens outside the app. */
export function extLink(href, text, cls = 'linkbtn') {
  return h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer' }, h('span', { text }), icon('external', 'ico ico--sm'));
}
