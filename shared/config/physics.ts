// =============================================================
//  SURF STRIKE — Parâmetros de movimentação (estilo Source Engine)
//  Unidades: "u" (≈ 2.5 cm). Velocidades em u/s.
//  Ajuste aqui para mudar a sensação do surf.
// =============================================================
export const PHYSICS = {
  /** Taxa fixa da simulação (ticks por segundo). Desacoplada do FPS de render. */
  tickRate: 100,
  /** Gravidade (u/s²). */
  gravity: 800,
  /** Aceleração no chão (sv_accelerate). */
  groundAccelerate: 10,
  /** Aceleração no ar (sv_airaccelerate). 100–150 é o padrão de servidores de surf. */
  airAccelerate: 150,
  /** Teto da velocidade "desejada" no ar — é o que torna o air-strafe possível (Source usa 30). */
  airWishSpeedCap: 30,
  /** Atrito no chão (sv_friction). */
  groundFriction: 5.2,
  /** Velocidade abaixo da qual o atrito usa este valor fixo (sv_stopspeed). */
  stopSpeed: 80,
  /** Atrito aplicado enquanto se encosta numa rampa de surf (0 = sem perda). */
  surfFriction: 0,
  /** Velocidade máxima de corrida no chão. */
  maxGroundSpeed: 250,
  /** Limite absoluto por eixo (sv_maxvelocity). Evita bugs de colisão. */
  maxVelocity: 3500,
  /** Impulso do pulo (√(2·g·57) ≈ 302, como na Source). */
  jumpImpulse: 302,
  /** Normais com componente Y abaixo disto são "rampas de surf" (não são chão). ~45.6° */
  walkableNormalY: 0.7,
  /** Altura máxima de degrau que o jogador sobe andando. */
  stepSize: 18,
  /**
   * Acima desta velocidade horizontal, encostar num plano de bisel "andável" de uma peça de curva
   * (aresta da crista, junta de peças) não conta como chão: sem atrito, sem subir degrau, sem grudar
   * no chão. É o anti "ramp bug" (o surf travando do nada). Abaixo dela dá para ficar parado no cume.
   */
  surfBevelSpeed: 500,
  /** Raio (meia-largura) da caixa de colisão do jogador. */
  playerRadius: 16,
  playerHeight: 72,
  playerCrouchHeight: 46,
  eyeHeight: 64,
  crouchEyeHeight: 40,
  crouchSpeedFactor: 0.34,
  /** Multiplicador global de sensibilidade de movimento (escala as teclas). */
  movementSensitivity: 1,
  /** Velocidade de voo/noclip do modo treino. */
  noclipSpeed: 1100,
  /** Depois de um teleporte que mantém a velocidade, segundos sem atrito no chão para sair embalado. */
  teleportGlide: 0.45,
  /** Abaixo desta altura o jogador é recuperado (queda fora da arena). */
  killPlaneY: -4200,
} as const;

// =============================================================
//  Tactical Sprint e Slide
// =============================================================
export const SPRINT = {
  /** Sprint sempre ativo: basta se mover no chão (não precisa de tecla). */
  autoSprint: true,
  /** Sprint tático clássico: arma levantada durante o sprint (desligado com o sprint automático). */
  raiseWeapon: false,
  /** Stamina limitada para o sprint (desligada com o sprint automático). */
  useStamina: false,
  /** Caminhar (Shift): anula o sprint, fica mais lento e não faz som de passos. */
  walkSpeedMul: 0.55,
  /** Multiplicador de velocidade no chão durante o sprint. */
  speedMul: 1.3,
  /** Stamina oculta, em segundos de sprint contínuo. */
  stamina: 4.0,
  /** Stamina mínima para voltar a correr depois de esgotar. */
  restartStamina: 1.0,
  /** Recuperação de stamina por segundo (após o atraso). */
  regenRate: 0.8,
  /** Segundos parado/andando antes de a stamina começar a recuperar. */
  regenDelay: 1.0,
  /** Tempo para abaixar a arma e poder atirar depois do sprint (armas de fogo). */
  sprintToFire: 0.42,
  /** Mesmo atraso para a faca (mais leve). */
  sprintToFireKnife: 0.16,
  /** Atraso de quem só estava andando (referência: praticamente imediato). */
  walkToFire: 0,
  /** Velocidade mínima para iniciar um slide ao agachar em movimento. */
  slideMinStartSpeed: 200,
  /** Acima desta velocidade, agachar no chão já faz o slide (sem precisar do sprint). */
  autoSlideSpeed: 450,
  /** Agachar apertado até este tempo antes de pousar ainda inicia o slide automático. */
  slideLandBuffer: 0.3,
  /** Velocidade horizontal mínima no início do slide. */
  slideStartSpeed: 470,
  /** Ganho máximo de velocidade que o slide pode dar sobre a velocidade atual. */
  slideMaxBoost: 120,
  /** Duração máxima do slide. */
  slideTime: 0.75,
  /** Atrito durante o slide (o atrito normal é 5.2). */
  slideFriction: 0.9,
  /** O slide termina sozinho abaixo desta velocidade. */
  slideEndSpeed: 150,
  /** Tempo "travado" levantando ao fim de um slide natural (o cancel pula isso). */
  slideRecoverTime: 0.35,
  slideRecoverSpeedMul: 0.55,
  /** Intervalo mínimo entre slides. */
  slideCooldown: 0.35,
} as const;

export type PhysicsConfig = typeof PHYSICS;

export const SIM_DT = 1 / PHYSICS.tickRate;
