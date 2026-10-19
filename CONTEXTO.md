# SURF STRIKE — Contexto do projeto

Registro vivo das decisões, do estado atual e das pendências. **Atualizado a cada rodada de mudanças, no mesmo commit.**
Serve para qualquer sessão (de código ou de apoio) entender o projeto sem reler o histórico inteiro.

- **Última rodada:** 8a (de 8a/8b/8c) · 19/10/2026
- **No ar:** https://surf-strike.vercel.app (deploy automático da Vercel a cada push na `main`)
- **Repositório:** github.com/HeyPicolo/SURF-STRIKE

## Como as sessões trabalham

- **Sessão de código:** é a única que edita e dá push na `main`. Em cada rodada: config/sim → cliente → testes e e2e → README e **este arquivo** → typecheck, testes, build, e2e → commit e push → confere o deploy READY.
- **Sessão de apoio:** só leitura. Atualiza o repositório, confere o último deploy, responde dúvidas, revisa e escreve prompts para a sessão de código.
- Pedidos novos chegam como "Rodada N" (texto ou anexo). Decisões ambíguas são resolvidas pela sessão de código, anotadas aqui e no README.
- Autor dos commits: `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`, com as linhas `Co-Authored-By` e `Claude-Session` no fim da mensagem.

## Como rodar

```
npm install
npm run dev            # servidor local com rebuild
npm run build          # gera dist/ (o que a Vercel publica)
npm test               # 93 testes unitários (node:test via tsx)
npm run skill:versions # regrava shared/maps/skillVersions.ts depois de mudar um mapa do Surf Skill
npx tsc --noEmit -p tsconfig.json
CHROME_PATH=/opt/pw-browsers/chromium node scripts/e2e.mjs   # 24 verificações no navegador
```

## O jogo hoje

FPS de navegador: Combat Surf (física estilo Source/CS) + combate tático estilo CS2, visual low-poly. Renderizador WebGL2 próprio, sem Three.js. Simulação autoritativa em `shared/` (sem DOM, 100 ticks/s), cliente em `client/`. Multiplayer ainda não existe.

**Modos:** Partida contra bots (Team Elimination, 1v1 a 5v5, 4 dificuldades), **Surf Skill** (percursos contra o cronômetro) e Treino.

### Movimento
- Física Source: air strafe (airAccelerate 150, cap 30), gravidade 800, bhop (auto-bhop opcional), surf em rampas com normal Y < 0,7.
- **Sprint sempre ativo** (+30% no chão, sem tecla, sem stamina, atira correndo). **Shift = caminhar** (×0,55, passos silenciosos). Passos têm som espacial.
- **Slide:** Ctrl em movimento (≥ 200 u/s), exceto caminhando; cancelável com Espaço ou Ctrl.
- Faca na mão: +25% no chão. Queda do CLOUDS leva à própria base. Teleportes e jump pads não tiram velocidade.

### Combate
- Vida 150, colete 100 ao nascer (duelos: sem colete). Começa com faca borboleta + taser.
- Armas de fogo ×1,4 de dano (`DAMAGE.gunMul`); spread de todas ×0,5; recarga 45% mais rápida.
- Kestrel AR: spread 0,09 / ar 0,45 / movendo 0,3, recuo 0,45 / 0,2. Longbow precisa de perto, mira parada no zoom.
- Faca: alcance 80/70, folga de hitbox 14, 7 raios. Taser: 500 de dano, alcance 200, folga de hitbox 12, recarga 30 s.
- Slots: 1 primária, 2 pistola, 3 faca/taser, 4 granadas. F inspeciona.

### Classes
RUNNER (dash aéreo), JUMPER (teleporte), PREDATOR (silhuetas através das paredes), BERSERKER (fúria).

### Mapa CLOUDS (partida)
Bases ligadas por rampas (rotas A, B1, B2, C), rampa central reta (ápice 1150), flancos na mesma altura, 4 jump pads nas quinas do platô, arenas de duelo em x ≈ 14000.

