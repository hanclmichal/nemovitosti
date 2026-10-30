// Synchronisation with the private GitHub repository through the Git Data API.
// Pull: download files whose blob changed and merge them with local edits.
// Push: one commit with every local change, fast-forward only (retried after a fresh pull).
import { store, tracked, BYT_RE, setHead, setLastSync, commitFiles, pendingFiles } from './store.js';
import { mergeFile } from './merge.js';
import { STATUS_LABEL } from './byty.js';

export class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const DEFAULT_API = 'https://api.github.com';

export function client(conn) {
  const api = (conn.api || DEFAULT_API).replace(/\/$/, '');
  const base = `/repos/${encodeURIComponent(conn.owner)}/${encodeURIComponent(conn.repo)}`;
  const branch = conn.branch || 'main';

  async function req(method, path, body) {
    let res;
    try {
      res = await fetch(api + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${conn.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new SyncError('offline', 'Bez připojení k internetu.');
    }
    if (res.ok) return res.status === 204 ? null : res.json();
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* no body */ }
    if (res.status === 401) throw new SyncError('auth', 'Přístupový klíč neplatí nebo vypršel.');
    if (res.status === 403 && /rate limit/i.test(detail)) throw new SyncError('rate', 'GitHub dočasně omezil počet požadavků. Zkus to za chvíli.');
    if (res.status === 403) throw new SyncError('forbidden', 'Klíč nemá oprávnění k zápisu do úložiště.');
    if (res.status === 404) throw new SyncError('notfound', 'Úložiště nebo větev nenalezeny, nebo k nim klíč nemá přístup.');
    if (res.status === 409) throw new SyncError('empty', 'Úložiště je prázdné. Vytvoř v něm na GitHubu aspoň soubor README.');
    if (res.status === 422) throw new SyncError('conflict', detail || 'Změnu nešlo zapsat.');
    throw new SyncError('server', `GitHub odpověděl chybou ${res.status}. ${detail}`.trim());
  }

  return {
    repo: () => req('GET', base),
    head: async () => (await req('GET', `${base}/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha,
    commit: sha => req('GET', `${base}/git/commits/${sha}`),
    tree: async sha => {
      const t = await req('GET', `${base}/git/trees/${sha}?recursive=1`);
      if (t.truncated) throw new SyncError('server', 'Úložiště je příliš velké pro načtení najednou.');
      return t.tree.filter(e => e.type === 'blob');
    },
    blob: async sha => decodeBase64((await req('GET', `${base}/git/blobs/${sha}`)).content),
    createTree: (baseTree, entries) => req('POST', `${base}/git/trees`, { base_tree: baseTree, tree: entries }),
    createCommit: (message, tree, parents) => req('POST', `${base}/git/commits`, { message, tree, parents }),
    updateRef: sha => req('PATCH', `${base}/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false })
  };
}

function decodeBase64(b64) {
  const bin = atob(String(b64 || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  });
  await Promise.all(workers);
  return out;
}

/* ---------- state shared with the UI ---------- */

export const status = { running: false, phase: '', done: 0, total: 0, error: null, lastResult: null };
const statusListeners = new Set();
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(patch) { Object.assign(status, patch); statusListeners.forEach(fn => fn(status)); }

let running = null;
/** Run one full synchronisation (pull, then push). Concurrent calls share the same run. */
export function sync() {
  if (running) return running;
  running = (async () => {
    setStatus({ running: true, phase: 'Kontroluji změny', done: 0, total: 0, error: null });
    try {
      if (!store.conn || !store.conn.token) throw new SyncError('noconn', 'Aplikace zatím není připojená k úložišti.');
      const gh = client(store.conn);
      const result = { pulled: 0, pushed: 0, novych: 0 };
      for (let attempt = 0; attempt < 4; attempt++) {
        const pulled = await pull(gh);
        result.pulled += pulled.count;
        result.novych += pulled.novych;
        const pushed = await push(gh, pulled.treeSha);
        if (pushed !== 'retry') { result.pushed = pushed; break; }
      }
      await setLastSync(new Date().toISOString());
      setStatus({ running: false, phase: '', error: null, lastResult: result });
      return result;
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError('unknown', e && e.message ? e.message : String(e));
      setStatus({ running: false, phase: '', error: err });
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

async function pull(gh) {
  const head = await gh.head();
  const commit = await gh.commit(head);
  const treeSha = commit.tree.sha;
  if (head === store.head) return { count: 0, novych: 0, treeSha, head };

  setStatus({ phase: 'Stahuji' });
  const remote = (await gh.tree(treeSha)).filter(e => tracked(e.path));
  const remotePaths = new Set(remote.map(e => e.path));
  const toFetch = remote.filter(e => { const f = store.files.get(e.path); return !f || f.sha !== e.sha; });
  setStatus({ total: toFetch.length, done: 0 });
  let done = 0;
  const texts = await pool(toFetch, 8, async e => {
    const t = await gh.blob(e.sha);
    setStatus({ done: ++done });
    return t;
  });

  const firstPull = store.head == null;
  const changed = [], removed = [];
  let novych = 0;
  toFetch.forEach((e, i) => {
    const remoteText = texts[i];
    const f = store.files.get(e.path);
    if (!f) {
      const nf = { path: e.path, text: remoteText, base: remoteText, sha: e.sha, deleted: false };
      store.files.set(e.path, nf); changed.push(nf);
      if (!firstPull && BYT_RE.test(e.path)) novych++;
      return;
    }
    const localChanged = f.deleted || f.base == null || f.text !== f.base;
    if (!localChanged || f.deleted) {
      Object.assign(f, { text: remoteText, base: remoteText, sha: e.sha, deleted: false });
      changed.push(f); return;
    }
    Object.assign(f, { text: mergeFile(e.path, f.base, f.text, remoteText), base: remoteText, sha: e.sha });
    changed.push(f);
  });
  for (const f of [...store.files.values()]) {
    if (!tracked(f.path) || remotePaths.has(f.path) || f.base == null) continue;
    const localChanged = !f.deleted && f.text !== f.base;
    if (localChanged) { Object.assign(f, { base: null, sha: null }); changed.push(f); }
    else { store.files.delete(f.path); removed.push(f.path); }
  }
  await commitFiles(changed, removed);
  await setHead(head);
  return { count: toFetch.length + removed.length, novych, treeSha, head };
}

async function push(gh, treeSha) {
  const pending = pendingFiles();
  if (!pending.length) return 0;
  setStatus({ phase: 'Odesílám', done: 0, total: pending.length });
  const snapshot = pending.map(f => ({ path: f.path, deleted: !!f.deleted, text: f.text, base: f.base }));
  const entries = snapshot.map(x => x.deleted
    ? { path: x.path, mode: '100644', type: 'blob', sha: null }
    : { path: x.path, mode: '100644', type: 'blob', content: x.text });
  const tree = await gh.createTree(treeSha, entries);
  const commit = await gh.createCommit(commitMessage(snapshot, store.kdo), tree.sha, [store.head]);
  try {
    await gh.updateRef(commit.sha);
  } catch (e) {
    if (e.code === 'conflict') return 'retry';
    throw e;
  }
  const newTree = (await gh.tree(tree.sha)).filter(e => tracked(e.path));
  const shaOf = new Map(newTree.map(e => [e.path, e.sha]));
  const changed = [], removed = [];
  for (const x of snapshot) {
    const f = store.files.get(x.path);
    if (x.deleted) {
      if (f && f.deleted) { store.files.delete(x.path); removed.push(x.path); }
      else if (f) { Object.assign(f, { base: null, sha: null }); changed.push(f); }
      continue;
    }
    if (!f) continue;
    Object.assign(f, { base: x.text, sha: shaOf.get(x.path) || null });
    changed.push(f);
  }
  await commitFiles(changed, removed);
  await setHead(commit.sha);
  setStatus({ done: entries.length });
  return entries.length;
}

/** Commit message describing what changed on the phone, e.g. "Michal: zajímavý leopoldova-3plus1-90; poznámka k bohunova-5plus1-100". */
export function commitMessage(snapshot, kdo) {
  const lines = [];
  for (const x of snapshot) {
    const m = x.path.match(BYT_RE);
    if (!m) { lines.push(x.path); continue; }
    const id = m[1];
    let b = null, t = null;
    try { b = x.base ? JSON.parse(x.base) : null; } catch (e) { b = null; }
    try { t = x.deleted ? null : JSON.parse(x.text); } catch (e) { t = null; }
    if (!t) { lines.push(`smazán ${id}`); continue; }
    if (!b) { lines.push(`přidán ${id}`); continue; }
    const bits = [];
    if (b.status !== t.status) bits.push((STATUS_LABEL[t.status] || t.status || '').toLowerCase());
    if ((b.nase || '') !== (t.nase || '')) bits.push('poznámka');
    lines.push(`${bits.length ? bits.join(' a ') : 'úprava'} ${id}`);
  }
  const who = kdo ? `${kdo}: ` : '';
  let subject = who + (lines.length > 3 ? `${lines.slice(0, 2).join('; ')} a ${lines.length - 2} další` : lines.join('; '));
  if (subject.length > 72) subject = subject.slice(0, 69).replace(/[,; ]+[^,; ]*$/, '') + '…';
  return `${subject}\n\nZměny z aplikace Nemovitosti${kdo ? ` (${kdo})` : ''}:\n` + lines.map(l => `- ${l}`).join('\n') + '\n';
}

/** Check a new connection: the token must see the repository and be allowed to write. */
export async function testConnection(conn) {
  const gh = client(conn);
  const repo = await gh.repo();
  if (repo.permissions && repo.permissions.push === false) throw new SyncError('forbidden', 'Klíč má k úložišti jen čtení. Povol mu Contents: Read and write.');
  await gh.head();
  return repo;
}
