// =============================================================
//  Regras de partida (Team Elimination)
// =============================================================
export const MATCH = {
  roundsToWin: 6,
  roundTime: 90,
  prepTime: 3,        // jogadores congelados no spawn (preparação)
  countdown: 3,       // contagem regressiva
  roundEndTime: 5,
  duelTime: 45,       // tempo máximo da fase de duelos 1v1
  duelCountdown: 3,
  maxTeamSize: 5,
  maxHp: 150,
} as const;

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'god';

export interface BotSkill {
  label: string;
  reaction: number;      // s até começar a reagir a um inimigo visível
  aimSpeed: number;      // graus/s de rotação da mira
  aimError: number;      // graus de erro aleatório
  headshotBias: number;  // 0..1 chance de mirar na cabeça
  burst: number;         // tiros por rajada (armas automáticas)
  surfAssist: number;    // graus/s de correção no ar (compensa timing)
  abilityUse: number;    // 0..1 frequência de uso de habilidades
  viewDistance: number;
}

export const BOT_SKILL: Record<BotDifficulty, BotSkill> = {
  easy: { label: 'Fácil', reaction: 0.75, aimSpeed: 140, aimError: 5.5, headshotBias: 0.05, burst: 4, surfAssist: 35, abilityUse: 0.25, viewDistance: 3200 },
  medium: { label: 'Intermediário', reaction: 0.45, aimSpeed: 260, aimError: 3.2, headshotBias: 0.2, burst: 6, surfAssist: 35, abilityUse: 0.5, viewDistance: 5000 },
  hard: { label: 'Avançado', reaction: 0.26, aimSpeed: 420, aimError: 1.6, headshotBias: 0.4, burst: 9, surfAssist: 40, abilityUse: 0.8, viewDistance: 7000 },
  god: { label: 'GOD OF SURF', reaction: 0.13, aimSpeed: 900, aimError: 0.6, headshotBias: 0.7, burst: 14, surfAssist: 50, abilityUse: 1, viewDistance: 10000 },
};

/**
 * Mira humanizada dos bots (rodada 11). Tudo em segundos, graus e frações.
 * O movimento da mira tem duas fases: um flick balístico (curva de jerk mínimo: acelera e
 * desacelera, com erro no ponto final proporcional à amplitude, lei de Fitts) e o rastreamento
 * por uma mola amortecida que segue uma estimativa atrasada do alvo. Por cima vai um tremor
 * contínuo (ruído suave). Determinístico: todo sorteio sai do PRNG de cada bot (seed da partida).
 */
export interface BotAim {
  /** reação: mediana (s) e dispersão (sigma da log-normal: cauda longa) */
  reactionMedian: number;
  reactionSigma: number;
  /** reação extra (fração) para alvo a 90° do centro da visão e para alvo a 1500 u/s (surfando) */
  reactionPeriph: number;
  reactionSpeed: number;
  /** tempo de flick (Fitts): a + b·log2(1 + amplitude/largura do alvo) */
  flickTime: number;
  flickTimePerBit: number;
  /** erro do ponto final do flick (fração da amplitude) e viés médio (+ = overshoot) */
  flickError: number;
  overshoot: number;
  /** mola do rastreamento: rigidez (1/s²) e razão de amortecimento */
  stiffness: number;
  damping: number;
  /** atraso do rastreamento (s) e extra por 100°/s de velocidade angular do alvo */
  trackLag: number;
  trackLagPerSpeed: number;
  /** tremor contínuo (graus) e frequência (Hz) */
  tremor: number;
  tremorRate: number;
  /** erro do lead (fração da velocidade do alvo) */
  leadError: number;
  /** controle de recuo (0..1) e erro dele (fração, cresce em rajadas longas) */
  recoilControl: number;
  recoilError: number;
  /** espera para estabilizar o 1º tiro em média/longa distância (s, mín e máx) */
  stabilize: [number, number];
  /** atraso extra para trocar de alvo (s) e tempo mirando onde o alvo sumiu (s) */
  switchDelay: number;
  preAim: number;
  /** folga para apertar o gatilho (u em volta do hitbox; negativo = só com a mira bem dentro dele) */
  fireMargin: number;
  /** folga angular extra para apertar o gatilho (graus; pesa mais de longe) */
  fireAngle: number;
  /** erro extra sob dano (fração, por "susto" recente) */
  nervous: number;
  /** velocidade angular máxima da mão (graus/s) */
  maxTurn: number;
  /** tremida da mão no instante do clique (graus, aleatório a cada tiro) */
  clickJitter: number;
  /** chance de parar de andar para atirar (counter-strafe) em cada rajada */
  counterStrafe: number;
}

