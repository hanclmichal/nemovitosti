// App shell: routing, top bar, sync indicator, service worker updates.
import { store, load, onChange, setSyncHook, pendingCount } from './store.js';
import { sync, onStatus, status } from './sync.js';
import { persistStorage } from './db.js';
import { $, put, h, icon, toast, closeAllSheets } from './ui.js';
import { plural, timeCz } from './format.js';
import * as list from './views/list.js';
import * as detail from './views/detail.js';
import * as chart from './views/chart.js';
import * as add from './views/add.js';
import * as settings from './views/settings.js';
import { applyProfile, openProfiles } from './views/profile.js';

export const APP_VERSION = '1.2.0';

const routes = [
  { re: /^#?\/?$/, view: list, tab: 'byty' },
  { re: /^#\/byty$/, view: list, tab: 'byty' },
  { re: /^#\/byt\/([a-z0-9-]+)$/, view: detail, tab: 'byty', back: true },
  { re: /^#\/graf$/, view: chart, tab: 'graf' },
  { re: /^#\/pridat$/, view: add, tab: 'pridat' },
  { re: /^#\/nastaveni$/, view: settings, tab: null, back: true }
];

let current = null;
const scrollMemo = new Map();
const navStack = [];

function match(hash) {
  for (const r of routes) {
    const m = hash.match(r.re);
    if (m) return { route: r, params: m.slice(1) };
  }
  return { route: routes[0], params: [] };
}

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}
function back() {
  if (navStack.length > 1) history.back();
  else location.replace('#/byty');
}

function route() {
  closeAllSheets();
  if (current) {
    scrollMemo.set(current.key, window.scrollY);
    if (current.ctx && current.ctx.destroy) current.ctx.destroy();
  }
  const hash = location.hash || '#/byty';
  if (navStack.length > 1 && navStack[navStack.length - 2] === hash) navStack.pop();
  else if (navStack[navStack.length - 1] !== hash) navStack.push(hash);
  if (store.ready && !store.conn && !store.byty.size && hash !== '#/nastaveni') { location.replace('#/nastaveni'); return; }
  const { route: r, params } = match(hash);
  const container = $('#view');
  container.replaceChildren();
  container.className = 'view view--' + (r.tab || 'other');
  const ctx = r.view.render(container, params, nav) || {};
  current = { key: hash, route: r, params, ctx };
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === r.tab ? 'page' : 'false'));
  $('#barBack').hidden = !r.back;
  const y = scrollMemo.get(hash);
  window.scrollTo(0, ctx.keepScroll === false ? 0 : (y || 0));
}

function setTitle(text) { $('#barTitle').textContent = text; document.title = text === 'Byty' ? 'Nemovitosti' : `${text} – Nemovitosti`; }
const nav = { go, back, setTitle, applyTheme: t => applyTheme(t), runSync: m => runSync(m), version: APP_VERSION };

function refreshView() {
  if (!current) return;
  if (current.ctx && current.ctx.refresh) { current.ctx.refresh(); return; }
}

/* ---------- sync indicator ---------- */
function renderSync() {
  const btn = $('#syncBtn');
  const pend = pendingCount();
  let state, text;
  if (!store.conn) { state = 'off'; text = 'Nepřipojeno'; }
  else if (status.running) { state = 'busy'; text = status.total ? `${status.phase} ${status.done}/${status.total}` : status.phase || 'Synchronizuji'; }
  else if (status.error && status.error.code === 'offline') { state = 'offline'; text = pend ? `Offline, čeká ${pend}` : 'Offline'; }
  else if (status.error) { state = 'error'; text = 'Chyba synchronizace'; }
  else if (pend) { state = 'pending'; text = `Čeká ${pend} ${plural(pend, 'změna', 'změny', 'změn')}`; }
  else {
    state = 'ok';
    const t = store.lastSync ? new Date(store.lastSync) : null;
    const sameDay = t && t.toDateString() === new Date().toDateString();
    text = !t ? 'Synchronizováno' : sameDay ? `Aktuální ${t.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}` : `Aktuální k ${timeCz(t)}`;
  }
  btn.dataset.state = state;
  btn.setAttribute('aria-label', text);
  btn.title = text;
  put($('#syncText'), text);
}

async function runSync(manual) {
  if (!store.conn) { if (manual) location.hash = '#/nastaveni'; return; }
  try {
    const r = await sync();
    if (r.novych) toast(`${r.novych} ${plural(r.novych, 'nový byt', 'nové byty', 'nových bytů')} od hlídacího psa.`);
    else if (manual) toast(r.pulled || r.pushed ? `Hotovo: staženo ${r.pulled}, odesláno ${r.pushed}.` : 'Vše je aktuální.');
  } catch (e) {
    if (manual || e.code !== 'offline') toast(e.message);
  }
}

/* ---------- theme ---------- */
export function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  applyProfile();
}

/* ---------- service worker ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const show = w => {
      const bar = $('#update');
      bar.hidden = false;
      bar.querySelector('button').onclick = () => { w.postMessage('skipWaiting'); };
    };
    if (reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) show(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}

/* ---------- start ---------- */
async function start() {
  let theme = 'system';
  try { theme = localStorage.getItem('theme') || 'system'; } catch (e) { /* storage blocked */ }
  applyTheme(theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme((() => { try { return localStorage.getItem('theme'); } catch (e) { return null; } })() || 'system'));

  $('#barBack').append(icon('back'));
  $('#barBack').addEventListener('click', () => back());
  $('#gearBtn').append(icon('gear'));
  $('#syncBtn').addEventListener('click', () => runSync(true));
  $('#profBtn').addEventListener('click', () => openProfiles());
  window.addEventListener('hashchange', route);

  try { await load(); }
  catch (e) {
    put($('#view'), h('div', { class: 'empty' }, h('h2', { text: 'Místní data nejdou otevřít' }), h('p', { text: e.message || String(e) })));
    return;
  }
  setSyncHook(() => runSync(false));
  applyProfile();
  onChange(() => { applyProfile(); renderSync(); refreshView(); });
  onStatus(() => renderSync());
  renderSync();
  route();
  persistStorage();
  registerSW();

  if (store.conn) setTimeout(() => runSync(false), 400);
  window.addEventListener('online', () => runSync(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !store.conn) return;
    const last = store.lastSync ? Date.parse(store.lastSync) : 0;
    if (Date.now() - last > 2 * 60 * 1000) runSync(false);
  });
}

start();
