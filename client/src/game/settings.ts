// Configurações do jogador (persistidas no localStorage quando disponível).
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'crouch'
  | 'reload' | 'use' | 'ability' | 'drop' | 'slot1' | 'slot2' | 'slot3' | 'scoreboard'
  | 'resetPos' | 'fly' | 'saveCp' | 'loadCp';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Frente', back: 'Trás', left: 'Esquerda (strafe)', right: 'Direita (strafe)', jump: 'Pular / Bunny hop',
  crouch: 'Agachar', reload: 'Recarregar', use: 'Interagir / Coletar', ability: 'Habilidade da classe',
  drop: 'Soltar equipamento', slot1: 'Arma primária', slot2: 'Pistola', slot3: 'Granadas', scoreboard: 'Placar',
  resetPos: 'Treino: reiniciar posição', fly: 'Treino: voar (noclip)', saveCp: 'Treino: salvar checkpoint', loadCp: 'Treino: carregar checkpoint',
};

export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'ShiftLeft',
  reload: 'KeyR', use: 'KeyE', ability: 'KeyQ', drop: 'KeyG', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3',
  scoreboard: 'Tab', resetPos: 'KeyT', fly: 'KeyV', saveCp: 'KeyZ', loadCp: 'KeyX',
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
  keys: Record<Action, string>;
  playerName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 2.0, fov: 100, masterVolume: 0.7, sfxVolume: 0.9, quality: 'high', effects: true,
  autoBhop: true, showSpeed: true, viewBob: true, keys: { ...DEFAULT_KEYS }, playerName: 'Jogador',
};

const KEY = 'surfstrike.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys ?? {}) } };
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
