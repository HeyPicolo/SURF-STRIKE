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
  /** Velocidade horizontal máxima dentro de uma zona de início e no tick em que sai dela (prespeed cap). */
  prespeedCap: 420,
  /** Pular dentro da zona de início. Liberado na rodada 8: ajuda a se posicionar, mas o cap impede embalo extra. */
  blockJumpInStart: false,
  /** Tempo oficial em ticks da simulação. */
  tickRate: PHYSICS.tickRate,
  /** Ranking local por mapa. */
  topN: 10,
  /** Altura extra das zonas (as paredes translúcidas) acima do piso. */
  zoneHeight: 180,
  /** Desbloqueio progressivo dos desafios (concluir o anterior libera o próximo). */
  progressiveUnlock: false,
};

/** Fantasma (replay do recorde pessoal). */
export const GHOST = {
  /** grava 1 amostra a cada N ticks (2 = 50 Hz) e interpola na reprodução */
  rateTicks: 2,
  /** keyframe (posição absoluta) a cada N amostras; entre eles, deltas em Int16 */
  keyEvery: 50,
  /** quantização das posições nos deltas (u) */
  posQuant: 1 / 8,
  /** tamanho máximo de uma gravação de 5 minutos (bytes) */
  maxBytes5min: 256 * 1024,
  /** padrões das configurações */
  defaultShow: true,
  defaultOpacity: 0.45,
  /** some suavemente quando está mais perto da câmera que isto (u) */
  fadeNear: 90,
  fadeFar: 260,
};

export type SkillTier = 1 | 2 | 3 | 4 | 5 | 6;
export const SKILL_TIERS: SkillTier[] = [1, 2, 3, 4, 5, 6];

/** Cor de destaque de cada tier (texto, bordas). T1 verde, T2 amarelo, T3 vermelho, T4 laranja escuro, T5 roxo, T6 preto com borda vermelha. */
export const TIER_COLORS: Record<SkillTier, string> = { 1: '#3ddc84', 2: '#ffd23c', 3: '#ff4757', 4: '#e8620c', 5: '#a35cff', 6: '#ff2a3d' };
/** Selo do tier: fundo, texto e borda. */
export const TIER_STYLE: Record<SkillTier, { bg: string; fg: string; border: string }> = {
  1: { bg: '#3ddc84', fg: '#0e1a33', border: '#3ddc84' },
  2: { bg: '#ffd23c', fg: '#0e1a33', border: '#ffd23c' },
  3: { bg: '#ff4757', fg: '#ffffff', border: '#ff4757' },
  4: { bg: '#c4500a', fg: '#ffffff', border: '#e8620c' },
  5: { bg: '#7b3fe0', fg: '#ffffff', border: '#a35cff' },
  6: { bg: '#0b0b0f', fg: '#ff2a3d', border: '#ff2a3d' },
};
export const TIER_LABELS: Record<SkillTier, string> = {
  1: 'TIER 1 · Iniciante', 2: 'TIER 2 · Intermediário', 3: 'TIER 3 · Avançado',
  4: 'TIER 4 · Difícil', 5: 'TIER 5 · Muito difícil', 6: 'TIER 6 · Extremo',
};

export type SkillCategory = 'treino' | 'desafio';
/** staged: stages separados com zona de início e fim; linear: percurso contínuo com checkpoints. */
export type SkillFormat = 'staged' | 'linear';

export interface SkillSegmentMeta {
  name: string;
  /** Posição de spawn (dentro da zona de início). Nos mapas linear o construtor calcula. */
  spawn?: [number, number, number];
  yaw?: number;
}
/** compatibilidade com a rodada 7 */
export type SkillStageMeta = SkillSegmentMeta;

export interface SkillMapMeta {
  id: string;
  name: string;
  category: SkillCategory;
  /** número do desafio (1–12) */
  num?: number;
  tier: SkillTier;
  format: SkillFormat;
  /** Cor de destaque do mapa. */
  color: number;
  /** Cor das rampas de cada segmento (indica o stage/trecho). */
  segmentColors: number[];
  desc: string;
  /** stages (staged) ou trechos entre checkpoints (linear), na ordem */
  segments: SkillSegmentMeta[];
  /** fora do menu (mapa curto usado nos testes automáticos) */
  hidden?: boolean;
}