export const BOT_AIM: Record<BotDifficulty, BotAim> = {
  easy: {
    reactionMedian: 0.55, reactionSigma: 0.35, reactionPeriph: 0.7, reactionSpeed: 0.5,
    flickTime: 0.16, flickTimePerBit: 0.045, flickError: 0.22, overshoot: 0.05,
    stiffness: 80, damping: 0.75, trackLag: 0.13, trackLagPerSpeed: 0.06,
    tremor: 0.8, tremorRate: 1.1, leadError: 0.6, recoilControl: 0.25, recoilError: 0.5,
    stabilize: [0.35, 0.75], switchDelay: 0.35, preAim: 0.6, fireMargin: 7, fireAngle: 0.6, nervous: 0.8, maxTurn: 600, counterStrafe: 0.1, clickJitter: 0.6,
  },
  medium: {
    reactionMedian: 0.38, reactionSigma: 0.32, reactionPeriph: 0.6, reactionSpeed: 0.45,
    flickTime: 0.13, flickTimePerBit: 0.035, flickError: 0.15, overshoot: 0.05,
    stiffness: 130, damping: 0.8, trackLag: 0.1, trackLagPerSpeed: 0.045,
    tremor: 0.5, tremorRate: 1.2, leadError: 0.4, recoilControl: 0.45, recoilError: 0.4,
    stabilize: [0.25, 0.5], switchDelay: 0.25, preAim: 0.5, fireMargin: 6, fireAngle: 0.35, nervous: 0.6, maxTurn: 900, counterStrafe: 0.35, clickJitter: 0.6,
  },
  hard: {
    reactionMedian: 0.26, reactionSigma: 0.28, reactionPeriph: 0.5, reactionSpeed: 0.4,
    flickTime: 0.1, flickTimePerBit: 0.028, flickError: 0.1, overshoot: 0.04,
    stiffness: 170, damping: 0.85, trackLag: 0.085, trackLagPerSpeed: 0.03,
    tremor: 0.3, tremorRate: 1.3, leadError: 0.25, recoilControl: 0.65, recoilError: 0.3,
    stabilize: [0.16, 0.35], switchDelay: 0.18, preAim: 0.45, fireMargin: 2, fireAngle: 0.2, nervous: 0.4, maxTurn: 1300, counterStrafe: 0.65, clickJitter: 0.5,
  },
  god: {
    reactionMedian: 0.17, reactionSigma: 0.25, reactionPeriph: 0.4, reactionSpeed: 0.35,
    flickTime: 0.08, flickTimePerBit: 0.02, flickError: 0.06, overshoot: 0.03,
    stiffness: 280, damping: 0.9, trackLag: 0.055, trackLagPerSpeed: 0.02,
    tremor: 0.24, tremorRate: 1.4, leadError: 0.12, recoilControl: 0.8, recoilError: 0.18,
    stabilize: [0.1, 0.22], switchDelay: 0.12, preAim: 0.4, fireMargin: -1, fireAngle: 0.12, nervous: 0.25, maxTurn: 1800, counterStrafe: 0.85, clickJitter: 0.4,
  },
};

/** Faixas de taxa de acerto esperadas (acertos/tiros) com o KESTREL AR contra um alvo andando de lado. */
export const BOT_HITRATE: Record<BotDifficulty, Record<'short' | 'medium' | 'long', [number, number]>> = {
  easy: { short: [0.1, 0.35], medium: [0.01, 0.14], long: [0, 0.06] },
  medium: { short: [0.18, 0.45], medium: [0.08, 0.3], long: [0.04, 0.2] },
  hard: { short: [0.3, 0.6], medium: [0.22, 0.52], long: [0.14, 0.4] },
  god: { short: [0.5, 0.85], medium: [0.4, 0.75], long: [0.25, 0.6] },
};

/** Distâncias da bancada de mira (u). */
export const BOT_BENCH_DIST = { short: 400, medium: 1200, long: 2400 };

/** Audição dos bots (u): tiros, pulos/pousos e passos de quem corre. */
export const BOT_HEARING = { shot: 3200, jump: 900, step: 650, /** tiro com silenciador (rodada 12) */ shotSuppressed: 1100 };
/** Laser visível (rodada 12): o feixe denuncia o atirador — os bots o notam mais longe e fora do campo de visão. */
export const BOT_LASER = { viewMul: 1.3, anyAngle: true };

export const BOT_NAMES = [
  'n0va', 'driftking', 'Ksenia', 'tobyy', 'slipstream', 'Garrafão', 'zeph', 'm1ra', 'Rafinha_GG', 'pulse',
  'Oslo', 'kai.exe', 'vortexx', 'Bia', 'lowgrav', 'shrimpz', 'Tutu', 'arcadia', 'notsurfing', 'Pedrin',
  'hex', 'yuna', 'w0lfie', 'Duda', 'strafegod', 'Marquinhos', 'ice', 'fenrir', 'luz', 'cloudnine',
];
