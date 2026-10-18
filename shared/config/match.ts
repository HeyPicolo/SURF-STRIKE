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

export const BOT_NAMES = [
  'n0va', 'driftking', 'Ksenia', 'tobyy', 'slipstream', 'Garrafão', 'zeph', 'm1ra', 'Rafinha_GG', 'pulse',
  'Oslo', 'kai.exe', 'vortexx', 'Bia', 'lowgrav', 'shrimpz', 'Tutu', 'arcadia', 'notsurfing', 'Pedrin',
  'hex', 'yuna', 'w0lfie', 'Duda', 'strafegod', 'Marquinhos', 'ice', 'fenrir', 'luz', 'cloudnine',
];