/** Cada stage fica numa "ilha" própria ao longo do eixo X; anda-se sempre para −Z. */
export const STAGE_SPACING = 9000;
const st = (name: string, k: number, y: number): SkillSegmentMeta => ({ name, spawn: [k * STAGE_SPACING, y, 120], yaw: 0 });

/**
 * Stages dos desafios staged em grade (mantém as coordenadas dentro de ±40000):
 * colunas a cada 9000 u em X, linhas a cada 20000 u em Z; cada stage anda ~15000 u para −Z.
 */
export function gridStages(names: string[], y: number, cols: number): SkillSegmentMeta[] {
  return names.map((name, k) => {
    const col = k % cols, row = Math.floor(k / cols);
    return { name, spawn: [(col - (cols - 1) / 2) * 9000, y, 120 + 20000 - row * 20000], yaw: 0 };
  });
}
const named = (names: string[]): SkillSegmentMeta[] => names.map((name) => ({ name }));

export const SKILL_MAPS: SkillMapMeta[] = [
  {
    id: 'sky_steps', name: 'SKY STEPS', category: 'treino', tier: 1, format: 'staged', color: 0x3ddc84,
    segmentColors: [0x9ff0c4, 0x8fe3e8, 0xa8c8ff, 0xc9b8ff, 0xffc8e6],
    desc: 'Rampas largas e suaves, retas longas e transições com folga. Ideal para aprender a segurar a rampa.',
    segments: [
      st('Primeiro contato', 0, 3000), st('Reta longa', 1, 3000), st('Degraus', 2, 3000),
      st('Dupla', 3, 3000), st('Curva leve', 4, 3000),
    ],
  },
  {
    id: 'drift_canyon', name: 'DRIFT CANYON', category: 'treino', tier: 2, format: 'staged', color: 0xffd23c,
    segmentColors: [0xffe08a, 0xffc46b, 0xff9f5a, 0xf2a6ff, 0x9fe3ff],
    desc: 'Rampas mais estreitas, transições rampa-rampa, curvas, mudanças de altura e um pouco de bhop.',
    segments: [
      st('Garganta', 0, 3400), st('Zigue', 1, 3400), st('Desfiladeiro', 2, 3400),
      st('Saltos', 3, 3400), st('Cânion final', 4, 3400),
    ],
  },
  {
    id: 'storm_spire', name: 'STORM SPIRE', category: 'treino', tier: 3, format: 'staged', color: 0xff4757,
    segmentColors: [0xff8c8c, 0xff6b9a, 0xd56bff, 0x8c7bff, 0x5ad1ff],
    desc: 'Rampas estreitas no limite do surf, transições rápidas em lados alternados e gaps longos. Pouca margem de erro.',
    segments: [
      st('Relâmpago', 0, 3800), st('Alternância', 1, 3800), st('Fenda', 2, 3800),
      st('Espiral', 3, 3800), st('Olho da tempestade', 4, 3800),
    ],
  },
  // ---------------------------------------------------------------- DESAFIOS
  {
    id: 'coral_rush', name: 'CORAL RUSH', category: 'desafio', num: 1, tier: 2, format: 'staged', color: 0xff8a6b,
    segmentColors: [0xffb3a0, 0xff9e8a, 0xffc7a8, 0xffd0c2, 0xffa6b8, 0xffbfa0],
    desc: 'Stages curtos e limpos, rampas médias e retas. O primeiro salto de cada stage pune largada preguiçosa.',
    segments: gridStages(['Recife', 'Correnteza', 'Atol', 'Maré alta', 'Coral vermelho', 'Arrebentação'], 6000, 3),
  },
  {
    id: 'velvet_dunes', name: 'VELVET DUNES', category: 'desafio', num: 2, tier: 2, format: 'linear', color: 0xe0b46c,
    segmentColors: [0xf0d4a0, 0xe8c48c, 0xf4dcb4, 0xdcb98a, 0xf0cfa0, 0xe6c79c],
    desc: 'Linear longo e fluido: rampas longas em sequência e curvas abertas. Ensina a manter a velocidade por muito tempo.',
    segments: named(['Largada', 'Duna alta', 'Vale de veludo', 'Vento sul', 'Miragem', 'Oásis']),
  },
  {
    id: 'lantern_pass', name: 'LANTERN PASS', category: 'desafio', num: 3, tier: 3, format: 'staged', color: 0xff9f3d,
    segmentColors: [0xffc27a, 0xffb466, 0xffd08f, 0xffa95a, 0xffcf8a, 0xffbd73, 0xffe0a6],
    desc: 'Um degrau acima: linhas mais apertadas, curvas de 25 a 35° e trocas de face mais rápidas.',
    segments: gridStages(['Primeira lanterna', 'Beco', 'Ponte de papel', 'Vielas', 'Telhados', 'Festival', 'Portão'], 6500, 4),
  },
  {
    id: 'glacier_run', name: 'GLACIER RUN', category: 'desafio', num: 4, tier: 3, format: 'linear', color: 0x7fd8ff,
    segmentColors: [0xbfeaff, 0xa8e1ff, 0xd6f3ff, 0x9fd9f5, 0xc4ecff, 0xb1e4ff, 0xe0f7ff],
    desc: 'Introduz rampas ascendentes: suba usando o embalo da anterior. Gaps com mais tempo de ar.',
    segments: named(['Largada', 'Geleira', 'Fenda azul', 'Subida', 'Cristais', 'Avalanche', 'Iceberg']),
  },
  {
    id: 'iron_cathedral', name: 'IRON CATHEDRAL', category: 'desafio', num: 5, tier: 4, format: 'staged', color: 0xb08bff,
    segmentColors: [0x9aa3b8, 0xa8a0c4, 0x8f9bb5, 0xb2a7cc, 0x98a6bf, 0xa79cc2, 0x8e98b0, 0xbbb0d6],
    desc: 'Túneis e tetos baixos: rampas estreitas dentro de corredores fechados, onde o arco do salto precisa ser baixo.',
    segments: gridStages(['Nave', 'Cripta', 'Claustro', 'Abóbada', 'Órgão', 'Vitral', 'Campanário', 'Altar'], 7000, 4),
  },
  {
    id: 'skywire', name: 'SKYWIRE', category: 'desafio', num: 6, tier: 4, format: 'linear', color: 0x5ff0c8,
    segmentColors: [0xa8fff0, 0x8ff5e0, 0xb8ffe8, 0x9cf0e8, 0xc4fff4, 0x88ecd8, 0xd0fff6],
    desc: 'Air control: gaps longos com curva no ar e pousos em rampas desalinhadas que exigem air strafe preciso.',
    segments: named(['Largada', 'Cabo 1', 'Cabo 2', 'Cabo 3', 'Cabo 4', 'Cabo 5', 'Cabo 6']),
  },
  {
    // mapa curtíssimo, fora do menu: usado pelos testes automáticos (corrida de teste e fantasma)
    id: 'teste_curto', name: 'TESTE CURTO', category: 'treino', tier: 1, format: 'linear', color: 0x7fe9ff, hidden: true,
    segmentColors: [0x9ff0c4, 0xa8c8ff],
    desc: 'Percurso de teste.',
    segments: [{ name: 'Largada' }, { name: 'Checkpoint 1' }],
  },
];

/** Mapas visíveis no menu, por categoria. */
export function skillMapsOf(cat: SkillCategory): SkillMapMeta[] { return SKILL_MAPS.filter((m) => m.category === cat && !m.hidden); }

/** "STAGE" ou "CHECKPOINT" conforme o formato. */
export function segmentWord(format: SkillFormat, plural = false): string {
  return format === 'staged' ? (plural ? 'stages' : 'stage') : (plural ? 'checkpoints' : 'checkpoint');
}

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
