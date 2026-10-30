// Numbers, dates and small text helpers. No DOM here, so the module also runs in tests.

const pad = n => String(n).padStart(2, '0');
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dayKey(new Date());
export const nowIso = () => new Date().toISOString();

/** Positive finite number or null. */
export function num(v) {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}

/** 12450000 → "12,45 mil. Kč" */
export function mil(v, unit = true) {
  const s = (v / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
  return unit ? `${s} mil. Kč` : `${s} mil.`;
}
/** 117900 → "117 900 Kč" */
export const kc = v => `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
export const m2 = v => `${Number(v).toLocaleString('cs-CZ')} m²`;

const fmtD = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
const fmtDM = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
export const fmtTime = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

function toDate(v) {
  if (!v) return null;
  // a bare date is local midnight, not UTC
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return isNaN(d) ? null : d;
}
export const dateCz = v => { const d = toDate(v); return d ? fmtD.format(d) : ''; };
export const dateShort = v => { const d = toDate(v); return d ? fmtDM.format(d) : ''; };
export const timeCz = v => { const d = toDate(v); return d ? fmtTime.format(d) : ''; };

/** Whole days from a to b (b defaults to now). */
export function daysBetween(a, b) {
  const d1 = toDate(a), d2 = b ? toDate(b) : new Date();
  if (!d1 || !d2) return null;
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

export function plural(n, one, few, many) {
  const a = Math.abs(n);
  if (a === 1) return one;
  if (a >= 2 && a <= 4 && Number.isInteger(a)) return few;
  return many;
}

/** "12 500 000", "98,5", "12,5 mil" → number or null. */
export function parseNum(s) {
  if (s == null) return null;
  let t = String(s).trim().toLowerCase();
  if (!t) return null;
  const million = /mil/.test(t);
  t = t.replace(/mil\.?|kč|m²|m2/g, '').replace(/\s/g, '').replace(',', '.');
  const v = Number(t);
  if (!isFinite(v)) return null;
  return million ? Math.round(v * 1e6) : v;
}

/** Lower case without diacritics. */
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Identifier in the style the watchdog uses: "Leopoldova 3+1 90" → "leopoldova-3plus1-90", "Opatovská 4+kk 97" → "opatovska-4kk-97". */
export function slug(s) {
  return norm(s).replace(/\+\s*kk/g, 'kk').replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'byt';
}

/** Objects with keys sorted at every level, so files stay stable between the app and the watchdog. */
export function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}
/** Same format as Python json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=True) + "\n". */
export const serialize = obj => JSON.stringify(sortKeys(obj), null, 1) + '\n';

export const clone = o => JSON.parse(JSON.stringify(o));
