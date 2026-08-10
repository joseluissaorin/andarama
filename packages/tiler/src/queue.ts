/**
 * Cola local persistente de subida de tiles (IndexedDB): si el editor
 * cierra la pestana a mitad de subida, al reabrir se reanuda lo pendiente.
 */

export interface PendingTile {
  id: string;
  mediaId: string;
  key: string;
  blob: Blob;
  createdAt: number;
}

const DB_NAME = "anda-tiler";
const STORE = "pending";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("mediaId", "mediaId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB no disponible"));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB fallo"));
  });
}

export class TileUploadQueue {
  private db: IDBDatabase | null = null;

  private async ensure(): Promise<IDBDatabase> {
    if (this.db == null) this.db = await openDb();
    return this.db;
  }

  async add(mediaId: string, key: string, blob: Blob): Promise<void> {
    const db = await this.ensure();
    const item: PendingTile = { id: `${mediaId}:${key}`, mediaId, key, blob, createdAt: Date.now() };
    await tx(db, "readwrite", (s) => s.put(item));
  }

  async remove(mediaId: string, key: string): Promise<void> {
    const db = await this.ensure();
    await tx(db, "readwrite", (s) => s.delete(`${mediaId}:${key}`));
  }

  async pendingFor(mediaId: string): Promise<PendingTile[]> {
    const db = await this.ensure();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const idx = t.objectStore(STORE).index("mediaId");
      const req = idx.getAll(IDBKeyRange.only(mediaId));
      req.onsuccess = () => resolve(req.result as PendingTile[]);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB fallo"));
    });
  }

  async pendingMediaIds(): Promise<string[]> {
    const db = await this.ensure();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => resolve([...new Set((req.result as PendingTile[]).map((p) => p.mediaId))]);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB fallo"));
    });
  }

  async clear(mediaId: string): Promise<void> {
    const pending = await this.pendingFor(mediaId);
    const db = await this.ensure();
    for (const p of pending) {
      await tx(db, "readwrite", (s) => s.delete(p.id));
    }
  }
}
