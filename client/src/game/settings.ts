import { GHOST } from '../../../shared/config/skill';
// Configurações do jogador (persistidas no localStorage quando disponível).
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'crouch' | 'walk'
  | 'reload' | 'use' | 'ability' | 'drop' | 'inspect' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'scoreboard'
  | 'resetPos' | 'fly' | 'saveCp' | 'loadCp'
  | 'skillRestart' | 'skillStage' | 'skillSave' | 'skillLoad' | 'skillMenu' | 'ghostToggle';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Frente', back: 'Trás', left: 'Esquerda (strafe)', right: 'Direita (strafe)', jump: 'Pular / Bunny hop',
  crouch: 'Agachar / Slide (em movimento)', walk: 'Caminhar (silencioso)', reload: 'Recarregar', use: 'Interagir / Coletar', ability: 'Habilidade da classe',
  drop: 'Soltar equipamento', inspect: 'Inspecionar arma', slot1: 'Arma primária', slot2: 'Pistola', slot3: 'Faca / taser', slot4: 'Granadas', scoreboard: 'Placar',
  resetPos: 'Treino: reiniciar posição', fly: 'Treino: voar (noclip)', saveCp: 'Treino: salvar checkpoint', loadCp: 'Treino: carregar checkpoint',
  skillRestart: 'Surf Skill: reiniciar mapa', skillStage: 'Surf Skill: reiniciar stage', skillSave: 'Surf Skill: salvar posição (prática)',
  skillLoad: 'Surf Skill: voltar à posição salva', skillMenu: 'Surf Skill: menu de stages/checkpoints', ghostToggle: 'Surf Skill: mostrar fantasma',
};

export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'ControlLeft', walk: 'ShiftLeft',
  reload: 'KeyR', use: 'KeyE', ability: 'KeyQ', drop: 'KeyG', inspect: 'KeyF', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
  scoreboard: 'Tab', resetPos: 'KeyT', fly: 'KeyV', saveCp: 'KeyZ', loadCp: 'KeyX',
  // o Surf Skill não tem recarga nem treino: pode reaproveitar R, Z e X
  skillRestart: 'KeyR', skillStage: 'Backspace', skillSave: 'KeyZ', skillLoad: 'KeyX', skillMenu: 'KeyM', ghostToggle: 'KeyH',
};

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  sensitivity: number;   // estilo CS: graus por contagem = 0.022 × sensibilidade
  fov: number;           // FOV horizontal (16:9)
  masterVolume: number;
  sfxVolume: number;
  quality: Quality;
  effects: boolean;
  autoBhop: boolean;
  showSpeed: boolean;
  viewBob: boolean;
  /** mira secundária (luneta / ADS): 'toggle' = clique alterna; 'hold' = mira enquanto segura */
  aimMode: 'toggle' | 'hold';
  /** Tela cheia + Keyboard Lock ao jogar: impede que Ctrl+W/Ctrl+T fechem ou troquem a aba. */
  fullscreenLock: boolean;
  keys: Record<Action, string>;
  playerName: string;
  /** o jogador já confirmou o nome usado no ranking do Surf Skill */
  skillNameSet: boolean;
  /** fantasma do recorde pessoal no Surf Skill */
  ghostShow: boolean;
  ghostOpacity: number;
  /** 'run': corrida inteira; 'segment': reinicia a cada stage/checkpoint com o melhor segmento */
  ghostSync: 'run' | 'segment';
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 2.0, fov: 100, masterVolume: 0.7, sfxVolume: 0.9, quality: 'high', effects: true,
  autoBhop: true, showSpeed: true, viewBob: true, aimMode: 'toggle', fullscreenLock: true, keys: { ...DEFAULT_KEYS }, playerName: 'Jogador', skillNameSet: false, ghostShow: GHOST.defaultShow, ghostOpacity: GHOST.defaultOpacity, ghostSync: 'run',
};

const KEY = 'surfstrike.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const keys = { ...DEFAULT_KEYS, ...(s.keys ?? {}) } as Record<string, string>;
      if (keys.sprint) {
        // migração: o sprint agora é automático e a tecla dele virou "caminhar"
        keys.walk = keys.sprint;
        delete keys.sprint;
      } else if (!s.keys?.walk) {
        // migração da versão antiga: agachar saiu do Shift para o Ctrl, Shift virou sprint,
        // 3 virou faca e as granadas foram para o 4
        if (keys.crouch === 'ShiftLeft') keys.crouch = DEFAULT_KEYS.crouch;
        keys.walk = DEFAULT_KEYS.walk;
        keys.slot3 = DEFAULT_KEYS.slot3;
        keys.slot4 = DEFAULT_KEYS.slot4;
      }
      return { ...DEFAULT_SETTINGS, ...s, keys: keys as Settings['keys'] };
    }
  } catch { /* storage indisponível */ }
  return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift D', ControlLeft: 'Ctrl', AltLeft: 'Alt', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`' };
  return map[code] ?? code;
}
