// =============================================================
//  Recordes do Surf Skill — cálculo puro (PB, melhores stages, Sum of Best, ranking).
//  Fica em shared/ para ser reaproveitado pelo servidor multiplayer. O armazenamento é
//  plugável pela interface RecordStore (hoje: localStorage no cliente; amanhã: um backend).
// =============================================================
import type { MapDef } from '../maps/types';
import { SKILL } from '../config/skill';

export interface RankEntry { name: string; ticks: number; date: string }

export interface PbRun { ticks: number; splits: number[]; stages: number[]; name: string; date: string }

export interface MapRecords {
  mapId: string;
  /** versão (hash) da geometria do mapa: mudar o mapa invalida os recordes antigos */
  version: string;
  /** quantidade de segmentos (stages ou trechos entre checkpoints) — nome mantido por compatibilidade */
  stageCount: number;
  pb: PbRun | null;
  /** melhor tempo de cada stage isolado (melhor segmento), em ticks */
  bestStages: (number | null)[];
  attempts: number;
  completions: number;
  top: RankEntry[];
}

export interface FinishedRun { ticks: number; splits: number[]; stages: number[]; name: string; date: string }

export interface FinishResult {
  rec: MapRecords;
  newPb: boolean;
  /** stages em que o segmento virou o melhor da história ("gold") */
  goldStages: boolean[];
  /** posição no ranking local (1..topN) ou null */
  rank: number | null;
  /** diferença para o PB anterior (null se não havia PB) */
  diff: number | null;
}

export function emptyRecords(mapId: string, version: string, stageCount: number): MapRecords {
  return { mapId, version, stageCount, pb: null, bestStages: Array(stageCount).fill(null), attempts: 0, completions: 0, top: [] };
}

export function addAttempt(rec: MapRecords): MapRecords {
  return { ...rec, attempts: rec.attempts + 1 };
}

/** Registra uma corrida concluída (não-prática). Não altera o objeto recebido. */
export function applyFinish(rec: MapRecords, run: FinishedRun, topN = SKILL.topN): FinishResult {
  const prevPb = rec.pb;
  const newPb = !prevPb || run.ticks < prevPb.ticks;
  const goldStages = run.stages.map((t, i) => rec.bestStages[i] === null || rec.bestStages[i] === undefined || t < (rec.bestStages[i] as number));
  const bestStages = rec.bestStages.map((b, i) => (goldStages[i] ? run.stages[i] : b));
  const entry: RankEntry = { name: run.name, ticks: run.ticks, date: run.date };
  const all = [...rec.top, entry].sort((a, b) => a.ticks - b.ticks || a.date.localeCompare(b.date));
  const top = all.slice(0, topN);
  const idx = top.indexOf(entry);
  return {
    rec: {
      ...rec,
      pb: newPb ? { ticks: run.ticks, splits: [...run.splits], stages: [...run.stages], name: run.name, date: run.date } : prevPb,
      bestStages,
      completions: rec.completions + 1,
      top,
    },
    newPb,
    goldStages,
    rank: idx >= 0 ? idx + 1 : null,
    diff: prevPb ? run.ticks - prevPb.ticks : null,
  };
}

/** Soma dos melhores stages (null enquanto algum stage nunca foi concluído). */
export function sumOfBest(rec: MapRecords): number | null {
  if (rec.bestStages.length === 0 || rec.bestStages.some((b) => b === null || b === undefined)) return null;
  return (rec.bestStages as number[]).reduce((a, b) => a + b, 0);
}

/** Diferença de um split contra o PB: total acumulado e tempo do stage (negativo = melhor). */
export function splitDiff(pb: { splits: number[]; stages: number[] } | null, stage: number, total: number, stageTicks: number) {
  if (!pb || pb.splits[stage] === undefined) return { diffTotal: null, diffStage: null };
  return { diffTotal: total - pb.splits[stage], diffStage: stageTicks - pb.stages[stage] };
}

/** Hash FNV-1a (32 bits) da geometria e das zonas do mapa → versão dos recordes. */
export function mapVersion(map: MapDef): string {
  let h = 0x811c9dc5;
  const feed = (n: number) => {
    const s = String(Math.round(n * 10));
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 44; h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const b of map.brushes) {
    if (b.noCollide) continue;
    for (const v of b.verts) { feed(v.x); feed(v.y); feed(v.z); }
  }
  for (const st of map.skill?.segments ?? []) {
    for (const z of [st.startZone, st.endZone, ...st.fall]) {
      feed(z.min.x); feed(z.min.y); feed(z.min.z); feed(z.max.x); feed(z.max.y); feed(z.max.z);
      if (z.obb) { feed(z.obb.c.x); feed(z.obb.c.y); feed(z.obb.c.z); feed(z.obb.yaw * 1000); feed(z.obb.hl); feed(z.obb.hw); feed(z.obb.hh); }
    }
    feed(st.spawn.pos.x); feed(st.spawn.pos.y); feed(st.spawn.pos.z);
  }
  return h.toString(16).padStart(8, '0');
}

export function recordKey(mapId: string, version: string) { return `surfstrike.skill.${mapId}.${version}`; }

/**
 * Versão usada nas chaves dos recordes e fantasmas: hash da geometria + versão das regras
 * (SKILL.rulesVersion). PBs feitos com regras antigas não se misturam com os novos.
 */
export function recordVersion(geometryHash: string, rules = SKILL.rulesVersion) { return `${geometryHash}.r${rules}`; }

/** Interface de armazenamento: troque por um backend no futuro. */
export interface RecordStore {
  load(mapId: string, version: string, stageCount: number): MapRecords;
  save(rec: MapRecords): void;
}

/** Armazenamento em memória (testes e fallback quando o navegador não guarda dados). */
export class MemoryRecordStore implements RecordStore {
  private data = new Map<string, MapRecords>();
  load(mapId: string, version: string, stageCount: number): MapRecords {
    const r = this.data.get(recordKey(mapId, version));
    return r ? structuredClone(r) : emptyRecords(mapId, version, stageCount);
  }
  save(rec: MapRecords) { this.data.set(recordKey(rec.mapId, rec.version), structuredClone(rec)); }
}

/** Valida um objeto lido do armazenamento (dados corrompidos/antigos viram recordes vazios). */
export function sanitizeRecords(raw: unknown, mapId: string, version: string, stageCount: number): MapRecords {
  const r = raw as Partial<MapRecords> | null;
  if (!r || r.mapId !== mapId || r.version !== version || r.stageCount !== stageCount || !Array.isArray(r.top) || !Array.isArray(r.bestStages)) {
    return emptyRecords(mapId, version, stageCount);
  }
  return {
    mapId, version, stageCount,
    pb: r.pb && typeof r.pb.ticks === 'number' ? r.pb : null,
    bestStages: r.bestStages.slice(0, stageCount).map((b) => (typeof b === 'number' ? b : null)),
    attempts: Number(r.attempts) || 0,
    completions: Number(r.completions) || 0,
    top: r.top.filter((e) => e && typeof e.ticks === 'number').slice(0, SKILL.topN),
  };
}
