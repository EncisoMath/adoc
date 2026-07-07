(function () {
  const DB_NAME = 'asistencia-ggm-local';
  const DB_VERSION = 2;
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('keyval')) db.createObjectStore('keyval');
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('pending_attachments')) db.createObjectStore('pending_attachments', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function withStore(storeName, mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      result = action(store);
    });
  }

  window.LocalDB = {
    async get(key, fallback = null) {
      const value = await withStore('keyval', 'readonly', store => {
        return new Promise((resolve, reject) => {
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result ?? fallback);
          req.onerror = () => reject(req.error);
        });
      });
      return value;
    },

    async set(key, value) {
      return withStore('keyval', 'readwrite', store => store.put(value, key));
    },

    async enqueue(item) {
      const queued = {
        id: item.id || crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...item
      };
      await withStore('queue', 'readwrite', store => store.put(queued));
      return queued;
    },

    async queueAll() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('queue', 'readonly');
        const store = tx.objectStore('queue');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async removeQueue(id) {
      return withStore('queue', 'readwrite', store => store.delete(id));
    },

    async addPendingAttachment(item) {
      const queued = {
        id: item.id || crypto.randomUUID(),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: Number(item.attempts || 0),
        ...item
      };
      await withStore('pending_attachments', 'readwrite', store => store.put(queued));
      return queued;
    },

    async pendingAttachmentsAll() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('pending_attachments', 'readonly');
        const store = tx.objectStore('pending_attachments');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async removePendingAttachment(id) {
      return withStore('pending_attachments', 'readwrite', store => store.delete(id));
    },

    async pendingAttachmentCount() {
      const items = await this.pendingAttachmentsAll();
      return items.length;
    },


    async clearAll() {
      const db = await openDb();
      await Promise.all(['keyval', 'queue', 'pending_attachments'].map(storeName => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      })));
    }
  };
})();
