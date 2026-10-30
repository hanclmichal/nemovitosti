// Apartments: statuses, price tiers, filters and sorting shared by the list and the chart.
import { num, norm, daysBetween } from './format.js';
import { store } from './store.js';

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

export const SORTS = [['pridano', 'Nejnovější'], ['cena', 'Nejlevnější'], ['kcm2', 'Cena za m²'], ['plocha', 'Největší'], ['hodnoceni', 'Nejlépe hodnocené']];

export const statusOf = it => STATUS_LABEL[it.status] ? it.status : 'novy';
export const hasTerrace = it => it.terasa === true;
export const isGone = it => GONE.includes(statusOf(it));
export const kcm2 = it => { const c = num(it.cena), p = num(it.plocha); return c && p ? c / p : null; };
export const isNew = it => !!it.pridano && daysBetween(it.pridano) <= 3 && !isGone(it);

/* ---------- ratings (1–10 per person) ---------- */

export function ratingOf(it, jmeno) {
  const v = it.hodnoceni && typeof it.hodnoceni === 'object' ? Number(it.hodnoceni[jmeno]) : NaN;
  return Number.isInteger(v) && v >= 1 && v <= 10 ? v : null;
}
/** Average of the ratings given (any person), or null. */
export function avgRating(it) {
  if (!it.hodnoceni || typeof it.hodnoceni !== 'object') return null;
  const vals = Object.keys(it.hodnoceni).map(k => ratingOf(it, k)).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
export const fmtRating = v => (Math.round(v * 10) / 10).toLocaleString('cs-CZ');
export const HOD = [['', 'Všechny'], ['cekam', 'Čeká na moje hodnocení'], ['nehodnocene', 'Nikdo nehodnotil'], ['7plus', 'Průměr 7 a víc'], ['shoda', 'Oba 7 a víc']];

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

export const view = { tab: 'aktivni', lok: '', sort: 'pridano', ter: false, dev: '', disp: [], hod: '', plocha: [null, null], cena: [null, null], q: '' };
try {
  const saved = JSON.parse(localStorage.getItem('nem-view') || 'null');
  if (saved) for (const k of Object.keys(view)) if (k in saved && k !== 'q') view[k] = saved[k];
} catch (e) { /* storage blocked */ }
if (!Array.isArray(view.disp)) view.disp = [];
const okRange = r => Array.isArray(r) && r.length === 2 && r.every(v => v == null || (typeof v === 'number' && isFinite(v)));
if (!okRange(view.plocha)) view.plocha = [null, null];
if (!okRange(view.cena)) view.cena = [null, null];
if (!TABS.some(t => t.id === view.tab)) view.tab = 'aktivni';

export function saveView() {
  try { const { q, ...rest } = view; localStorage.setItem('nem-view', JSON.stringify(rest)); } catch (e) { /* ignore */ }
}

export const rangeOn = r => r[0] != null || r[1] != null;
export const filterCount = () => (view.lok ? 1 : 0) + (view.ter ? 1 : 0) + (view.dev ? 1 : 0) + (view.hod ? 1 : 0) + view.disp.length
  + (rangeOn(view.plocha) ? 1 : 0) + (rangeOn(view.cena) ? 1 : 0);
export function resetFilters() { view.lok = ''; view.ter = false; view.dev = ''; view.hod = ''; view.disp = []; view.plocha = [null, null]; view.cena = [null, null]; saveView(); }

/** Slider limits from all apartments: area rounded to 5 m², price to half a million. */
export function extents(items) {
  const ps = items.map(it => num(it.plocha)).filter(Boolean), cs = items.map(it => num(it.cena)).filter(Boolean);
  return {
    plocha: ps.length ? [Math.floor(Math.min(...ps) / 5) * 5, Math.ceil(Math.max(...ps) / 5) * 5] : [80, 150],
    cena: cs.length ? [Math.floor(Math.min(...cs) / 5e5) * 5e5, Math.ceil(Math.max(...cs) / 5e5) * 5e5] : [5e6, 16e6]
  };
}
const fmtMil = v => (v / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
/** "90–110 m²", "od 90 m²", "do 12 mil. Kč". */
export function rangeText(r, kind) {
  const f = kind === 'cena' ? fmtMil : v => v.toLocaleString('cs-CZ');
  const unit = kind === 'cena' ? 'mil. Kč' : 'm²';
  if (r[0] != null && r[1] != null) return `${f(r[0])}–${f(r[1])} ${unit}`;
  if (r[0] != null) return `od ${f(r[0])} ${unit}`;
  if (r[1] != null) return `do ${f(r[1])} ${unit}`;
  return 'vše';
}
const inRange = (v, r) => (r[0] == null || (v != null && v >= r[0])) && (r[1] == null || (v != null && v <= r[1]));

function matchesQuery(it, q) {
  if (!q) return true;
  const hay = norm([it.lokalita, it.ulice, it.projekt, it.developer, it.dispozice, it.oznaceni, it.nase, it.id].filter(Boolean).join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

function passesRating(it) {
  if (!view.hod) return true;
  if (view.hod === 'cekam') return store.kdo ? ratingOf(it, store.kdo) == null : avgRating(it) == null;
  if (view.hod === 'nehodnocene') return avgRating(it) == null;
  if (view.hod === '7plus') { const a = avgRating(it); return a != null && a >= 7; }
  if (view.hod === 'shoda') {
    const vals = Object.keys(it.hodnoceni || {}).map(k => ratingOf(it, k)).filter(v => v != null);
    return vals.length >= 2 && vals.every(v => v >= 7);
  }
  return true;
}

/** Filters other than the status tab; skip: 'disp' or 'lok' leaves that filter out (for its own counts). */
export function passesBase(it, skip) {
  if (skip === true) skip = 'disp';
  if (view.lok && skip !== 'lok' && it.lokalita !== view.lok) return false;
  if (!passesRating(it)) return false;
  if (view.ter && !hasTerrace(it)) return false;
  if (rangeOn(view.plocha) && !inRange(num(it.plocha), view.plocha)) return false;
  if (rangeOn(view.cena) && !inRange(num(it.cena), view.cena)) return false;
  if (view.dev === 'jen' && !it.odDevelopera) return false;
  if (view.dev === 'bez' && it.odDevelopera) return false;
  if (skip !== 'disp' && view.disp.length && !view.disp.includes(dispKey(it))) return false;
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
    if (key === 'hodnoceni') return (avgRating(b) ?? -1) - (avgRating(a) ?? -1) || String(b.pridano || '').localeCompare(String(a.pridano || ''));
    return String(b.pridano || '').localeCompare(String(a.pridano || '')) || (num(a.cena) || 0) - (num(b.cena) || 0);
  });
  return list;
}
