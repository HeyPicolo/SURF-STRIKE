// Original low-poly models: characters (per team & class), weapons and pickups.
import { MeshBuilder } from '../render/mesh';
import type { Renderer, GpuMesh } from '../render/Renderer';
import type { ClassId } from '../../../shared/config/classes';
import { CLASSES } from '../../../shared/config/classes';
import type { WeaponId } from '../../../shared/config/weapons';
import { WEAPONS } from '../../../shared/config/weapons';
import type { Team, PickupKind } from '../../../shared/maps/types';

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

/** Weapon models: forward = −Z, origin at the grip. */
export function buildWeapon(r: Renderer, id: WeaponId): GpuMesh {
  const m = new MeshBuilder();
  const c = WEAPONS[id].color;
  const metal = 0x2a2f3b, light = 0x8e99ad;
  const neon = id === 'sniper' ? 0x37ff9a : id === 'shotgun' ? 0xff8a3c : id === 'smg' ? 0xffd23c : id === 'rifle' ? 0x37c6ff : 0xc77dff;
  switch (id) {
    case 'knife': {
      // cabo com guarda e lâmina angular de duas faces; filete luminoso no fio
      m.box(-1.3, -1.6, -1, 1.3, 1.6, 7, 0x262b38);
      m.box(-1.5, -1.2, 1.5, 1.5, -0.6, 2.2, 0x37e3ff, 1);
      m.box(-2.4, -2.6, -2.2, 2.4, 2.6, -1, metal); // guarda
      const blade = 0xd5dceb;
      m.quad([0, 1.8, -2.2], [0, 1.5, -15], [0.5, 0, -15.5], [0.6, 0, -2.2], blade);
      m.quad([0.6, 0, -2.2], [0.5, 0, -15.5], [0, -1.2, -14], [0, -1.6, -2.2], 0xb7c0d2);
      m.quad([0, 1.8, -2.2], [-0.6, 0, -2.2], [-0.5, 0, -15.5], [0, 1.5, -15], blade);
      m.quad([-0.6, 0, -2.2], [0, -1.6, -2.2], [0, -1.2, -14], [-0.5, 0, -15.5], 0xb7c0d2);
      m.tri([0, 1.5, -15], [0.5, 0, -15.5], [0, -0.2, -19], blade);
      m.tri([0, 1.5, -15], [0, -0.2, -19], [-0.5, 0, -15.5], blade);
      m.tri([0.5, 0, -15.5], [0, -1.2, -14], [0, -0.2, -19], 0xb7c0d2);
      m.tri([-0.5, 0, -15.5], [0, -0.2, -19], [0, -1.2, -14], 0xb7c0d2);
      m.beam([0, -1.5, -2.6], [0, -1.15, -13.8], 0.25, 0x37e3ff, 1);
      break;
    }
    case 'pistol':
      m.box(-1.6, 0, -13, 1.6, 4, 2, light);
      m.box(-1.3, -7, -1, 1.3, 0, 3, metal);
      m.box(-0.8, 0.5, -15, 0.8, 2.5, -13, metal);
      m.box(-1.7, 1.5, -11, 1.7, 2.3, -3, neon, 1);
      break;
    case 'rifle':
      m.box(-1.8, -1, -16, 1.8, 5, 6, c);
      m.box(-0.9, 1, -32, 0.9, 2.8, -16, metal);
      m.box(-1.6, -1.5, 6, 1.6, 4, 16, metal);
      m.box(-1.3, -9, -9, 1.3, -1, -5, metal);
      m.box(-1.2, -6, 0, 1.2, -1, 3, metal);
      m.box(-1, 5, -10, 1, 7, -4, light);
      m.box(-1.9, 2, -15, 1.9, 3, 4, neon, 1);
      break;
    case 'smg':
      m.box(-1.8, -1, -12, 1.8, 5, 4, c);
      m.box(-0.8, 1, -19, 0.8, 2.6, -12, metal);
      m.box(-1.2, -11, -7, 1.2, -1, -4, metal);
      m.box(-1.2, -6, 0, 1.2, -1, 3, metal);
      m.box(-0.6, 0, 4, 0.6, 3, 13, light);
      m.box(-1.9, 3, -11, 1.9, 4, 2, neon, 1);
      break;
    case 'shotgun':
      m.box(-2, -1, -12, 2, 5, 6, c);
      m.box(-1.6, 1.5, -36, 1.6, 4.5, -12, metal);
      m.box(-2.2, -1.5, -26, 2.2, 1.5, -16, light);
      m.box(-1.7, -2, 6, 1.7, 4, 18, c);
      m.box(-1.2, -6, 0, 1.2, -1, 3, metal);
      m.box(-2.1, 3.5, -11, 2.1, 4.5, 5, neon, 1);
      break;
    case 'sniper':
      m.box(-1.8, -1, -14, 1.8, 5, 8, c);
      m.box(-0.9, 1.2, -42, 0.9, 3, -14, metal);
      m.box(-1.7, -2, 8, 1.7, 5, 22, c);
      m.cylinder(0, 7, -2, 1.8, 1, 6, metal);
      m.box(-1.6, 6, -12, 1.6, 9, 4, metal);
      m.box(-1.2, -6, 0, 1.2, -1, 3, metal);
      m.box(-1.3, -7, -8, 1.3, -1, -4, metal);
      m.box(-1.9, 2.5, -13, 1.9, 3.5, 7, neon, 1);
      break;
  }
  return r.createMesh(m.toArray());
}

