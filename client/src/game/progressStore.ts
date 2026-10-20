// Progressão das armas no localStorage (implementa a ProgressionStore de shared/sim/progression).
// Sem localStorage (aba anônima, bloqueio) fica na memória da sessão.
import { ProgressionStore, ProgressionData, MemoryProgressionStore, migrateProgression } from '../../../shared/sim/progression';

export const PROGRESSION_KEY = 'surfstrike.progression';

export class LocalProgressionStore implements ProgressionStore {
  private mem = new MemoryProgressionStore();
  private memUsed = false;
  load(): ProgressionData {
    if (!this.memUsed) {
      try {
        const raw = localStorage.getItem(PROGRESSION_KEY);
        return migrateProgression(raw ? JSON.parse(raw) : null);
      } catch { /* indisponível ou corrompido */ }
    }
    return this.mem.load();
  }
  save(d: ProgressionData) {
    this.mem.save(d);
    try { localStorage.setItem(PROGRESSION_KEY, JSON.stringify(d)); } catch { this.memUsed = true; }
  }
  reset() {
    this.mem.reset();
    try { localStorage.removeItem(PROGRESSION_KEY); } catch { /* indisponível */ }
  }
}
