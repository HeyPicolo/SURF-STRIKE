// Habilidades de classe — registro extensível. Para criar uma classe nova, adicione-a em
// config/classes.ts e registre um handler aqui.
import { V3, forwardFromAngles } from '../math/vec3';
import { CLASSES, ClassId } from '../config/classes';
import type { Player } from './player';
import type { World } from './world';

export interface AbilityHandler {
  /** Ativa a habilidade. Retorna false se não pôde ser usada (ex.: alvo inválido). */
  use(world: World, p: Player): boolean;
  /** Chamado a cada tick enquanto vivo. */
  tick?(world: World, p: Player, dt: number): void;
  /** Chamado quando `p` elimina um inimigo. */
  onKill?(world: World, p: Player): void;
}

const tmpA = new V3(), tmpB = new V3(), tmpC = new V3();

export const ABILITIES: Record<ClassId, AbilityHandler> = {
  runner: {
    use(world, p) {
      const prm = CLASSES.runner.params;
      const dir = forwardFromAngles(p.yaw, p.pitch, tmpA);
      if (p.phys.onGround) { p.phys.pos.y += 2; p.phys.onGround = false; }
      p.phys.vel.addScaled(dir, prm.dashSpeed);
      p.phys.vel.y += prm.dashUpBias;
      const sp = p.phys.vel.len();
      if (sp > prm.maxAfterDash) p.phys.vel.scale(prm.maxAfterDash / sp);
      world.emit({ t: 'ability', pid: p.id, cls: 'runner', pos: p.phys.pos.clone() });
      return true;
    },
    onKill(_w, p) { p.abilityCd = 0; },
  },

  jumper: {
    use(world, p) {
      const prm = CLASSES.jumper.params;
      const eye = p.eyePos(tmpA);
      const dir = forwardFromAngles(p.yaw, p.pitch, tmpB);
      const end = tmpC.copy(eye).addScaled(dir, prm.range);
      const tr = world.collision.traceRay(eye, end);
      const dist = tr.fraction * prm.range;
      const st = p.phys;
      const from = st.pos.clone();
      // walk back along the ray until the player's box fits
      for (let t = dist - 24; t > 40; t -= 24) {
        const cand = eye.clone().addScaled(dir, t);
        cand.y -= p.eyeHeight * 0.5;
        // nudge away from the hit surface
        if (tr.fraction < 1) cand.addScaled(tr.normal, 20);
        if (!world.collision.boxSolid(cand, st.mins, st.maxs)) {
          st.pos.copy(cand);
          st.onGround = false;
          p.tired = prm.tiredTime;
          world.emit({ t: 'teleport', pid: p.id, from, to: cand.clone(), ability: true });
          world.emit({ t: 'ability', pid: p.id, cls: 'jumper', pos: cand.clone() });
          return true;
        }
      }
      return false;
    },
  },

  predator: {
    use(world, p) {
      p.abilityActive = CLASSES.predator.ability.duration;
      world.emit({ t: 'ability', pid: p.id, cls: 'predator', pos: p.phys.pos.clone() });
      return true;
    },
    onKill(_w, p) {
      const prm = CLASSES.predator.params;
      p.abilityCd = 0;
      p.predatorStacks = Math.min(prm.maxStacks, p.predatorStacks + 1);
      p.predatorStackTime = prm.stackDuration;
    },
    tick(_w, p, dt) {
      if (p.predatorStackTime > 0) { p.predatorStackTime -= dt; if (p.predatorStackTime <= 0) p.predatorStacks = 0; }
    },
  },

  berserker: {
    use(world, p) {
      p.abilityActive = CLASSES.berserker.ability.duration;
      p.furyUsed = true;
      world.emit({ t: 'ability', pid: p.id, cls: 'berserker', pos: p.phys.pos.clone() });
      return true;
    },
    onKill(world, p) {
      if (p.abilityActive > 0) {
        p.hp = Math.min(100, p.hp + CLASSES.berserker.params.killHeal);
        world.emit({ t: 'heal', pid: p.id, amount: CLASSES.berserker.params.killHeal });
      }
    },
    tick(world, p, dt) {
      const prm = CLASSES.berserker.params;
      if (p.abilityActive <= 0 && p.hp < 100 && world.time - p.lastCombat > prm.regenDelay) {
        p.hp = Math.min(100, p.hp + prm.regenRate * dt);
      }
    },
  },
};

export function tryUseAbility(world: World, p: Player): boolean {
  if (p.noAbilities || p.abilityCd > 0 || !p.alive) return false;
  const h = ABILITIES[p.classId];
  if (!h.use(world, p)) return false;
  p.abilityCd = CLASSES[p.classId].ability.cooldown;
  return true;
}
