// HUD em DOM. Escritas no DOM só acontecem quando um valor muda (evita layout thrash).
import type { World } from '../../../shared/sim/world';
import type { Player } from '../../../shared/sim/player';
import { WEAPONS, NADES, NadeKind, SLOT_NADES, SLOT_KEYS, reloadDuration } from '../../../shared/config/weapons';
import { CLASSES } from '../../../shared/config/classes';
import { forwardFromAngles } from '../../../shared/math/vec3';

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class Hud {
  root = $('hud');
  private cache = new Map<string, string>();
  private hitTimer = 0;
  private bannerTimer = 0;

  set(id: string, prop: 'text' | 'html' | 'class' | 'style', value: string, extra?: string) {
    const key = id + prop + (extra ?? '');
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    const el = $(id);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'class') el.className = value;
    else el.style.setProperty(extra!, value);
  }

  show(on: boolean) { this.root.classList.toggle('hidden', !on); }

  update(w: World, viewed: Player, opts: { showSpeed: boolean; training: boolean; dt: number; spectating: boolean; nearPrompt: string | null }) {
    const p = viewed;
    const cls = CLASSES[p.classId];
    // vitals
    this.set('hud', 'style', hex(cls.color), '--cls');
    this.set('class-name', 'text', cls.name);
    this.set('class-role', 'text', cls.role);
    this.set('class-icon', 'text', cls.name[0]);
    const hp = Math.max(0, Math.ceil(p.hp));
    this.set('hp-val', 'text', String(hp));
    this.set('hp-fill', 'style', `scaleX(${hp / 100})`, 'transform');
    this.set('hp-ghost', 'style', `scaleX(${hp / 100})`, 'transform');
    this.set('hp-fill', 'class', hp <= 30 ? 'low' : '');
    this.set('armor-val', 'text', String(Math.ceil(p.armor + p.shield)));
    this.set('armor-fill', 'style', `scaleX(${p.armor / 100})`, 'transform');
    this.set('shield-fill', 'style', `scaleX(${p.shield / 50})`, 'transform');

    // ability
    const ab = cls.ability;
    this.set('ability-name', 'text', p.noAbilities ? 'Bloqueada no duelo' : ab.name);
    const frac = p.abilityCd > 0 ? 1 - p.abilityCd / ab.cooldown : 1;
    this.set('ability-prog', 'style', String(176 * (1 - frac)), 'stroke-dashoffset');
    this.set('ability-cd', 'text', p.abilityCd > 0 ? String(Math.ceil(p.abilityCd)) : '');
    this.set('ability', 'class', p.abilityActive > 0 ? 'active' : p.abilityCd > 0 || p.noAbilities ? 'cooling' : '');
    const buffs: string[] = [];
    if (p.abilityActive > 0) buffs.push(`<span class="buff" style="--c:${hex(cls.color)}">${ab.name} ${p.abilityActive.toFixed(1)}s</span>`);
    if (p.tired > 0) buffs.push(`<span class="buff" style="--c:#9b7bff">Cansado ${p.tired.toFixed(1)}s</span>`);
    if (p.speedBoost > 0) buffs.push(`<span class="buff" style="--c:#ffe14d">Velocidade ${p.speedBoost.toFixed(0)}s</span>`);
    if (p.predatorStacks > 0) buffs.push(`<span class="buff" style="--c:#ff3b3b">Sedento ×${p.predatorStacks}</span>`);
    if (p.shield > 0) buffs.push(`<span class="buff" style="--c:#b9a8ff">Escudo ${p.shieldTime.toFixed(0)}s</span>`);
    this.set('buffs', 'html', buffs.join(''));
    const ov = p.classId === 'predator' && p.abilityActive > 0 ? 'predator' : p.classId === 'berserker' && p.abilityActive > 0 ? 'berserker' : p.tired > 0 ? 'tired' : '';
    this.set('ability-overlay', 'class', ov);

    // weapon
    const ws = p.currentWeapon();
    if (p.slot === SLOT_NADES) {
      const nk = p.nadeSel;
      this.set('weapon-name', 'text', NADES[nk].name);
      this.set('ammo-mag', 'text', String(p.nades[nk]));
      this.set('ammo-res', 'text', '');
      this.set('ammo-mag', 'class', '');
    } else if (ws && WEAPONS[ws.id].recharge) {
      const def = WEAPONS[ws.id];
      this.set('weapon-name', 'text', `${def.name}  ${def.category}`);
      this.set('ammo-mag', 'text', ws.mag > 0 ? '1' : String(Math.ceil(ws.recharge ?? 0)));
      this.set('ammo-res', 'text', ws.mag > 0 ? 'carga pronta, alcance curto' : 's para recarregar');
      this.set('ammo-res', 'class', 'melee');
      this.set('ammo-mag', 'class', ws.mag > 0 ? '' : 'empty');
    } else if (ws && WEAPONS[ws.id].melee) {
      const def = WEAPONS[ws.id];
      this.set('weapon-name', 'text', `${def.name}  ${def.category}`);
      this.set('ammo-mag', 'text', '∞');
      this.set('ammo-res', 'text', 'clique: golpe, direito: estocada');
      this.set('ammo-res', 'class', 'melee');
      this.set('ammo-mag', 'class', '');
    } else if (ws) {
      const def = WEAPONS[ws.id];
      this.set('weapon-name', 'text', `${def.name}  ${def.category}`);
      this.set('ammo-mag', 'text', String(ws.mag));
      this.set('ammo-res', 'text', `/ ${ws.reserve}`);
      this.set('ammo-res', 'class', '');
      this.set('ammo-mag', 'class', ws.mag === 0 ? 'empty' : ws.mag <= def.mag * 0.25 ? 'low' : '');
    } else {
      this.set('weapon-name', 'text', 'Desarmado');
      this.set('ammo-mag', 'text', '–'); this.set('ammo-res', 'text', '');
    }
    const slots = [
      ...p.weapons.map((w) => (w ? WEAPONS[w.id].name + (w.recharge ? ` ${Math.ceil(w.recharge)}s` : '') : null)),
      p.nades.he + p.nades.smoke + p.nades.impulse > 0 ? 'Granadas' : null,
    ];
    this.set('slots', 'html', slots.map((s, i) => s ? `<span class="slot ${p.slot === i ? 'on' : ''}">${SLOT_KEYS[i]} ${s}</span>` : '').join(''));
    this.set('nades', 'html', (['he', 'smoke', 'impulse'] as NadeKind[]).filter((k) => p.nades[k] > 0)
      .map((k) => `<i class="nade ${p.slot === SLOT_NADES && p.nadeSel === k ? 'sel' : ''}" style="--c:${hex(NADES[k].color)}" title="${NADES[k].name}"></i>`).join(''));
    if (p.reloadTime > 0 && ws) {
      this.set('reload-bar', 'class', 'on');
      this.set('reload-fill', 'style', `scaleX(${1 - p.reloadTime / reloadDuration(WEAPONS[ws.id])})`, 'transform');
    } else this.set('reload-bar', 'class', '');

    // crosshair spread & scope
    const scoped = p.zoomed && ws && ws.id === 'sniper';
    this.set('scope', 'class', scoped ? 'on' : '');
    // correndo (arma levantada) a mira some; volta quando a arma abaixa
    this.set('crosshair', 'style', scoped || p.sprinting ? 'none' : 'block', 'display');
    const air = !p.phys.onGround ? 4 : 0;
    const gap = Math.min(14, p.punchPitch * 1.2 + air + (p.zoomed ? 0 : 0));
    this.set('crosshair', 'style', `${gap.toFixed(0)}px`, '--gap');

    // speed
    const sp = Math.round(Math.hypot(p.phys.vel.x, p.phys.vel.z));
    this.set('speed', 'style', opts.showSpeed ? 'flex' : 'none', 'display');
    this.set('speed-val', 'text', String(sp));
    const sc = sp > 1600 ? '#ff6af0' : sp > 1000 ? '#ffd23c' : sp > 500 ? '#7fffd4' : '#ffffff';
    this.set('speed', 'style', sc, '--speed-col');

    // top bar
    this.set('score-blue', 'text', String(w.match.score.blue));
    this.set('score-red', 'text', String(w.match.score.red));
    const pips = (team: 'blue' | 'red') => w.players.filter((q) => q.team === team).map((q) => `<i class="pip ${q.alive ? '' : 'dead'}"></i>`).join('');
    this.set('pips-blue', 'html', pips('blue'));
    this.set('pips-red', 'html', pips('red'));
    const ph = w.match.phase;
    let label = opts.training ? 'TREINO' : `ROUND ${w.match.round}`;
    if (ph === 'duel') label = 'DUELOS 1v1';
    if (ph === 'prep') label = 'PREPARAÇÃO';
    this.set('round-label', 'text', label);
    let t = w.match.timer;
    if (opts.training || !isFinite(t)) this.set('timer', 'text', formatTime(w.time));
    else {
      if (ph === 'roundEnd' || ph === 'matchEnd') t = 0;
      this.set('timer', 'text', formatTime(Math.max(0, t)));
    }
    this.set('timer', 'class', !opts.training && (ph === 'active' || ph === 'duel') && t < 10 ? 'urgent' : '');

    // prompt / spectating
    this.set('prompt', 'html', opts.nearPrompt ?? '');
    this.set('prompt', 'class', opts.nearPrompt ? 'on' : '');
    this.set('spectate', 'class', opts.spectating ? 'on' : '');
    this.set('spectate', 'html', opts.spectating ? `Você foi eliminado. Assistindo <b>${p.name}</b>` : '');

    // timers
    if (this.hitTimer > 0) { this.hitTimer -= opts.dt; if (this.hitTimer <= 0) $('hitmarker').style.opacity = '0'; }
    if (this.bannerTimer > 0) { this.bannerTimer -= opts.dt; if (this.bannerTimer <= 0) $('banner').classList.remove('on'); }
  }

  hitmarker(head: boolean, kill: boolean) {
    const el = $('hitmarker');
    el.className = kill ? 'kill' : head ? 'head' : '';
    el.style.opacity = '1';
    this.hitTimer = kill ? 0.35 : 0.18;
  }

  damageFrom(viewer: Player, from: { x: number; z: number } | null, amount: number) {
    const vig = $('damage-vignette');
    vig.style.opacity = String(Math.min(1, 0.3 + amount / 60));
    setTimeout(() => (vig.style.opacity = '0'), 140);
    if (!from) return;
    const f = forwardFromAngles(viewer.yaw, 0);
    const dx = from.x - viewer.phys.pos.x, dz = from.z - viewer.phys.pos.z;
    // angle of attacker relative to view (0 = in front, clockwise)
    const ang = Math.atan2(dx * -f.z + dz * f.x, dx * f.x + dz * f.z);
    const arc = document.createElement('div');
    arc.className = 'dmg-arc';
    arc.style.transform = `rotate(${ang}rad)`;
    $('damage-dirs').appendChild(arc);
    requestAnimationFrame(() => (arc.style.opacity = '0'));
    setTimeout(() => arc.remove(), 950);
  }

  killfeed(killer: Player | undefined, victim: Player, weapon: string, head: boolean, mine: boolean) {
    const el = document.createElement('div');
    el.className = 'kf' + (mine ? ' mine' : '');
    const k = killer && killer !== victim ? `<span class="${killer.team}">${esc(killer.name)}</span>` : '';
    el.innerHTML = `<span>${k}<span class="wpn"> ${esc(weapon)} </span>${head ? '<span class="hs">HS</span>' : ''} <span class="${victim.team}">${esc(victim.name)}</span></span>`;
    const feed = $('killfeed');
    feed.appendChild(el);
    while (feed.children.length > 6) feed.firstChild!.remove();
    setTimeout(() => el.remove(), 6000);
  }

  toast(text: string, color?: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    if (color) el.style.color = color;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild!.remove();
    setTimeout(() => el.remove(), 1900);
  }

  banner(title: string, sub = '', team: string = '', seconds = 2.5) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    $('banner').className = 'on ' + team;
    this.bannerTimer = seconds;
  }

  scoreboard(w: World, show: boolean, localId: number) {
    const el = $('scoreboard');
    el.classList.toggle('hidden', !show);
    if (!show) return;
    const team = (t: 'blue' | 'red', name: string) => {
      const rows = w.players.filter((p) => p.team === t).sort((a, b) => b.stats.kills - a.stats.kills || a.stats.deaths - b.stats.deaths)
        .map((p) => `<tr class="${p.id === localId ? 'me' : ''} ${p.alive ? '' : 'dead'}"><td>${esc(p.name)}</td><td>${CLASSES[p.classId].name}</td><td>${p.stats.kills}</td><td>${p.stats.deaths}</td><td>${p.stats.assists}</td><td>${p.stats.headshots}</td><td>${p.stats.damage}</td></tr>`).join('');
      return `<div class="team-${t}"><h3><span>${name}</span><span>${w.match.score[t]}</span></h3><table><tr><th>Jogador</th><th>Classe</th><th>Abates</th><th>Mortes</th><th>Assist.</th><th>HS</th><th>Dano</th></tr>${rows}</table></div>`;
    };
    const html = team('blue', 'Equipe Azul') + team('red', 'Equipe Vermelha');
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  }

  trainingHelp(show: boolean, html: string) {
    this.set('training-help', 'class', show ? 'on' : '');
    this.set('training-help', 'html', html);
  }
}

export function formatTime(t: number) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
