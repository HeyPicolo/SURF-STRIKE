// =============================================================
//  Arsenal — todos os atributos são dados (balanceamento aqui).
//  Ângulos em graus, tempos em segundos, distâncias em unidades.
// =============================================================
export type WeaponId = 'pistol' | 'rifle' | 'smg' | 'shotgun' | 'sniper' | 'knife' | 'taser';
/** 0 = primária, 1 = secundária (pistola), 2 = faca, 3 = taser. As granadas usam o slot 4 do jogador. */
export type WeaponSlot = 0 | 1 | 2 | 3;
export const SLOT_PRIMARY = 0, SLOT_SECONDARY = 1, SLOT_KNIFE = 2, SLOT_TASER = 3, SLOT_NADES = 4;
/** Tecla mostrada para cada slot (faca e taser dividem a tecla 3, como no CS). */
export const SLOT_KEYS = ['1', '2', '3', '3', '4'];

/** Ataque corpo a corpo (faca). */
export interface MeleeDef {
  range: number;           // alcance do golpe leve
  heavyRange: number;      // alcance do golpe pesado
  heavyDamage: number;
  heavyHeadMult: number;
  heavyInterval: number;   // segundos entre golpes pesados
  backstabDamage: number;  // golpe leve pelas costas
  heavyBackstabDamage: number;
  /** quanto as caixas de acerto crescem para o golpe (tolerância de mira) */
  hitPadding: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  category: string;
  slot: WeaponSlot;
  damage: number;          // por projétil
  headMult: number;
  pellets: number;
  auto: boolean;
  rpm: number;             // disparos por minuto
  mag: number;
  reserve: number;         // munição reserva inicial ao pegar
  reloadTime: number;
  /** spread base (graus) parado no chão */
  spread: number;
  /** spread adicional no ar/surfando (mantido baixo de propósito: combate em velocidade) */
  airSpread: number;
  /** spread adicional andando no chão a toda velocidade */
  moveSpread: number;
  /** recuo vertical por disparo (graus) */
  kick: number;
  /** variação horizontal aleatória por disparo (graus) */
  kickSide: number;
  /** velocidade de recuperação do recuo (graus/s) */
  recover: number;
  /** distância a partir da qual o dano cai pela metade (efeito exponencial) */
  falloffHalf: number;
  range: number;
  moveSpeedMul: number;
  /** mira secundária (zoom) — FOV multiplicador; 0 = sem zoom */
  zoom: number;
  /** spread com zoom (sniper) */
  zoomSpread?: number;
  color: number;
  /** presente apenas em armas brancas */
  melee?: MeleeDef;
  /** Arma inicial que não aparece no mapa nem cai ao morrer (taser). */
  starter?: boolean;
  /** Recarga automática da carga, em segundos (taser: sem munição reserva). */
  recharge?: number;
  /** Se o centro da mira acerta um inimigo até esta distância, o tiro sai sem spread. */
  preciseRange?: number;
  /** Folga extra nas caixas de acerto dos inimigos para esta arma (taser). */
  hitPadding?: number;
}

