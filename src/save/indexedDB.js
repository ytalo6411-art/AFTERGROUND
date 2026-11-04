const DB_NAME = 'afterground_local_db';
const DB_VERSION = 1;

class LocalDatabase {
  constructor() {
    this.dbPromise = null;
    this.memoryFallback = {
      worlds: new Map(),
      saves: new Map(),
      settings: new Map(),
      meta: new Map()
    };
  }

  hasIndexedDB() {
    return typeof indexedDB !== 'undefined';
  }

  open() {
    if (!this.hasIndexedDB()) return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('worlds')) {
          db.createObjectStore('worlds', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('saves')) {
          db.createObjectStore('saves', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  async put(storeName, value) {
    const db = await this.open();
    if (!db) {
      const k = value.id || value.key;
      this.memoryFallback[storeName].set(k, JSON.parse(JSON.stringify(value)));
      return value;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(storeName, key) {
    const db = await this.open();
    if (!db) {
      const v = this.memoryFallback[storeName].get(key);
      return v ? JSON.parse(JSON.stringify(v)) : null;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(storeName) {
    const db = await this.open();
    if (!db) {
      return Array.from(this.memoryFallback[storeName].values()).map((v) =>
        JSON.parse(JSON.stringify(v))
      );
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName, key) {
    const db = await this.open();
    if (!db) {
      this.memoryFallback[storeName].delete(key);
      return true;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const localDB = new LocalDatabase();