### Surf Skill (rodadas 7 e 8)
- Sozinho, só a faca (com bônus) e sprint automático, sem dano. Configuração em `shared/config/skill.ts`.
- 3 mapas × 5 stages: **SKY STEPS** (T1), **DRIFT CANYON** (T2), **STORM SPIRE** (T3). Construtores em `shared/maps/skySteps.ts`, `driftCanyon.ts`, `stormSpire.ts`, com o kit `skillKit.ts` e o registro `skillMaps.ts`.
- Lógica em `shared/sim/skill.ts` (zonas, cronômetro em ticks, splits, quedas, reinícios, prática) e recordes em `shared/sim/records.ts` (PB, melhores stages, Sum of Best, top 10, versão por hash da geometria). Armazenamento: interface `RecordStore`, hoje `client/src/skill/localStore.ts` (localStorage).
- Teclas: R reinicia o mapa, Backspace reinicia o stage (linear: último checkpoint), M abre o menu de stages/checkpoints, Z/X salvam e carregam a posição (prática), H mostra/esconde o fantasma.
- **Rodada 8a:** categorias Treino (os 3 mapas) e Desafio (12 mapas, chegam em 8b/8c); tiers 1–6 (`TIER_COLORS`, `TIER_STYLE`, `TIER_LABELS`); formatos **staged** e **linear** (checkpoints = portal + plataforma de retorno 430 u acima do cume; queda medida por trecho); tudo generalizado para "segmentos" (`map.skill.segments`); zonas podem ser caixas orientadas (`TriggerVolume.obb`); pulo liberado na zona de início com o cap valendo também no tick de saída; desbloqueio progressivo em `SKILL.progressiveUnlock` (desligado).
- **Fantasma** (`shared/sim/ghost.ts`): gravação por tick na sim (`SkillRun.recorder`), 50 Hz com keyframes + deltas Int16 (~12 B/amostra; limite `GHOST.maxBytes5min` = 256 KB), `GhostStore` no IndexedDB (`client/src/skill/ghostStore.ts`), PB substitui o fantasma da corrida, melhores segmentos guardam o seu trecho, sincronia "corrida inteira" ou "por segmento", diferença ao vivo no HUD. Prática não grava.
- Versões estáticas: `shared/maps/skillVersions.ts` (o menu não constrói mapas; só o mapa escolhido é construído e fica em cache). Os hashes dos mapas de treino continuam os da rodada 7.
- Mapa oculto `teste_curto` (linear, 1 checkpoint) só para testes/e2e.
- Kit (`skillKit.ts`): `Course` (encadeia rampas: `next`, `curve` contínua com emendas fechadas por cunha, `checkpoint`, `bhop`), rampas ascendentes, túneis (`ceiling`), rampas de uma face, `buildLinear` e métricas de projeto por segmento (meia-largura, inclinação, gaps, velocidade mínima balística, tempo de ar, transições, curva máxima).
- Percurso de referência: `shared/bots/routeDriver.ts` (usa o `steerToward` com `idealStrafe`, sem assistência). Completa os 15 stages só com física; também existe `game.autopilot` no cliente para testes.

| | T1 SKY STEPS | T2 DRIFT CANYON | T3 STORM SPIRE |
|---|---|---|---|
| Meia-largura | 300 | 170–180 | 110–140 |
| Inclinação (normal Y) | 52° (0,62) | 55–57° (0,55–0,57) | 47° (0,68) e 63° (0,45) |
| Velocidade mínima no pior gap | 353 u/s | 619 u/s | 794 u/s |
| Maior gap | 306 u | 902 u | 1300 u |
| Percurso de referência | 33,4 s · pico 1560 u/s | 40,4 s · pico 1820 u/s | 42,1 s · pico 2360 u/s |

## Arquivos-chave

| Arquivo | Papel |
|---|---|
| `shared/config/physics.ts` | `PHYSICS` e `SPRINT` (sprint automático, caminhar, slide) |
| `shared/config/weapons.ts` | armas, `DAMAGE`, `ACCURACY`, `RELOAD`, `ITEMS`, slots |
| `shared/config/skill.ts` | regras do Surf Skill e metadados dos mapas/stages |
| `shared/sim/world.ts` | núcleo da simulação (modos `bots`, `training`, `skill`) |
| `shared/sim/skill.ts`, `records.ts` | Surf Skill e recordes |
| `shared/maps/clouds.ts` | mapa da partida |
| `shared/bots/brain.ts`, `steer.ts`, `routeDriver.ts` | IA, direção de surf, percurso de referência |
| `client/src/game/Game.ts` | loop, input, eventos, câmera, viewmodel, passos, HUD do Surf Skill |
| `client/src/ui/menu.ts`, `hud.ts` | menus (inclui seleção de mapa e tela de fim do Surf Skill) e HUD |
| `client/src/maps/worldMesh.ts` | malha do mapa, paredes das zonas, número do stage |
| `client/src/audio/sfx.ts` | sons sintetizados |
| `tests/*.test.ts`, `scripts/e2e.mjs` | testes unitários e de navegador |

## Histórico das rodadas

