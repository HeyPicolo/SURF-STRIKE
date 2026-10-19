// Fantasmas do Surf Skill no IndexedDB (o localStorage não comporta várias corridas longas).
// Implementa a GhostStore de shared/sim/ghost.ts; mesma chave (mapa + hash da geometria) dos recordes.
// Sem IndexedDB (aba anônima, bloqueio), cai para a memória da sessão.
import { GhostStore, GhostSet, MemoryGhostStore, packGhostSet, unpackGhostSet, emptyGhostSet, StoredGhostSet } from '../../../shared/sim/ghost';

const DB = 'surfstrike', STORE = 'ghosts';

export class IdbGhostStore implements GhostStore {
  private mem = new MemoryGhostStore();
  private db: Promise<IDBDatabase | null>;
  constructor() {
    this.db = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  private key(mapId: string, version: string) { return `${mapId}.${version}`; }

  async load(mapId: string, version: string, n: number): Promise<GhostSet> {
    const db = await this.db;
    if (!db) return this.mem.load(mapId, version, n);
    try {
      const raw = await new Promise<StoredGhostSet | undefined>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(this.key(mapId, version));
        req.onsuccess = () => resolve(req.result as StoredGhostSet | undefined);
        req.onerror = () => reject(req.error);
      });
      return raw ? unpackGhostSet(raw, n) : emptyGhostSet(n);
    } catch { return this.mem.load(mapId, version, n); }
  }

  async save(mapId: string, version: string, set: GhostSet): Promise<void> {
    await this.mem.save(mapId, version, set);
    const db = await this.db;
    if (!db) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        os.put(packGhostSet(set), this.key(mapId, version));
        // gravações de versões antigas do mesmo mapa não valem mais
        const cur = os.openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          const k = String(c.key);
          if (k.startsWith(`${mapId}.`) && k !== this.key(mapId, version)) c.delete();
          c.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch { /* indisponível */ }
  }
}
