// =============================================================
//  Mirar pela alça (ADS): posição do viewmodel que põe a linha de visada (alça → massa/ponto) do
//  modelo exatamente no eixo da câmera. Sem rotação: a linha de visada dos modelos é horizontal
//  (y igual na alça e na massa, ver WEAPON_REFS.sight).
// =============================================================
import type { WeaponId } from '../../../shared/config/weapons';
import { sightRef } from '../entities/attachGeometry';
import type { Build } from '../../../shared/sim/loadout';

/** escala do viewmodel das armas de fogo (a mesma da posição de quadril) */
export const VM_SCALE = 0.72;

export interface AdsTarget { x: number; y: number; z: number }

/**
 * Posição do modelo (origem no punho) em coordenadas da câmera com a mira toda; null = arma sem ADS.
 * Com mira no build (rodada 12b), a linha de visada é a da mira (ponto vermelho, retícula, luneta).
 */
export function adsPose(id: WeaponId, build?: Build): AdsTarget | null {
  const r = sightRef(id, build);
  if (!r) return null;
  return { x: 0, y: -VM_SCALE * r.y, z: -r.dist - VM_SCALE * r.rearZ };
}

/** Suavização da transição (o sim anda linear no tempo da arma). */
export const adsEase = (k: number) => k * k * (3 - 2 * k);
