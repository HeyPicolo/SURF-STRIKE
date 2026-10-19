// =============================================================
//  SURF SKILL — modo de percurso contra o cronômetro (sem combate)
//  Regras do modo e metadados dos mapas (nome, tier, stages e spawns).
//  O menu, o HUD e os construtores de mapa leem tudo daqui.
// =============================================================
import { PHYSICS } from './physics';

export const SKILL = {
  /** Só a faca no viewmodel (com o bônus de velocidade dela). */
  knifeOnly: true,
  /** Mantém o sprint automático do jogo principal. */
  autoSprint: true,
  /** Velocidade horizontal máxima dentro de uma zona de início (prespeed cap, como no CS2). */
  prespeedCap: 420,
  /** Pular dentro da zona de início é bloqueado (impede bhop para ganhar prespeed). */
  blockJumpInStart: true,
  /** Tempo oficial em ticks da simulação. */
  tickRate: PHYSICS.tickRate,
  /** Ranking local por mapa. */
  topN: 10,
  /** Altura extra das zonas (as paredes translúcidas) acima do piso. */
  zoneHeight: 180,
};

export type SkillTier = 1 | 2 | 3;

/** Cores dos tiers no menu e no HUD (T1 verde, T2 amarelo, T3 vermelho). */
export const TIER_COLORS: Record<SkillTier, string> = { 1: '#3ddc84', 2: '#ffd23c', 3: '#ff4757' };
export const TIER_LABELS: Record<SkillTier, string> = { 1: 'TIER 1 · Iniciante', 2: 'TIER 2 · Intermediário', 3: 'TIER 3 · Avançado' };

export interface SkillStageMeta {
  name: string;
  /** Posição de spawn (dentro da zona de início do stage). */
  spawn: [number, number, number];
  yaw: number;
}

export interface SkillMapMeta {
  id: string;
  name: string;
  tier: SkillTier;
  /** Cor de destaque do mapa. */
  color: number;
  /** Cor das rampas de cada stage (indica o stage). */
  stageColors: number[];
  desc: string;
  stages: SkillStageMeta[];
}

/** Cada stage fica numa "ilha" própria ao longo do eixo X; anda-se sempre para −Z. */
export const STAGE_SPACING = 9000;
const st = (name: string, k: number, y: number): SkillStageMeta => ({ name, spawn: [k * STAGE_SPACING, y, 120], yaw: 0 });

export const SKILL_MAPS: SkillMapMeta[] = [
  {
    id: 'sky_steps', name: 'SKY STEPS', tier: 1, color: 0x3ddc84,
    stageColors: [0x9ff0c4, 0x8fe3e8, 0xa8c8ff, 0xc9b8ff, 0xffc8e6],
    desc: 'Rampas largas e suaves, retas longas e transições com folga. Ideal para aprender a segurar a rampa.',
    stages: [
      st('Primeiro contato', 0, 3000), st('Reta longa', 1, 3000), st('Degraus', 2, 3000),
      st('Dupla', 3, 3000), st('Curva leve', 4, 3000),
    ],
  },
  {
    id: 'drift_canyon', name: 'DRIFT CANYON', tier: 2, color: 0xffd23c,
    stageColors: [0xffe08a, 0xffc46b, 0xff9f5a, 0xf2a6ff, 0x9fe3ff],
    desc: 'Rampas mais estreitas, transições rampa-rampa, curvas, mudanças de altura e um pouco de bhop.',
    stages: [
      st('Garganta', 0, 3400), st('Zigue', 1, 3400), st('Desfiladeiro', 2, 3400),
      st('Saltos', 3, 3400), st('Cânion final', 4, 3400),
    ],
  },
  {
    id: 'storm_spire', name: 'STORM SPIRE', tier: 3, color: 0xff4757,
    stageColors: [0xff8c8c, 0xff6b9a, 0xd56bff, 0x8c7bff, 0x5ad1ff],
    desc: 'Rampas estreitas no limite do surf, transições rápidas em lados alternados e gaps longos. Pouca margem de erro.',
    stages: [
      st('Relâmpago', 0, 3800), st('Alternância', 1, 3800), st('Fenda', 2, 3800),
      st('Espiral', 3, 3800), st('Olho da tempestade', 4, 3800),
    ],
  },
];

export function skillMapMeta(id: string): SkillMapMeta {
  const m = SKILL_MAPS.find((x) => x.id === id);
  if (!m) throw new Error(`mapa de Surf Skill desconhecido: ${id}`);
  return m;
}

/** mm:ss.cc a partir de ticks (determinístico). */
export function formatTicks(ticks: number): string {
  const cs = Math.round((ticks * 100) / SKILL.tickRate);
  const m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

/** Diferença assinada (+00.42 / −01.10) a partir de ticks. */
export function formatDiff(ticks: number): string {
  const sign = ticks > 0 ? '+' : ticks < 0 ? '−' : '±';
  const cs = Math.round((Math.abs(ticks) * 100) / SKILL.tickRate);
  const m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return m > 0 ? `${sign}${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}` : `${sign}${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
