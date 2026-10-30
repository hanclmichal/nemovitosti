// IndexedDB: the phone's local copy of the data repository.
// files: { path, text, base, sha, deleted }  text = local version, base = last synced version
// kv:    small key/value settings (connection, last synced commit, who uses this phone)

const DB_NAME = 'nemovitosti';
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Databázi drží otevřenou jiná karta aplikace.'));
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const st = t.objectStore(store);
    let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transakce byla přerušena.'));
  }));
}

const req2p = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const files = {
  all: () => tx('files', 'readonly', st => req2p(st.getAll())),
  put: f => tx('files', 'readwrite', st => { st.put(f); }),
  putMany: list => tx('files', 'readwrite', st => { list.forEach(f => st.put(f)); }),
  delMany: paths => tx('files', 'readwrite', st => { paths.forEach(p => st.delete(p)); }),
  clear: () => tx('files', 'readwrite', st => { st.clear(); })
};

export const kv = {
  get: key => tx('kv', 'readonly', st => req2p(st.get(key))),
  set: (key, value) => tx('kv', 'readwrite', st => { st.put(value, key); }),
  del: key => tx('kv', 'readwrite', st => { st.delete(key); })
};

export async function persistStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* not supported */ }
  return false;
}