export function buildPickup(r: Renderer, kind: PickupKind): GpuMesh {
  const m = new MeshBuilder();
  switch (kind) {
    case 'medkit':
      m.box(-10, 0, -7, 10, 12, 7, 0xffffff);
      m.box(-2.5, 3, -7.4, 2.5, 9, -7, 0xff3b4f, 1); m.box(-6, 4.5, -7.4, 6, 7.5, -7, 0xff3b4f, 1);
      m.box(-2.5, 3, 7, 2.5, 9, 7.4, 0xff3b4f, 1); m.box(-6, 4.5, 7, 6, 7.5, 7.4, 0xff3b4f, 1);
      break;
    case 'armor':
      m.box(-10, 0, -4, 10, 18, 4, 0x3b4a66);
      m.box(-10.5, 12, -4.5, -5, 20, 4.5, 0x3b4a66); m.box(5, 12, -4.5, 10.5, 20, 4.5, 0x3b4a66);
      m.box(-7, 5, -4.6, 7, 9, -4, 0x5ec8ff, 1);
      break;
    case 'ammo':
      m.box(-9, 0, -6, 9, 10, 6, 0x6b5b2e);
      m.box(-9.4, 6, -6.4, 9.4, 8, 6.4, 0xffd23c, 1);
      break;
    case 'nade_he': m.blob(0, 7, 0, 6, 7, 6, 0xff5a3c, 0.3); m.box(-1.5, 13, -1.5, 1.5, 16, 1.5, 0x333333); break;
    case 'nade_smoke': m.cylinder(0, 0, 0, 5, 15, 8, 0xcfd6e2, 0.1); m.box(-1.5, 15, -1.5, 1.5, 18, 1.5, 0x333333); break;
    case 'nade_impulse': m.blob(0, 7, 0, 7, 7, 7, 0x37e3ff, 0.6); m.torus(0, 7, 0, 9, 1.2, 12, 4, 0xffffff, 1); break;
    case 'shield':
      m.cylinder(0, 0, 0, 12, 4, 6, 0x5ec8ff, 0.8);
      m.cylinder(0, 4, 0, 8, 6, 6, 0xffffff, 0.6);
      break;
    case 'speed':
      m.tri([-8, 0, 0], [4, 10, 0], [0, 10, 0], 0xffe14d, 1);
      m.tri([-2, 10, 0], [8, 10, 0], [-4, 22, 0], 0xffe14d, 1);
      m.tri([-8, 0, 0], [0, 10, 0], [4, 10, 0], 0xffe14d, 1);
      m.tri([-2, 10, 0], [-4, 22, 0], [8, 10, 0], 0xffe14d, 1);
      break;
    default:
      m.box(-6, 0, -6, 6, 12, 6, 0xffffff, 1);
  }
  return r.createMesh(m.toArray());
}

export const PICKUP_COLORS: Record<PickupKind, number> = {
  weapon: 0xffffff, ammo: 0xffd23c, medkit: 0xff3b4f, armor: 0x5ec8ff,
  nade_he: 0xff5a3c, nade_smoke: 0xcfd6e2, nade_impulse: 0x37e3ff, shield: 0x5ec8ff, speed: 0xffe14d,
};

export function buildGrenade(r: Renderer): GpuMesh {
  const m = new MeshBuilder();
  m.blob(0, 0, 0, 4, 4.5, 4, 0x3a4255, 0.2);
  return r.createMesh(m.toArray());
}

/** Unit-ish meshes reused for effects */
export function buildCube(r: Renderer, color = 0xffffff, emissive = 1): GpuMesh {
  const m = new MeshBuilder();
  m.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, color, emissive);
  return r.createMesh(m.toArray());
}
