import { V3 } from '../math/vec3';
import { PhysState, emptyCmd, MoveCmd } from '../physics/movement';
import { PHYSICS } from '../config/physics';
import { WEAPONS, WeaponId, NadeKind } from '../config/weapons';
import { CLASSES, ClassId } from '../config/classes';
import type { Team } from '../maps/types';

export interface WeaponState { id: WeaponId; mag: number; reserve: number; }

export interface PlayerInput {
  cmd: MoveCmd;
  fire: boolean;
  alt: boolean;
  reload: boolean;
  use: boolean;
  ability: boolean;
  drop: boolean;
  /** 0,1,2 = slot selected this tick (keys 1/2/3), null = no change */
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
  hp = 100;
  armor = 0;
  shield = 0;
  shieldTime = 0;

  weapons: (WeaponState | null)[] = [null, null];
  /** 0 primary, 1 secondary, 2 grenades */
  slot = 1;
  lastWeaponSlot = 1;
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

  currentWeapon(): WeaponState | null { return this.slot < 2 ? this.weapons[this.slot] : null; }

  giveWeapon(id: WeaponId): WeaponState {
    const def = WEAPONS[id];
    const ws: WeaponState = { id, mag: def.mag, reserve: def.reserve };
    this.weapons[def.slot] = ws;
    return ws;
  }

  resetForRound(classId?: ClassId) {
    if (classId) this.classId = classId;
    this.alive = true;
    this.hp = 100; this.armor = 0; this.shield = 0; this.shieldTime = 0;
    this.weapons = [null, null];
    this.giveWeapon('pistol');
    this.slot = 1; this.lastWeaponSlot = 1;
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

  /** Movement speed multiplier from weapon weight and buffs. */
  speedMul(): number {
    let m = 1;
    const w = this.currentWeapon();
    if (w) m *= WEAPONS[w.id].moveSpeedMul;
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
