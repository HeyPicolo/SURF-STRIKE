import type { V3 } from '../math/vec3';
import type { Brush } from '../physics/brush';

export type Team = 'blue' | 'red';

export interface SpawnPoint { pos: V3; yaw: number; }

export type PickupKind =
  | 'weapon' | 'ammo' | 'medkit' | 'armor'
  | 'nade_he' | 'nade_smoke' | 'nade_impulse'
  | 'shield' | 'speed';

export interface PickupSpawn {
  /** Item padrão (usado quando o ponto não tem pool). */
  kind: PickupKind;
  weapon?: string;
  pos: V3;
  /** Pool de itens sorteado a cada round (ver config/pickups.ts). */
  pool?: import('../config/pickups').PoolId;
  /** Pontos com o mesmo grupo recebem o mesmo item (espelhamento entre times). */
  group?: string;
}

export interface TriggerVolume {
  min: V3;
  max: V3;
}

export interface Teleporter extends TriggerVolume {
  kind: 'teleport';
  dest: V3;
  destYaw: number;
  /** If set, destination depends on the user's team (e.g. recovery pads). */
  teamDest?: Record<Team, { pos: V3; yaw: number }>;
  keepVelocity: boolean;
  color: number;
}

export interface JumpPad extends TriggerVolume {
  kind: 'jumppad';
  velocity: V3;
  color: number;
}

export type Trigger = Teleporter | JumpPad;

export type DecorKind = 'cloud' | 'island' | 'ring' | 'pylon';
export interface Decor { kind: DecorKind; pos: V3; scale: number; color?: number; rot?: number; }

/** Waypoint for bot navigation. */
export interface NavPoint {
  p: V3;
  /** walk: steer on ground. surf: surf toward this point keeping contact with the ramp. drop: walk off / fly to. */
  mode: 'walk' | 'surf' | 'air';
  /** radius to consider reached */
  r?: number;
}
export interface BotRoute { name: string; points: NavPoint[]; }

export interface DuelArena { center: V3; a: SpawnPoint; b: SpawnPoint; }

export interface MapDef {
  name: string;
  brushes: Brush[];
  triggers: Trigger[];
  spawns: Record<Team, SpawnPoint[]>;
  pickups: PickupSpawn[];
  decor: Decor[];
  routes: Record<Team, BotRoute[]>;
  /** Positions on the central area where bots roam/fight. */
  combatNodes: V3[];
  duelArenas: DuelArena[];
  waitingRoom: SpawnPoint;
  recovery: SpawnPoint;
  killY: number;
  trainingSpawn: SpawnPoint;
  trainingTargets: SpawnPoint[];
}
