// Original low-poly models: characters (per team & class); weapons, items and gloves come from geometry.ts.
import { MeshBuilder } from '../render/mesh';
import type { Renderer, GpuMesh } from '../render/Renderer';
import type { ClassId } from '../../../shared/config/classes';
import type { WeaponId, NadeKind } from '../../../shared/config/weapons';
import type { Team, PickupKind } from '../../../shared/maps/types';
import { weaponGeometry, butterflyGeometry, pickupGeometry, nadeGeometry, gunGloveGeometry, knifeGloveGeometry, Lod } from './geometry';
import { PICKUP_COLORS } from './style';
import { characterGeometry, CharLod, TEAM_COLORS } from './characters';

export { TEAM_COLORS };

export interface CharacterMeshes { legL: GpuMesh; legR: GpuMesh; torso: GpuMesh; head: GpuMesh; armL: GpuMesh; armR: GpuMesh; }

/**
 * Personagem (rodada 11b: estilo de blocos, geometria em characters.ts). Pivôs: pernas no quadril
 * (y=32), torso no quadril, cabeça no pescoço (y=57), braços no ombro (y=54). `lod` 'far' = de longe.
 */
export function buildCharacter(r: Renderer, team: Team, cls: ClassId, lod: CharLod = 'near'): CharacterMeshes {
  const g = characterGeometry(team, cls, lod);
  const mk = (k: keyof CharacterMeshes) => r.createMesh(g[k].toArray());
  return { legL: mk('legL'), legR: mk('legR'), torso: mk('torso'), head: mk('head'), armL: mk('armL'), armR: mk('armR') };
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
