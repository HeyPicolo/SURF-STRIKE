// =============================================================
//  Métricas de dificuldade dos mapas do Surf Skill e o índice que as resume.
//  As métricas de projeto vêm da geometria (skillKit calcula por segmento); o tempo e o pico de
//  velocidade vêm do percurso de referência (scripts/skill-metrics.ts grava skillReference.ts).
// =============================================================
import type { MapDef } from './types';

export interface MapMetrics {
  minHalfWidth: number;
  avgHalfWidth: number;
  /** faixa de inclinação em normal Y */
  minNormalY: number;
  maxNormalY: number;
  maxGap: number;
  /** velocidade mínima de projeto (balística) no pior gap */
  minSpeed: number;
  maxAirTime: number;
  transitions: number;
  maxTurn: number;
  ramps: number;
  segments: number;
  tunnel: boolean;
  ascending: boolean;
  bhop: boolean;
}

export interface RefResult { ticks: number; peak: number }

export function mapMetrics(map: MapDef): MapMetrics {
  const ds = map.skill!.segments.map((s) => s.design);
  const ramps = ds.reduce((a, d) => a + d.ramps, 0);
  return {
    minHalfWidth: Math.min(...ds.map((d) => d.minHalfWidth)),
    avgHalfWidth: Math.round(ds.reduce((a, d) => a + d.sumHalfWidth, 0) / Math.max(1, ramps)),
    minNormalY: Math.min(...ds.map((d) => d.minNormalY)),
    maxNormalY: Math.max(...ds.map((d) => d.maxNormalY)),
    maxGap: Math.max(...ds.map((d) => d.maxGap)),
    minSpeed: Math.max(...ds.map((d) => d.minSpeed)),
    maxAirTime: Math.max(...ds.map((d) => d.maxAirTime)),
    transitions: ds.reduce((a, d) => a + d.transitions, 0),
    maxTurn: Math.max(...ds.map((d) => d.maxTurn)),
    ramps,
    segments: ds.length,
    tunnel: ds.some((d) => d.tunnel),
    ascending: ds.some((d) => d.ascending),
    bhop: ds.some((d) => d.bhop),
  };
}

/**
 * Índice de dificuldade: soma ponderada das métricas, cada uma normalizada para ~1 num mapa
 * "difícil" de referência. Pesa técnica (largura, inclinação, gaps, velocidade, tempo de ar,
 * curvas) e resistência (transições e duração: quanto mais longo, mais chance de errar).
 */
export const INDEX_WEIGHTS = {
  narrow: 12,      // 200 / meia-largura média
  steep: 10,       // (0,7 − normal Y mínima) / 0,3
  gap: 10,         // maior gap / 1000
  speed: 10,       // velocidade mínima / 1000
  air: 8,          // tempo de ar máximo (s)
  transitions: 15, // transições / 20
  turn: 10,        // curva máxima / 90°
  time: 30,        // tempo de referência / 60 s
  peak: 10,        // pico de velocidade / 2000
};

export function difficultyIndex(m: MapMetrics, ref: RefResult): number {
  const W = INDEX_WEIGHTS;
  const v = W.narrow * (200 / m.avgHalfWidth)
    + W.steep * ((0.7 - m.minNormalY) / 0.3)
    + W.gap * (m.maxGap / 1000)
    + W.speed * (Math.min(m.minSpeed, 3000) / 1000)
    + W.air * Math.min(m.maxAirTime, 3)
    + W.transitions * (m.transitions / 20)
    + W.turn * (m.maxTurn / 90)
    + W.time * (ref.ticks / 100 / 60)
    + W.peak * (ref.peak / 2000);
  return Math.round(v * 10) / 10;
}
