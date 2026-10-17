// Teclado + mouse com Pointer Lock. Os ângulos de visão são atualizados imediatamente
// (a cada evento de mouse) para resposta máxima; a simulação lê o estado a cada tick.
import type { Action, Settings } from './settings';

export class Input {
  keys = new Set<string>();
  mouse = [false, false, false];
  yaw = 0;
  pitch = 0;
  locked = false;
  private pressedActions = new Set<Action>();
  private pressedMouse = [false, false, false];
  enabled = false;
  onUnlock: (() => void) | null = null;
  /** Called on keydown of mapped actions (edge). */
  onAction: ((a: Action) => void) | null = null;

  constructor(public el: HTMLElement, public settings: Settings) {
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('mousedown', this.md);
    window.addEventListener('mouseup', this.mu);
    window.addEventListener('mousemove', this.mm);
    window.addEventListener('blur', this.blur);
    document.addEventListener('pointerlockchange', this.plc);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose() {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('mousedown', this.md);
    window.removeEventListener('mouseup', this.mu);
    window.removeEventListener('mousemove', this.mm);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('pointerlockchange', this.plc);
  }

  /** Fallback when Pointer Lock is unavailable (e.g. embedded frames): look with raw mouse movement. */
  freeLook = false;

  lock() {
    setTimeout(() => { if (!this.locked && this.enabled) this.freeLook = true; }, 500);
    try {
      const r = (this.el as HTMLElement & { requestPointerLock: (o?: unknown) => Promise<void> | void }).requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch(() => { try { this.el.requestPointerLock(); } catch { /* ignore */ } });
      }
    } catch { try { this.el.requestPointerLock(); } catch { /* ignore */ } }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  private plc = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.el;
    if (this.locked) this.freeLook = false;
    if (was && !this.locked) { this.keys.clear(); this.mouse = [false, false, false]; this.onUnlock?.(); }
  };

  private blur = () => { this.keys.clear(); this.mouse = [false, false, false]; };

  private actionFor(code: string): Action | null {
    for (const [a, k] of Object.entries(this.settings.keys)) if (k === code) return a as Action;
    return null;
  }

  private kd = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (e.code === 'Tab' || e.code === 'Space' || (e.code.startsWith('Digit') && this.locked)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    const a = this.actionFor(e.code);
    if (a) { this.pressedActions.add(a); this.onAction?.(a); }
  };
  private ku = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private md = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (e.button < 3) { this.mouse[e.button] = true; this.pressedMouse[e.button] = true; }
  };
  private mu = (e: MouseEvent) => { if (e.button < 3) this.mouse[e.button] = false; };
  private mm = (e: MouseEvent) => {
    if (!this.enabled || (!this.locked && !this.freeLook)) return;
    const k = 0.022 * this.settings.sensitivity * (Math.PI / 180) * this.sensMul;
    this.yaw -= e.movementX * k;
    this.pitch -= e.movementY * k;
    const lim = 89 * Math.PI / 180;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  };
  /** Multiplier for zoomed sensitivity */
  sensMul = 1;

  held(a: Action): boolean { return this.keys.has(this.settings.keys[a]); }
  /** Edge-triggered action since last call. */
  consume(a: Action): boolean { const had = this.pressedActions.has(a); this.pressedActions.delete(a); return had; }
  consumeMouse(b: number): boolean { const had = this.pressedMouse[b]; this.pressedMouse[b] = false; return had; }
  clearEdges() { this.pressedActions.clear(); this.pressedMouse = [false, false, false]; }
}
