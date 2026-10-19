// Recordes do Surf Skill no localStorage (implementa a RecordStore de shared/sim/records).
// Se o navegador não guardar dados (aba anônima, bloqueio), cai para a memória da sessão.
import { RecordStore, MapRecords, MemoryRecordStore, recordKey, sanitizeRecords } from '../../../shared/sim/records';

export class LocalRecordStore implements RecordStore {
  private mem = new MemoryRecordStore();
  load(mapId: string, version: string, stageCount: number): MapRecords {
    try {
      const raw = localStorage.getItem(recordKey(mapId, version));
      if (raw) return sanitizeRecords(JSON.parse(raw), mapId, version, stageCount);
    } catch { /* indisponível */ }
    return this.mem.load(mapId, version, stageCount);
  }
  save(rec: MapRecords) {
    this.mem.save(rec);
    try {
      localStorage.setItem(recordKey(rec.mapId, rec.version), JSON.stringify(rec));
      // recordes de versões antigas do mesmo mapa não valem mais
      const prefix = `surfstrike.skill.${rec.mapId}.`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix) && k !== recordKey(rec.mapId, rec.version)) localStorage.removeItem(k);
      }
    } catch { /* indisponível */ }
  }
}
