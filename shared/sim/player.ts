import { V3 } from '../math/vec3';
import { PhysState, emptyCmd, MoveCmd } from '../physics/movement';
import { PHYSICS, SPRINT } from '../config/physics';
import { WEAPONS, WeaponId, NadeKind, SLOT_KNIFE, SLOT_NADES, ITEMS } from '../config/weapons';
import { CLASSES, ClassId } from '../config/classes';
import type { Team } from '../maps/types';

export interface WeaponState { id: WeaponId; mag: number; reserve: number; /** segundos até recarregar a carga (taser) */ recharge?: number; }

export interface PlayerInput {
  cmd: MoveCmd;
  fire: boolean;
  alt: boolean;
  reload: boolean;
  use: boolean;
  ability: boolean;
  drop: boolean;
  /** 0..3 = slot selected this tick (keys 1/2/3/4), null = no change */
  slot: number | null;
}

export function emptyInput(): PlayerInput {
  return { cmd: emptyCmd(), fire: false, alt: false, reload: false, use: false, ability: false, drop: false, slot: null };
}

export interface PlayerStats { kills: number; deaths: number; damage: number; headshots: number; assists: number; }

export class Player {
  phys = new PhysState();
  /** previous tick position (render interpolation) */
  prevPos = new V3();
  yaw = 0;
  pitch = 0;
  input: PlayerInput = emptyInput();
  prevInput: PlayerInput = emptyInput();

  alive = true;
  hp: number = ITEMS.maxHp;
  armor = 0;
  shield = 0;
  shieldTime = 0;

  /** [primária, secundária (pistola), faca, taser] */
  weapons: (WeaponState | null)[] = [null, null, null, null];
  /** 0 primária, 1 secundária, 2 faca, 3 taser, 4 granadas */
  slot = SLOT_KNIFE;
  lastWeaponSlot = SLOT_KNIFE;
  /** golpe pesado da faca em andamento (para animação) */
  lastMeleeHeavy = false;

  // ---- Tactical Sprint / Slide ----
  sprinting = false;
  /** Shift: caminhando (sem sprint, sem som de passos) */
  walking = false;
  /** stamina oculta do sprint (segundos) */
  stamina: number = SPRINT.stamina;
  /** esgotou: só volta a correr acima de SPRINT.restartStamina */
  staminaLocked = false;
  sinceSprint = 99;
  /** tempo restante para abaixar a arma e poder atirar */
  raiseTime = 0;
  slideTime = 0;
  slideCooldown = 0;
  slideRecover = 0;
  /** depois de cancelar o slide com agachar, ignora o agachar até soltar a tecla */
  crouchSuppressed = false;
  /** agachar apertado pouco antes de pousar ainda conta para o slide automático */
  crouchBuffer = 0;
  /** tempo restante sem atrito no chão depois de sair de um teleporte */
  teleportGlide = 0;
  /** velocidade horizontal antes do movimento deste tick (jump pads usam a velocidade de entrada) */
  entrySpeed = 0;
  nades: Record<NadeKind, number> = { he: 0, smoke: 0, impulse: 0 };
  nadeSel: NadeKind = 'he';
  fireCooldown = 0;
  switchTime = 0;
  reloadTime = 0;
  zoomed = false;
  punchPitch = 0;
  punchYaw = 0;
  shotsFired = 0;
  lastShotTime = 0;

  // ability & buffs
  abilityCd = 0;
  abilityActive = 0;
  tired = 0;
  speedBoost = 0;
  predatorStacks = 0;
  predatorStackTime = 0;
  lastCombat = -100;
  furyUsed = false;

  frozen = false;
  inDuel = -1;
  noAbilities = false;
  fly = false;
  autoBhop = true;
  triggerCd = 0;
  respawnTimer = 0;
  lastAttacker = -1;
  deathPos = new V3();
  /** For hit/kill feedback */
  stats: PlayerStats = { kills: 0, deaths: 0, damage: 0, headshots: 0, assists: 0 };
  damagedBy = new Map<number, number>();
  isDummy = false;

  constructor(
    public id: number,
    public name: string,
    public team: Team,
    public classId: ClassId,
    public isBot: boolean,
  ) {}

