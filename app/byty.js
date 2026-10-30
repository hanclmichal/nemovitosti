// Apartments: statuses, price tiers, filters and sorting shared by the list and the chart.
import { num, norm, daysBetween } from './format.js';

export const STATUS = [
  ['novy', 'Nový'], ['zajimavy', 'Zajímavý'], ['prohlidka', 'Prohlídka'], ['rezervace', 'Rezervace'],
  ['zamitnuto', 'Zamítnuto'], ['stazeno', 'Stažený z nabídky'], ['prodano', 'Prodáno']
];
export const STATUS_LABEL = Object.fromEntries(STATUS);
export const STATUS_SHORT = { novy: 'Nový', zajimavy: 'Zajímavý', prohlidka: 'Prohlídka', rezervace: 'Rezervace', zamitnuto: 'Zamítnuto', stazeno: 'Stažený', prodano: 'Prodáno' };
export const ACTIVE = ['novy', 'zajimavy', 'prohlidka', 'rezervace'];
export const GONE = ['stazeno', 'prodano'];

export const TABS = [
  { id: 'aktivni', label: 'Aktivní', test: st => ACTIVE.includes(st) },
  { id: 'vybrane', label: 'Vybrané', test: st => st === 'zajimavy' || st === 'prohlidka' },
  { id: 'zamitnute', label: 'Zamítnuté', test: st => st === 'zamitnuto' },
  { id: 'stazene', label: 'Stažené a prodané', test: st => GONE.includes(st) },
  { id: 'vse', label: 'Vše', test: () => true }
];

export const SORTS = [['pridano', 'Nejnovější'], ['cena', 'Nejlevnější'], ['kcm2', 'Cena za m²'], ['plocha', 'Největší']];

export const statusOf = it => STATUS_LABEL[it.status] ? it.status : 'novy';
export const hasTerrace = it => it.terasa === true;
export const isGone = it => GONE.includes(statusOf(it));
export const kcm2 = it => { const c = num(it.cena), p = num(it.plocha); return c && p ? c / p : null; };
export const isNew = it => !!it.pridano && daysBetween(it.pridano) <= 3 && !isGone(it);

export function priceDrop(it) {
  const h = Array.isArray(it.historie) ? it.historie : [];
  let max = 0;
  h.forEach(x => { const c = num(x && x.cena); if (c && c > max) max = c; });
  const cur = num(it.cena);
  if (!cur || !max || cur >= max) return null;
  return { from: max, pct: Math.round((1 - cur / max) * 1000) / 10 };
}

/** Price relative to the budget: { cls, text } or null. */
export function tier(it, n) {
  const c = num(it.cena);
  if (!c) return null;
  if (c <= n.budget) return { cls: 'in', text: 'V budgetu' };
  if (c <= n.mirneNad) return { cls: 'near', text: 'Mírně nad budgetem' };
  if (c <= n.strop) return { cls: 'over', text: 'Výrazně nad budgetem' };
  return { cls: 'over', text: 'Nad horní hranicí' };
}

export const DISP = ['2+kk', '2+1', '3+kk', '3+1', '4+kk', '4+1', '5+'];
export const DISP_LABEL = { '5+': '5 a více', 'jiné': 'Jiné' };
export function dispKey(it) {
  const m = String(it.dispozice || '').match(/(\d)\s*\+\s*(kk|1)/i);
  if (!m) return 'jiné';
  const n = Number(m[1]);
  return n >= 5 ? '5+' : `${n}+${m[2].toLowerCase()}`;
}

export function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ---------- view state (remembered per phone) ---------- */

export const view = { tab: 'aktivni', lok: '', sort: 'pridano', ter: false, dev: '', disp: [], q: '' };
try {
  const saved = JSON.parse(localStorage.getItem('nem-view') || 'null');
  if (saved) for (const k of Object.keys(view)) if (k in saved && k !== 'q') view[k] = saved[k];
} catch (e) { /* storage blocked */ }
if (!Array.isArray(view.disp)) view.disp = [];
if (!TABS.some(t => t.id === view.tab)) view.tab = 'aktivni';

export function saveView() {
  try { const { q, ...rest } = view; localStorage.setItem('nem-view', JSON.stringify(rest)); } catch (e) { /* ignore */ }
}

export const filterCount = () => (view.lok ? 1 : 0) + (view.ter ? 1 : 0) + (view.dev ? 1 : 0) + view.disp.length;
export function resetFilters() { view.lok = ''; view.ter = false; view.dev = ''; view.disp = []; saveView(); }

function matchesQuery(it, q) {
  if (!q) return true;
  const hay = norm([it.lokalita, it.ulice, it.projekt, it.developer, it.dispozice, it.oznaceni, it.nase, it.id].filter(Boolean).join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

/** Filters other than the status tab; skipDisp leaves out the layout filter (for its own counts). */
export function passesBase(it, skipDisp) {
  if (view.lok && it.lokalita !== view.lok) return false;
  if (view.ter && !hasTerrace(it)) return false;
  if (view.dev === 'jen' && !it.odDevelopera) return false;
  if (view.dev === 'bez' && it.odDevelopera) return false;
  if (!skipDisp && view.disp.length && !view.disp.includes(dispKey(it))) return false;
  if (!matchesQuery(it, view.q)) return false;
  return true;
}

export const currentTab = () => TABS.find(t => t.id === view.tab) || TABS[0];

export function filtered(items) {
  const tab = currentTab();
  const list = items.filter(it => tab.test(statusOf(it)) && passesBase(it));
  const key = view.sort;
  list.sort((a, b) => {
    if (key === 'cena') return (num(a.cena) || 9e15) - (num(b.cena) || 9e15);
    if (key === 'kcm2') return (kcm2(a) || 9e15) - (kcm2(b) || 9e15);
    if (key === 'plocha') return (num(b.plocha) || 0) - (num(a.plocha) || 0);
    return String(b.pridano || '').localeCompare(String(a.pridano || '')) || (num(a.cena) || 0) - (num(b.cena) || 0);
  });
  return list;
}
