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
  /** Abaixo desta altura o jogador é recuperado (queda fora da arena). */
  killPlaneY: -4200,
} as const;

export type PhysicsConfig = typeof PHYSICS;

export const SIM_DT = 1 / PHYSICS.tickRate;
