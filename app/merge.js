// Three-way merge of a file changed both on the phone and in the repository
// (typically: the phone changed the status or the note, the watchdog changed the price).
// Apartments and settings merge field by field; on a real clash the phone wins,
// except for the lists of sources and price history, which are combined.
// The watchdog's state file is never edited on the phone, so the repository version wins.
import { serialize } from './format.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const parse = t => { try { const o = JSON.parse(t); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; } };

const UNION = {
  zdroje: x => (x && x.url) || JSON.stringify(x),
  historie: x => JSON.stringify(x)
};

/** Returns the merged text. */
export function mergeFile(path, base, local, remote) {
  if (local === remote) return remote;
  if (path === 'meta/hlidac.json') return remote;
  if (base != null && local === base) return remote;
  if (base != null && remote === base) return local;
  const l = parse(local), r = parse(remote);
  if (!l) return remote;
  if (!r) return local;
  const b = (base != null && parse(base)) || {};
  return serialize(mergeObj(b, l, r));
}

export function mergeObj(b, l, r) {
  const out = {};
  for (const k of new Set([...Object.keys(r), ...Object.keys(l)])) {
    const inB = k in b, inL = k in l, inR = k in r;
    if (!inL && inB) { if (inR && !same(r[k], b[k])) out[k] = r[k]; continue; }   // removed on the phone
    if (!inR && inB) { if (inL && !same(l[k], b[k])) out[k] = l[k]; continue; }   // removed in the repository
    if (!inL) { out[k] = r[k]; continue; }
    if (!inR) { out[k] = l[k]; continue; }
    if (same(l[k], r[k]) || same(l[k], b[k])) { out[k] = r[k]; continue; }
    if (same(r[k], b[k])) { out[k] = l[k]; continue; }
    // both sides changed the field differently
    if (UNION[k] && Array.isArray(l[k]) && Array.isArray(r[k])) out[k] = union(k, r[k], l[k]);
    else if (isObj(l[k]) && isObj(r[k])) out[k] = mergeObj(isObj(b[k]) ? b[k] : {}, l[k], r[k]);  // e.g. ratings from two phones
    else out[k] = l[k];
  }
  return out;
}

function union(k, first, second) {
  const key = UNION[k];
  const seen = new Set(first.map(key));
  const out = first.concat(second.filter(x => !seen.has(key(x))));
  if (k === 'historie') out.sort((a, b) => String(a && a.dne).localeCompare(String(b && b.dne)));
  return out;
}
