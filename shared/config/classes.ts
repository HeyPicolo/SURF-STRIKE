// =============================================================
//  Classes — sistema extensível: adicione uma entrada em CLASSES
//  e implemente a habilidade em shared/sim/abilities.ts.
// =============================================================
export type ClassId = 'runner' | 'jumper' | 'predator' | 'berserker';

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  color: number;
  ability: { name: string; desc: string; cooldown: number; duration: number; resetOnKill: boolean };
  passive: { name: string; desc: string };
  params: Record<string, number>;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  runner: {
    id: 'runner', name: 'RUNNER', role: 'Mobilidade', color: 0x2ee6c0,
    ability: { name: 'Dash Aéreo', desc: 'Impulso controlado na direção da mira. Funciona no ar e no surf.', cooldown: 15, duration: 0, resetOnKill: true },
    passive: { name: 'Controle Aéreo', desc: 'Mais aceleração aérea para curvar durante o voo.' },
    params: { dashSpeed: 720, dashUpBias: 120, airAccelMul: 1.18, airCapMul: 1.12, maxAfterDash: 2600 },
  },
  jumper: {
    id: 'jumper', name: 'JUMPER', role: 'Teleporte', color: 0x9b7bff,
    ability: { name: 'Teleporte', desc: 'Teletransporta para o ponto mirado (até 1600u). Mantém o momentum.', cooldown: 20, duration: 0, resetOnKill: false },
    passive: { name: 'Cansaço', desc: 'Após teleportar: 30% mais lento por 3s, mas recebe −20% de dano no corpo (−8% na cabeça).' },
    params: { range: 1600, tiredTime: 3, tiredSpeedMul: 0.7, bodyReduction: 0.2, headReduction: 0.08 },
  },
  predator: {
    id: 'predator', name: 'PREDATOR', role: 'Rastreamento', color: 0xff3b3b,
    ability: { name: 'Sede de Sangue', desc: 'Revela silhuetas inimigas através das paredes e uma névoa de sangue leva ao inimigo mais próximo.', cooldown: 25, duration: 8, resetOnKill: true },
    passive: { name: 'Sedento', desc: 'Cada abate: +8% velocidade e +12% cadência por 12s (acumula 3x).' },
    params: { revealRange: 4000, stackSpeed: 0.08, stackFireRate: 0.12, stackDuration: 12, maxStacks: 3 },
  },
  berserker: {
    id: 'berserker', name: 'BERSERKER', role: 'Combate', color: 0xff9f1c,
    ability: { name: 'Fúria Berserker', desc: 'Por 8s: quanto menos vida, mais dano (até +70%). Abates curam 30.', cooldown: 30, duration: 8, resetOnKill: false },
    passive: { name: 'Recuperação', desc: 'Fora da fúria e 4s sem combate: regenera 6 HP/s.' },
    params: { maxBonus: 0.7, killHeal: 30, regenDelay: 4, regenRate: 6 },
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
