// Máquina de estados da partida (autoritativa — roda no "servidor"/simulação).
import { MATCH } from '../config/match';
import type { Team } from '../maps/types';

export type Phase = 'lobby' | 'select' | 'prep' | 'countdown' | 'active' | 'duel' | 'roundEnd' | 'matchEnd';

export type MatchTransition =
  | { type: 'enter'; phase: Phase }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; winner: Team | null; reason: 'elimination' | 'duel' | 'tiebreak' | 'draw' }
  | { type: 'startDuels' }
  | { type: 'matchEnd'; winner: Team };

export interface MatchConfig { roundsToWin: number; roundTime: number; prepTime: number; countdown: number; roundEndTime: number; duelTime: number; }

export class MatchMachine {
  phase: Phase = 'lobby';
  timer = 0;
  round = 0;
  score: Record<Team, number> = { blue: 0, red: 0 };
  lastRoundWinner: Team | null = null;
  matchWinner: Team | null = null;

  constructor(public cfg: MatchConfig = { ...MATCH }) {}

  private enter(phase: Phase, timer: number, out: MatchTransition[]) {
    this.phase = phase;
    this.timer = timer;
    out.push({ type: 'enter', phase });
  }

  /** lobby → select */
  openSelection(): MatchTransition[] {
    const out: MatchTransition[] = [];
    if (this.phase === 'lobby') this.enter('select', 0, out);
    return out;
  }

  /** select → prep (first round) */
  startMatch(): MatchTransition[] {
    const out: MatchTransition[] = [];
    if (this.phase !== 'select' && this.phase !== 'lobby') return out;
    this.score = { blue: 0, red: 0 };
    this.round = 0;
    this.matchWinner = null;
    this.beginRound(out);
    return out;
  }

  private beginRound(out: MatchTransition[]) {
    this.round++;
    this.enter('prep', this.cfg.prepTime, out);
    out.push({ type: 'roundStart', round: this.round });
  }

  private endRound(winner: Team | null, reason: 'elimination' | 'duel' | 'tiebreak' | 'draw', out: MatchTransition[]) {
    this.lastRoundWinner = winner;
    if (winner) this.score[winner]++;
    this.enter('roundEnd', this.cfg.roundEndTime, out);
    out.push({ type: 'roundEnd', winner, reason });
  }

  /** Can players move/shoot? */
  get combatEnabled(): boolean { return this.phase === 'active' || this.phase === 'duel'; }
  get frozen(): boolean { return this.phase === 'prep' || this.phase === 'countdown'; }

  /**
   * Advance timers. `alive` = living players per team.
   * `tiebreak` decides the round when the duel phase times out.
   */
  update(dt: number, alive: Record<Team, number>, tiebreak: () => Team | null): MatchTransition[] {
    const out: MatchTransition[] = [];
    if (this.phase === 'lobby' || this.phase === 'select' || this.phase === 'matchEnd') return out;
    this.timer -= dt;
    switch (this.phase) {
      case 'prep':
        if (this.timer <= 0) this.enter('countdown', this.cfg.countdown, out);
        break;
      case 'countdown':
        if (this.timer <= 0) this.enter('active', this.cfg.roundTime, out);
        break;
      case 'active':
      case 'duel': {
        const b = alive.blue, r = alive.red;
        if (b === 0 || r === 0) {
          if (b === 0 && r === 0) this.endRound(null, 'draw', out);
          else this.endRound(b > 0 ? 'blue' : 'red', this.phase === 'duel' ? 'duel' : 'elimination', out);
        } else if (this.timer <= 0) {
          if (this.phase === 'active') {
            this.enter('duel', this.cfg.duelTime, out);
            out.push({ type: 'startDuels' });
          } else {
            const w = tiebreak();
            this.endRound(w, w ? 'tiebreak' : 'draw', out);
          }
        }
        break;
      }
      case 'roundEnd':
        if (this.timer <= 0) {
          const champion = (['blue', 'red'] as Team[]).find((t) => this.score[t] >= this.cfg.roundsToWin);
          if (champion) {
            this.matchWinner = champion;
            this.enter('matchEnd', 0, out);
            out.push({ type: 'matchEnd', winner: champion });
          } else this.beginRound(out);
        }
        break;
    }
    return out;
  }

  backToLobby() { this.phase = 'lobby'; this.timer = 0; }
}
