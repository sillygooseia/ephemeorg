/**
 * Epheme browser storage helper — lightweight IndexedDB wrapper.
 *
 * This module is a small browser-side adaptation of Epheme's
 * `@epheme/core/browser/idb` helper, used for local storage in the
 * Epheme budget calculator.
 */
class TypedStore {
  constructor(_db, _storeName) {
    this._db = _db;
    this._storeName = _storeName;
  }
  _tx(mode) {
    return this._db.transaction(this._storeName, mode).objectStore(this._storeName);
  }
  get(id) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readonly').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  getAll() {
    return new Promise((resolve, reject) => {
      const req = this._tx('readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  getByIndex(index, value) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readonly').index(index).getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  put(item) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  }
  delete(id) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  clear() {
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
class IdbDatabase {
  constructor(_name, _version, _schemas) {
    this._name = _name;
    this._version = _version;
    this._schemas = _schemas;
    this._db = null;
  }
  open() {
    if (this._db)
      return Promise.resolve();
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._name, this._version);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        for (const schema of this._schemas) {
          if (!db.objectStoreNames.contains(schema.name)) {
            const store = db.createObjectStore(schema.name, { keyPath: schema.keyPath });
            for (const idx of schema.indexes ?? []) {
              store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false });
            }
          }
        }
      };
      req.onsuccess = () => {
        this._db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }
  store(name) {
    if (!this._db)
      throw new Error(`IdbDatabase "${this._name}" not open - call open() first`);
    return new TypedStore(this._db, name);
  }
  close() {
    this._db?.close();
    this._db = null;
  }
}
window.EphemeIdb = window.EphemeIdb || {};
window.EphemeIdb.IdbDatabase = IdbDatabase;
window.EphemeIdb.TypedStore = TypedStore;