| Rodada · commit | O que mudou |
|---|---|
| 1 · `d38f7ce` | Jogo completo a partir da especificação; deploy na Vercel ligado ao GitHub. |
| 2 · `fe6d704` | Sprint tático com stamina, slide e slide cancel, agachar no Ctrl, faca inicial (+25%), itens aleatórios, sem jump pads. |
| 3 · `9d4d6ce` | Queda leva à base, teleportes com velocidade, slide acima de 450 u/s, Longbow parada no zoom e precisa de perto, taser inicial. |
| 4 · `9f598b7` | Sem armas nas bases, spread −50%, rampa central no lugar da ponte, faca borboleta com animações, inspeção no F, recarga +45%. |
| 5 · `5ef55f7` | Colete ao nascer, vida 150, rampa central reta e mais alta, flancos nivelados, 4 jump pads sem perda de velocidade. |
| 6 · `4adcdcb` | Dano ×1,4, Kestrel mais precisa, sprint automático, Shift caminha (silencioso), sons de passos, slide em movimento, hitbox maior de faca/taser. |
| 7 · `e9a4c25` | **Surf Skill**: 3 mapas com 5 stages, cronômetro em ticks, splits contra o PB, quedas para o início do stage, prática, recordes locais, Sum of Best, ranking, menu, HUD, sons, 16 testes e 6 verificações e2e novas. |
| 8a | Infraestrutura do Surf Skill para os desafios: Treino × Desafio, tiers 1–6, formatos staged/linear com checkpoints, segmentos genéricos, fantasma do PB (gravação, IndexedDB, sincronia, diferença ao vivo), pulo nas bases, menu com abas, versões estáticas dos mapas, kit estendido. |

## Decisões tomadas (não desfazer sem pedido)

- **Rodada 8a:** pulo na zona de início liberado (o cap de 420 continua, inclusive saindo no ar), por isso os recordes da rodada 7 continuam valendo. O fantasma do PB só é trocado quando a corrida vira PB. A "velocidade mínima de projeto" passou a ser balística (considera a inclinação da saída), então os números dos mapas de treino subiram (424 / 870 / 1197 u/s) sem mudar a geometria. O steer dos bots ganhou `idealStrafe` só para o percurso de referência.
- **Rodada 7:** a linha da especificação sobre a zona de início veio cortada; interpretado como prespeed cap 420 u/s + pulo bloqueado, em toda zona de início. O fim de cada stage leva direto, parado, à zona de início do próximo. O tempo de cada stage vai de um split ao seguinte (os 5 somam o total). Cair no stage 1 depois de largar não zera o tempo (só o R zera). Ir para outro stage ou usar Z/X marca a corrida como prática. O strafe ideal no `steerToward` só é usado pelo percurso de referência; os bots da partida continuam como antes.
- **Rodada 6:** o sprint tático antigo continua no código e volta com `SPRINT.raiseWeapon` e `SPRINT.useStamina` = true. Teclas antigas de sprint migram para caminhar.
- **Gerais:** sem Three.js (renderizador próprio); toda configuração em `shared/config/`; a simulação não pode depender do DOM.

## Problemas já resolvidos (não reintroduzir)

- Jogador travando na rampa → overclip 0,01 e empurrão na colisão.
- Toques rápidos perdidos entre ticks → pulo e agachar consumidos por pelo menos um tick.
- Recuo da Longbow não voltava → atraso de recuperação = mín(intervalo × 1,2; 0,3 s).
- Teleporte e jump pad perdiam velocidade → teleportGlide (0,45 s sem atrito) e velocidade de entrada registrada antes do movimento.
- Transições do Surf Skill: o próximo apoio precisa ficar abaixo da trajetória (drop ≥ ~300 com gap 300); use `chainRamp` e `endAfter` do kit. Spawns ficam 2 u acima do piso.
- Banner/toasts da partida anterior apareciam no modo seguinte → `hud.clearTransient()` no início de cada jogo (e ao reiniciar o mapa no Surf Skill).
- Mudar o kit sem querer altera o hash dos mapas de treino e zera recordes → o teste de versões fixa os hashes da rodada 7.

## Pendências e ideias

- **Rodada 8b:** desafios D1–D6. **Rodada 8c:** D7–D12, índice de dificuldade crescente e tabela de métricas no README.
- Multiplayer online (a simulação já é separada do cliente; recordes e fantasmas já têm as interfaces `RecordStore` e `GhostStore` para um backend).
- Calibrar jogando: gaps do STORM SPIRE (stages 3 e 5, feitos no limite do percurso de referência), ritmo da pista de bhop do DRIFT CANYON (stage 4, espaçada para ~1170 u/s), prespeed cap (420), atraso da tela de fim (1,8 s), dano ×1,4 e caminhar ×0,55.
- Renderização por software nos testes roda a ~15 FPS; em GPU real é normal.