  get cls() { return CLASSES[this.classId]; }
  get eyeHeight() { return this.phys.eyeHeight(); }
  eyePos(out = new V3()): V3 { return out.set(this.phys.pos.x, this.phys.pos.y + this.eyeHeight, this.phys.pos.z); }

  currentWeapon(): WeaponState | null { return this.slot < SLOT_NADES ? this.weapons[this.slot] : null; }

  giveWeapon(id: WeaponId): WeaponState {
    const def = WEAPONS[id];
    const ws: WeaponState = { id, mag: def.mag, reserve: def.reserve };
    this.weapons[def.slot] = ws;
    return ws;
  }

  resetForRound(classId?: ClassId) {
    if (classId) this.classId = classId;
    this.alive = true;
    this.hp = ITEMS.maxHp; this.armor = ITEMS.spawnArmor; this.shield = 0; this.shieldTime = 0;
    this.weapons = [null, null, null, null];
    this.giveWeapon('knife');
    this.giveWeapon('taser');
    this.slot = SLOT_KNIFE; this.lastWeaponSlot = SLOT_KNIFE;
    this.resetMovementState();
    this.nades = { he: 0, smoke: 0, impulse: 0 };
    this.fireCooldown = 0; this.switchTime = 0; this.reloadTime = 0; this.zoomed = false;
    this.punchPitch = 0; this.punchYaw = 0; this.shotsFired = 0;
    this.abilityCd = 0; this.abilityActive = 0; this.tired = 0; this.speedBoost = 0;
    this.predatorStacks = 0; this.predatorStackTime = 0; this.furyUsed = false;
    this.inDuel = -1; this.noAbilities = false;
    this.phys.vel.set(0, 0, 0);
    this.phys.ducked = false; this.phys.maxs.y = PHYSICS.playerHeight;
    this.damagedBy.clear();
    this.lastAttacker = -1;
  }

  /** Arma levantada pelo sprint (só no modo de sprint tático clássico). */
  get weaponRaised(): boolean { return this.sprinting && SPRINT.raiseWeapon; }

  resetMovementState() {
    this.walking = false;
    this.sprinting = false; this.stamina = SPRINT.stamina; this.staminaLocked = false; this.sinceSprint = 99;
    this.raiseTime = 0; this.slideTime = 0; this.slideCooldown = 0; this.slideRecover = 0; this.crouchSuppressed = false; this.crouchBuffer = 0; this.teleportGlide = 0;
  }

  /** Multiplier applied only on the ground: weapon in hand (knife +25%), sprint, slide recovery. */
  groundSpeedMul(): number {
    let m = 1;
    const w = this.currentWeapon();
    if (w) m *= WEAPONS[w.id].moveSpeedMul;
    if (this.walking) m *= SPRINT.walkSpeedMul;
    else if (this.sprinting) m *= SPRINT.speedMul;
    if (this.slideRecover > 0) m *= SPRINT.slideRecoverSpeedMul;
    return m;
  }

  /** Movement speed multiplier from buffs/debuffs (ground and air). */
  speedMul(): number {
    let m = 1;
    if (this.zoomed) m *= 0.75;
    if (this.tired > 0) m *= CLASSES.jumper.params.tiredSpeedMul;
    if (this.speedBoost > 0) m *= 1.2;
    if (this.predatorStacks > 0) m *= 1 + this.predatorStacks * CLASSES.predator.params.stackSpeed;
    return m;
  }
}

/** Hitboxes (absolute AABBs) for a player. */
export function hitboxes(p: Player, head: { min: V3; max: V3 }, body: { min: V3; max: V3 }) {
  const pos = p.phys.pos;
  const h = p.phys.maxs.y; // 72 standing, 46 ducked
  const headSize = 9;
  head.min.set(pos.x - headSize, pos.y + h - headSize * 2 + 1, pos.z - headSize);
  head.max.set(pos.x + headSize, pos.y + h + 1, pos.z + headSize);
  body.min.set(pos.x - 14, pos.y, pos.z - 14);
  body.max.set(pos.x + 14, pos.y + h - headSize * 2 + 1, pos.z + 14);
}
