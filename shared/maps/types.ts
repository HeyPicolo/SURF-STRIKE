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
  /**
   * Caixa orientada (opcional): centro, direção (yaw) e meias-medidas ao longo da direção (hl),
   * na lateral (hw) e na vertical (hh). Quando presente, vale ela; min/max são o envelope.
   */
  obb?: { c: V3; yaw: number; hl: number; hw: number; hh: number };
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
  /** Não perde velocidade: a velocidade horizontal de quem entra é mantida (se for maior que a do pad). */
  keepSpeed?: boolean;
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
  /** Segurar o pulo (bhop) enquanto vai até este ponto (percursos de referência do Surf Skill). */
  jump?: boolean;
}
export interface BotRoute { name: string; points: NavPoint[]; }

export interface DuelArena { center: V3; a: SpawnPoint; b: SpawnPoint; }

/**
 * Um segmento do Surf Skill: um stage (mapas staged) ou o trecho entre dois checkpoints (mapas linear).
 * Staged: zona de início (com prespeed cap) → percurso → zona de fim, que leva ao início do próximo stage.
 * Linear: o "início" do trecho k > 0 é a plataforma de retorno do checkpoint; a zona de fim é o portal
 * do próximo checkpoint (passa-se por ele sem parar) ou a chegada.
 */
export interface SkillSegmentDef {
  index: number;
  name: string;
  kind: 'stage' | 'checkpoint';
  /** onde o jogador volta ao cair / reiniciar o segmento */
  spawn: SpawnPoint;
  /** zona de início (stage 1/largada: liga o cronômetro). Dentro dela: prespeed cap. */
  startZone: TriggerVolume;
  /** fim do segmento: zona de fim do stage, portal do próximo checkpoint ou a chegada */
  endZone: TriggerVolume;
  /** "Lava": tocar volta ao início do segmento atual com velocidade zero. */
  fall: TriggerVolume[];
  /** Segurança: abaixo desta altura também conta como queda. */
  fallY: number;
  color: number;
  /** Percurso de referência (testes, e2e): pontos para o steer.ts atravessar o segmento a partir do spawn. */
  route: NavPoint[];
  /** linear: índice da rota por onde segue quem chega embalado pelo portal (pula a saída da plataforma) */
  flowFrom: number;
  /** Dados de projeto do segmento (documentação e testes de dificuldade). */
  design: SegmentDesign;
}
/** compatibilidade com a rodada 7 */
export type SkillStageDef = SkillSegmentDef;

export interface SegmentDesign {
  minHalfWidth: number;
  /** soma das meias-larguras (para a média) e quantidade de rampas */
  sumHalfWidth: number;
  maxNormalY: number;
  minNormalY: number;
  ramps: number;
  /** transições (rampa → rampa / apoio) */
  transitions: number;
  bhop: boolean;
  /** velocidade horizontal mínima de projeto no pior gap */
  minSpeed: number;
  maxGap: number;
  /** maior tempo de ar previsto num gap (s) */
  maxAirTime: number;
  /** maior mudança de direção entre rampas consecutivas (graus) */
  maxTurn: number;
  tunnel: boolean;
  ascending: boolean;
}

export interface SkillCourseDef {
  id: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  format: 'staged' | 'linear';
  segments: SkillSegmentDef[];
}

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
  /** Abaixo desta altura o jogador caiu do mapa e volta para a base. */
  fallY: number;
  trainingSpawn: SpawnPoint;
  trainingTargets: SpawnPoint[];
  /** Presente nos mapas do Surf Skill. */
  skill?: SkillCourseDef;
}
