// In-memory model of the data repository, persisted to IndexedDB on every change.
import { files as fileDb, kv } from './db.js';
import { serialize, nowIso } from './format.js';

export const DEFAULT_NASTAVENI = {
  podnadpis: 'Praha mimo centrum',
  budget: 12000000,
  mirneNad: 13500000,
  strop: 15500000,
  kriteria: [],
  lide: [{ jmeno: 'Míša', barva: 'zelena' }, { jmeno: 'Zuzka', barva: 'ruzova' }]
};

const BARVY = ['zelena', 'ruzova'];
/** Profiles (people who rate): [{ jmeno, barva }] from nastaveni.json. */
export function lide() {
  const l = Array.isArray(store.nastaveni.lide) ? store.nastaveni.lide : DEFAULT_NASTAVENI.lide;
  return l.map((p, i) => typeof p === 'string' ? { jmeno: p, barva: BARVY[i % 2] } : { jmeno: String(p.jmeno || ''), barva: BARVY.includes(p.barva) ? p.barva : BARVY[i % 2] })
    .filter(p => p.jmeno);
}
export const profil = () => lide().find(p => p.jmeno === store.kdo) || null;

const listeners = new Set();
export const store = {
  files: new Map(),        // path -> { path, text, base, sha, deleted }
  byty: new Map(),         // id -> apartment (parsed file plus id and dirty)
  meta: null,              // meta/hlidac.json
  nastaveni: { ...DEFAULT_NASTAVENI },
  conn: null,              // { owner, repo, branch, token, api }
  head: null,
  lastSync: null,
  kdo: '',                 // who uses this phone, for notes and commit messages
  ready: false
};

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let notifyQueued = false;
export function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => { notifyQueued = false; listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); });
}

export const BYT_RE = /^byty\/([a-z0-9-]+)\.json$/;
export const tracked = p => BYT_RE.test(p) || p === 'meta/hlidac.json' || p === 'nastaveni.json';
export const bytPath = id => `byty/${id}.json`;

export async function load() {
  const all = await fileDb.all();
  store.files = new Map(all.map(f => [f.path, f]));
  store.conn = (await kv.get('conn')) || null;
  store.head = (await kv.get('head')) || null;
  store.lastSync = (await kv.get('lastSync')) || null;
  store.kdo = (await kv.get('kdo')) || '';
  rebuild();
  store.ready = true;
  notify();
}

const parseCache = new Map(); // path -> { text, obj }
function parsed(f) {
  const c = parseCache.get(f.path);
  if (c && c.text === f.text) return c.obj;
  let obj = null;
  try { obj = JSON.parse(f.text); } catch (e) { obj = null; }
  parseCache.set(f.path, { text: f.text, obj });
  return obj;
}

/** Recompute apartments, watchdog state and settings from the files. */
export function rebuild() {
  const byty = new Map();
  let meta = null, nast = null;
  for (const f of store.files.values()) {
    if (f.deleted) continue;
    const m = f.path.match(BYT_RE);
    if (m) {
      const o = parsed(f);
      if (o && typeof o === 'object') byty.set(m[1], { ...o, id: m[1], dirty: f.base == null || f.text !== f.base });
    } else if (f.path === 'meta/hlidac.json') meta = parsed(f);
    else if (f.path === 'nastaveni.json') nast = parsed(f);
  }
  store.byty = byty;
  store.meta = meta;
  store.nastaveni = { ...DEFAULT_NASTAVENI, ...(nast || {}) };
}

/* ---------- writes ---------- */

async function writeMany(pairs) {
  const changed = [];
  for (const [path, text] of pairs) {
    const f = store.files.get(path) || { path, text: '', base: null, sha: null, deleted: false };
    if (f.text === text && !f.deleted) continue;
    f.text = text; f.deleted = false;
    store.files.set(path, f);
    changed.push(f);
  }
  if (!changed.length) return;
  await fileDb.putMany(changed);
  rebuild();
  notify();
  scheduleSync();
}

/** Change one apartment. The mutator gets the stored object (without id) and edits it in place. */
export async function updateByt(id, mutator) {
  const f = store.files.get(bytPath(id));
  if (!f || f.deleted) throw new Error('Byt v telefonu není.');
  const cur = JSON.parse(f.text);
  mutator(cur);
  cur.upraveno = nowIso();
  if (store.kdo) cur.upravil = { kdo: store.kdo, kdy: cur.upraveno };
  await writeMany([[f.path, serialize(cur)]]);
}

export async function addByt(id, data) {
  await writeMany([[bytPath(id), serialize(data)]]);
}

/* ---------- pending changes ---------- */

export function pendingFiles() {
  return [...store.files.values()].filter(f => f.deleted ? f.base != null : (f.base == null || f.text !== f.base));
}
export const pendingCount = () => pendingFiles().length;

/* ---------- connection & sync scheduling ---------- */

export async function setConn(conn) { store.conn = conn; await kv.set('conn', conn); notify(); }
export async function setHead(sha) { store.head = sha; await kv.set('head', sha); }
export async function setLastSync(t) { store.lastSync = t; await kv.set('lastSync', t); }
export async function setKdo(name) { store.kdo = name; await kv.set('kdo', name); notify(); }
export async function resetLocal() {
  await fileDb.clear();
  store.files = new Map();
  store.head = null;
  await kv.del('head');
  rebuild();
  notify();
}

let syncHook = null;
let syncTimer = null;
export function setSyncHook(fn) { syncHook = fn; }
export function scheduleSync(delay = 3000) {
  if (!syncHook) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncHook(), delay);
}

/** Persist the outcome of a sync: files changed in memory are written in one batch. */
export async function commitFiles(changed, removed) {
  if (changed.length) await fileDb.putMany(changed);
  if (removed.length) await fileDb.delMany(removed);
  rebuild();
  notify();
}