// Ajustes globais de balanceamento (aplicados a todas as armas)
export const ACCURACY = {
  /** Multiplicador de todo o spread (base, no ar, andando e com zoom). 0.5 = metade do spread. */
  spreadMul: 0.5,
};
export const DAMAGE = {
  /** Multiplicador de dano das armas de fogo (faca e taser não mudam). */
  gunMul: 1.4,
};
export const RELOAD = {
  /** Velocidade de recarga: 1.45 = 45% mais rápida que o tempo base de cada arma. */
  speedMul: 1.45,
};
/** Tempo efetivo de recarga da arma. */
export function reloadDuration(def: WeaponDef): number { return def.reloadTime / RELOAD.speedMul; }

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  knife: {
    // faca borboleta (balisong): modelo e animações próprios do jogo
    id: 'knife', name: 'BALISONG', category: 'Faca borboleta', slot: 2,
    // golpe leve (clique esquerdo): 45 no corpo, 72 na cabeça, 2 golpes por segundo
    damage: 45, headMult: 1.6, pellets: 1, auto: true, rpm: 120, mag: 0, reserve: 0, reloadTime: 0,
    spread: 0, airSpread: 0, moveSpread: 0, kick: 0, kickSide: 0, recover: 20,
    falloffHalf: 1e9, range: 72,
    // andar com a faca na mão: +25% de velocidade base
    moveSpeedMul: 1.25, zoom: 0, color: 0x9aa6bd,
    melee: { range: 80, heavyRange: 70, heavyDamage: 75, heavyHeadMult: 1.4, heavyInterval: 1.05, backstabDamage: 135, heavyBackstabDamage: 300, hitPadding: 14 },
  },
  pistol: {
    id: 'pistol', name: 'VEX-9', category: 'Pistola', slot: 1,
    damage: 26, headMult: 2.8, pellets: 1, auto: false, rpm: 380, mag: 12, reserve: 48, reloadTime: 1.4,
    spread: 0.35, airSpread: 0.7, moveSpread: 0.4, kick: 1.4, kickSide: 0.5, recover: 9,
    falloffHalf: 2200, range: 6000, moveSpeedMul: 1.0, zoom: 0, color: 0x6c7a94,
  },
  rifle: {
    id: 'rifle', name: 'KESTREL AR', category: 'Rifle de assalto', slot: 0,
    damage: 31, headMult: 4.0, pellets: 1, auto: true, rpm: 600, mag: 30, reserve: 90, reloadTime: 2.2,
    // mais precisa: metade do spread anterior e recuo menor
    spread: 0.09, airSpread: 0.45, moveSpread: 0.3, kick: 0.45, kickSide: 0.2, recover: 8,
    falloffHalf: 5000, range: 9000, moveSpeedMul: 0.92, zoom: 0.8, color: 0x3a4255,
  },
  smg: {
    id: 'smg', name: 'HORNET', category: 'SMG', slot: 0,
    damage: 21, headMult: 2.5, pellets: 1, auto: true, rpm: 860, mag: 32, reserve: 128, reloadTime: 1.9,
    spread: 0.55, airSpread: 0.45, moveSpread: 0.25, kick: 0.36, kickSide: 0.28, recover: 9,
    falloffHalf: 1700, range: 5000, moveSpeedMul: 1.0, zoom: 0, color: 0x2f3442,
  },
  shotgun: {
    id: 'shotgun', name: 'BREAKER-12', category: 'Shotgun', slot: 0,
    damage: 14, headMult: 1.6, pellets: 9, auto: false, rpm: 72, mag: 6, reserve: 24, reloadTime: 2.4,
    spread: 4.2, airSpread: 0.6, moveSpread: 0.4, kick: 3.6, kickSide: 0.8, recover: 12,
    falloffHalf: 520, range: 2400, moveSpeedMul: 0.95, zoom: 0, color: 0x55392a,
  },
  sniper: {
    id: 'sniper', name: 'LONGBOW', category: 'Sniper', slot: 0,
    damage: 104, headMult: 3.0, pellets: 1, auto: false, rpm: 44, mag: 5, reserve: 20, reloadTime: 2.9,
    spread: 3.0, airSpread: 2.0, moveSpread: 1.2, kick: 4.2, kickSide: 0.6, recover: 6,
    falloffHalf: 30000, range: 16000, moveSpeedMul: 0.86, zoom: 0.28, zoomSpread: 0.02, color: 0x2b4a3a,
    // de perto (sem zoom) o tiro vai exatamente onde a mira aponta
    preciseRange: 900,
  },
  taser: {
    // taser de choque: 1 carga, alcance curtíssimo, elimina com um disparo; recarrega sozinho
    id: 'taser', name: 'VOLT-1', category: 'Taser', slot: 3, starter: true,
    damage: 500, headMult: 1, pellets: 1, auto: false, rpm: 60, mag: 1, reserve: 0, reloadTime: 0,
    spread: 0.25, airSpread: 0.35, moveSpread: 0.2, kick: 2.2, kickSide: 0.4, recover: 10,
    falloffHalf: 1e9, range: 200, moveSpeedMul: 1.0, zoom: 0, color: 0xffd23c,
    recharge: 30, hitPadding: 12,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
/** Armas de fogo (o que pode aparecer no mapa ou em duelos). */
export const GUN_IDS = WEAPON_IDS.filter((id) => !WEAPONS[id].melee && !WEAPONS[id].starter);

/** Fall-off: damage multiplier at distance d. */
export function falloff(def: WeaponDef, d: number): number {
  return Math.pow(0.5, d / def.falloffHalf);
}

// ---------------- Grenades & equipment ----------------
export type NadeKind = 'he' | 'smoke' | 'impulse';

export const NADES: Record<NadeKind, { name: string; fuse: number; impactDetonate: boolean; radius: number; damage: number; force: number; duration: number; color: number }> = {
  he: { name: 'Granada explosiva', fuse: 1.6, impactDetonate: false, radius: 360, damage: 98, force: 420, duration: 0, color: 0xff5a3c },
  smoke: { name: 'Granada de fumaça', fuse: 1.3, impactDetonate: false, radius: 300, damage: 0, force: 0, duration: 13, color: 0xcfd6e2 },
  impulse: { name: 'Granada de impulso', fuse: 2.0, impactDetonate: true, radius: 330, damage: 0, force: 1050, duration: 0, color: 0x37e3ff },
};

export const NADE_THROW_SPEED = 950;
export const NADE_SELF_DAMAGE = 0.5;

export const ITEMS = {
  medkitHeal: 50,
  armorAmount: 50,
  armorAbsorb: 0.5,       // fração do dano no corpo absorvida pelo colete
  shieldAmount: 50,
  shieldDuration: 12,
  speedDuration: 6,
  speedMul: 1.2,
  speedAirMul: 1.25,
  speedBoostImpulse: 180,
  /** Vida máxima de todos os jogadores. */
  maxHp: 150,
  maxArmor: 100,
  /** Todos nascem com colete cheio (exceto nos duelos 1v1, que são sem colete). */
  spawnArmor: 100,
  pickupRadius: 70,
  weaponPickupRadius: 110,
  respawnTrainingSeconds: 8,
};
