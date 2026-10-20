// Original low-poly models: characters (per team & class); weapons, items and gloves come from geometry.ts.
import { MeshBuilder } from '../render/mesh';
import type { Renderer, GpuMesh } from '../render/Renderer';
import type { ClassId } from '../../../shared/config/classes';
import { CLASSES } from '../../../shared/config/classes';
import type { WeaponId, NadeKind } from '../../../shared/config/weapons';
import type { Team, PickupKind } from '../../../shared/maps/types';
import { weaponGeometry, butterflyGeometry, pickupGeometry, nadeGeometry, gunGloveGeometry, knifeGloveGeometry, Lod } from './geometry';
import { PICKUP_COLORS } from './style';

export const TEAM_COLORS: Record<Team, number> = { blue: 0x2f7bff, red: 0xff4757 };
const TEAM_DARK: Record<Team, number> = { blue: 0x1d3f8f, red: 0x8f1f2b };
const SUIT = 0xe8ecf3;
const DARK = 0x262b38;

export interface CharacterMeshes { legL: GpuMesh; legR: GpuMesh; torso: GpuMesh; head: GpuMesh; armL: GpuMesh; armR: GpuMesh; }

/** Pivots: legs at hip (y=32), torso at hip, head at neck (y=57), arms at shoulder (y=54, x=±16). */
export function buildCharacter(r: Renderer, team: Team, cls: ClassId): CharacterMeshes {
  const tc = TEAM_COLORS[team], td = TEAM_DARK[team], cc = CLASSES[cls].color;
  const leg = (side: number) => {
    const m = new MeshBuilder();
    m.box(-4.5, -32, -5, 4.5, 0, 5, td);
    m.box(-5, -32, -7, 5, -26, 5, DARK); // boot
    m.box(-4.6, -18, -5.4, 4.6, -14, -4.8, cc, 1); // knee light
    void side;
    return r.createMesh(m.toArray());
  };
  const torso = new MeshBuilder();
  torso.box(-12, 0, -6.5, 12, 25, 6.5, tc);
  torso.box(-12.5, 10, -7, 12.5, 14, 7, SUIT); // belt band
  torso.box(-6, 14, -7.2, 6, 22, -6.5, cc, 1); // chest emblem
  torso.box(-9, 4, 6.5, 9, 22, 10, DARK); // backpack
  if (cls === 'runner') {
    // aerodynamic back fins
    torso.box(-8, 12, 9.5, -6, 30, 18, cc, 0.6);
    torso.box(6, 12, 9.5, 8, 30, 18, cc, 0.6);
  } else if (cls === 'berserker') {
    // heavy shoulder pads
    torso.box(-19, 19, -8, -10, 29, 8, DARK);
    torso.box(10, 19, -8, 19, 29, 8, DARK);
    torso.box(-19, 27, -8.5, -10, 29.5, 8.5, cc, 1);
    torso.box(10, 27, -8.5, 19, 29.5, 8.5, cc, 1);
  } else if (cls === 'predator') {
    // spine spikes
    for (let i = 0; i < 3; i++) torso.box(-1.5, 8 + i * 6, 10, 1.5, 12 + i * 6, 15, cc, 0.7);
  } else if (cls === 'jumper') {
    // gyroscope core on the back
    torso.cylinder(0, 10, 12, 5, 10, 6, cc, 0.9);
  }
  const head = new MeshBuilder();
  head.box(-7.5, 0, -7.5, 7.5, 15, 7.5, SUIT);
  head.box(-6.5, 5, -8.2, 6.5, 10, -7.5, cc, 1); // visor
  head.box(-8, 0, -6, 8, 3, 6, td); // collar
  if (cls === 'predator') {
    head.box(-8, 12, -3, -5, 20, 0, 0x2b2b2b); head.box(5, 12, -3, 8, 20, 0, 0x2b2b2b);
  } else if (cls === 'berserker') {
    head.box(-1.5, 15, -6, 1.5, 21, 7, cc, 0.4);
  } else if (cls === 'jumper') {
    head.ring(0, 22, 0, 6, 9, 10, cc, 1);
  } else if (cls === 'runner') {
    head.box(-7.8, 10, -7.8, 7.8, 12, 7.8, cc, 1); // headband
  }
  const arm = () => {
    const m = new MeshBuilder();
    m.box(-3.5, -24, -3.5, 3.5, 2, 3.5, tc);
    m.box(-3.8, -26, -3.8, 3.8, -20, 3.8, DARK); // glove
    return r.createMesh(m.toArray());
  };
  return { legL: leg(-1), legR: leg(1), torso: r.createMesh(torso.toArray()), head: r.createMesh(head.toArray()), armL: arm(), armR: arm() };
}

// ---------------------------------------------------------------- armas, faca, granadas, itens e luvas
// A geometria fica em geometry.ts (sem GL, testável); aqui só vira GpuMesh, uma vez no carregamento.

/** Arma: 'view' = primeira pessoa (detalhada), 'world' = terceira pessoa e chão (simplificada). */
export function buildWeapon(r: Renderer, id: WeaponId, lod: Lod = 'world'): GpuMesh {
  return r.createMesh(weaponGeometry(id, lod).toArray());
}

export interface ButterflyParts { blade: GpuMesh; safe: GpuMesh; bite: GpuMesh; }

export function buildButterflyParts(r: Renderer): ButterflyParts {
  const g = butterflyGeometry();
  return { blade: r.createMesh(g.blade.toArray()), safe: r.createMesh(g.safe.toArray()), bite: r.createMesh(g.bite.toArray()) };
}

export function buildPickup(r: Renderer, kind: PickupKind, lod: Lod = 'world'): GpuMesh {
  return r.createMesh(pickupGeometry(kind, lod).toArray());
}

/** Granada por tipo ('view' na mão, 'world' lançada). */
export function buildGrenade(r: Renderer, kind: NadeKind, lod: Lod = 'world'): GpuMesh {
  return r.createMesh(nadeGeometry(kind, lod).toArray());
}

export interface GloveMeshes { gun: GpuMesh; knife: GpuMesh; }
export function buildGloves(r: Renderer): GloveMeshes {
  return { gun: r.createMesh(gunGloveGeometry().toArray()), knife: r.createMesh(knifeGloveGeometry().toArray()) };
}

export { PICKUP_COLORS };

/** Unit-ish meshes reused for effects */
export function buildCube(r: Renderer, color = 0xffffff, emissive = 1): GpuMesh {
  const m = new MeshBuilder();
  m.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, color, emissive);
  return r.createMesh(m.toArray());
}
