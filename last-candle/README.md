# LAST CANDLE — Degen LAN House

> *“One more trade. Then we go home.”*

Jogo 3D em primeira pessoa para navegador. Uma lan house degen aberta 24 horas, numa noite chuvosa: você faz trades **simulados**, conversa com frequentadores caricatos que reagem ao mercado, brinca com objetos físicos e evolui sua estação.

**SIMULATED MARKET • VIRTUAL FUNDS** — nenhum preço real, contrato, logo oficial ou integração onchain. Os nomes Delta, HOOKR, Pons, Stonkbonker e Cashcat aparecem só como texto/emblemas provisórios; as “personalidades” deles são regras de jogo fictícias.

## Como rodar

```bash
cd last-candle
npm install
npm run dev        # http://localhost:5173
```

Outros comandos:

```bash
npm run build      # typecheck + build de produção em dist/ (estático, abre em qualquer servidor)
npm run build:single  # um único HTML autocontido em dist-single/last-candle.html (abre até com duplo clique)
npm run preview    # serve o build
npm test           # testes do motor de mercado e da carteira (vitest)
npm run typecheck
```

Requer um navegador desktop com WebGL2 (Chrome, Edge, Firefox, Safari recentes). Há controles de toque básicos para celular/tablet.

## Controles

| Tecla | Ação |
| --- | --- |
| WASD / setas | andar (Shift apressa) |
| Mouse | olhar (clique na tela para capturar o mouse) |
| E | interagir • sentar • pegar • posicionar objeto na superfície mirada |
| Botão esquerdo | usar objeto (beber, comer, apertar o mascote, mostrar recibo, desenhar no quadro) • **segurar para arremessar** |
| Botão direito | inspecionar o objeto (mouse gira) |
| R / Q | girar o objeto / soltar |
| Tab | ver as metas da noite |
| Esc | sair do terminal (levantar) • pausar |
| **No terminal** | cursor do mouse clica no monitor 3D • `1-5` tokens • `B` comprar • `S` vender • `X` vender tudo • `+/-` ou roda do mouse ajustam o tamanho • `Tab` abas • `Espaço` recostar e olhar a sala |

Se o navegador não permitir capturar o mouse (por exemplo, dentro de um iframe), o jogo entra em modo “arrastar para olhar”.

## O que tem no jogo

- **A lan house**: loja estreita e profunda com vitrine de vidro e chuva na rua (carro passando, raios em chuva forte), balcão com caixa registradora, impressora térmica, campainha e CRT com os tempos de sessão; sofá virado para a janela, ventilador oscilante, luminária, geladeira de energético; duas fileiras de PCs com divisórias baixas, monitores de gerações diferentes, gabinetes reaproveitados com ventoinhas girando, cadeiras diferentes; telão; quadro branco; mural de recibos; corredor com armários e WC; sala de servidores envidraçada; mezanino com duas estações premium (bloqueado no início).
- **Mercado simulado** (`src/market/`): um único `MarketEngine` autoritativo, ticks fixos (4/s) independentes da taxa de quadros, candles OHLC de 1 minuto de jogo (= 10 s reais), regimes por token (tendência, arrancadas/reversões, períodos calmos + botes, saltos, clusters de volatilidade), spread e taxa explícitos (0,10% por lado), histórico preservado. Todos os monitores, o telão e os NPCs leem o mesmo mercado. As posições do jogador **nunca** entram na geração de preços.
- **Terminal** em canvas dentro do monitor 3D, clicável via raycast: watchlist, gráfico de candles com volume, preço, variação, volume, saldo, tamanho da ordem, BUY/SELL/SELL ALL, posições com preço médio, P/L realizado e não realizado (já descontando a taxa de saída), histórico imutável e metas da noite. CRT antigo tem scanlines; o upgrade de monitor dá mais espaço.
- **NPCs** (`src/npc/`): The Owner, Top Buyer, The Lurker, Chart Wizard e Night Shift (+ o courier das entregas). Rig procedural com olhos, pálpebras, sobrancelhas e boca animados; poses mescladas (sentar, digitar, andar, inclinar, comemorar, mãos na cabeça, beber, desenhar, mostrar recibo…); rotina curta, humor, posições simuladas próprias com estratégias de personagem, falas contextuais (opiniões, nunca previsões), navegação por grafo sem atravessar móveis e esperando/desviando do jogador. Um agendador limita reações simultâneas e impõe intervalos.
- **Eventos**: THE BIG CANDLE (ping num terminal → alguém percebe → outro gira a cadeira para o telão → holders reagem, outros comentam), PRINTER FLEX (imprimir o trade encerrado com dados reais, levar, prender no mural — NPCs comentam; o Top Buyer também imprime e prende os dele), LAST CALL (04:40: o dono pisca as luzes, avisa e cada um comenta a própria posição), chegada do Night Shift (02:05), debate no quadro, entrega de equipamento, mudança de chuva e o desafio do Lurker.
- **Física** (cannon-es): pegar, segurar, girar, inspecionar, arremessar, posicionar; copo, lata, salgadinho, bola de papel (amasse no bloco de notas do PC 03), mascote Wick, canetas do quadro, recibo, caixas e mouses de tarefas. Velocidades limitadas, corpos dormem em repouso, recuperação de objetos que saem do mapa, limite de objetos descartáveis, cesta de lixo oca com pontuação, ventilador empurra objetos leves.
- **Progressão**: reputação e créditos vêm de várias atividades (introdução, trades — ganhando ou perdendo —, conversar, tarefas do dono, segredos, metas da noite, mural). Loja do dono: cadeira, teclado mecânico, monitor maior, segundo monitor, gabinete custom, decoração, armário pessoal e estação no mezanino — todos aparecem no cenário. Se o saldo cair, tarefas curtas pagam créditos e um “float” virtual (contabilizado à parte do P/L), sem reiniciar o jogo.
- **Save local** (localStorage) automático: mercado completo (incluindo o estado do gerador aleatório), carteira, histórico, progresso, melhorias, metas, posições de objetos, recibos no mural, desenho do quadro, posições dos NPCs, chuva, ventilador e luminária. **O mercado só roda com o jogo aberto** — ao voltar, os preços continuam exatamente de onde pararam (isso é dito ao jogador).
- **Áudio 100% procedural** (WebAudio): chuva, ventoinhas, geladeira, servidores, ventilador, teclas, cadeiras, impressora térmica, vozes em “murmúrio”, compra/venda curtas.
- **Configurações**: sensibilidade, inverter Y, head bob, FOV, resolução de render, sombras (off/low/high), volume e ambiência, FPS.

## Estrutura

```
src/
  core/       Game (orquestração e estados), Input, Settings, Save, EventBus, rng, math
  world/      layout (coordenadas), LanHouse (arquitetura/mobília/luz), Station (PC + upgrades),
              Collision (colisão do jogador), Outside (rua/chuva), Interactables, texturas e materiais procedurais
  player/     Player (controle e câmera), Hands (mãos em primeira pessoa), Holding (objetos na mão), Interaction (raycast/prompt/destaque)
  physics/    Physics (cannon-es), Props (objetos manipuláveis)
  market/     assets (cadastro configurável dos tokens), MarketEngine, Portfolio, format
  terminal/   Terminal (UI no monitor), Screens (monitores dos NPCs, telão, CRT do balcão), chart
  npc/        CharacterRig, Npc, NpcManager (agendador de reações e balões), Nav, dialogue
  systems/    Events, Progression, NightClock, Whiteboard, Receipts, Audio
  ui/         UI (HUD, diálogos, loja, pausa, resumo, toque)
tests/        testes do motor de mercado e da carteira
```

Para trocar nomes, emblemas ou parâmetros dos tokens, edite `src/market/assets.ts` — o motor não precisa mudar.

## Limitações conhecidas

- Personagens e mãos são modelados por primitivas e animados de forma procedural (sem modelos rigados/skinning nem motion capture); as animações são estilizadas, não realistas.
- Sem oclusão de ambiente nem iluminação pré-calculada; a iluminação é em tempo real com uma luz de sombra direcional e luzes pontuais sem sombra.
- Colisão do jogador usa caixas alinhadas aos eixos; NPCs andam por um grafo de pontos fixos (não há navmesh) e são “empurrões suaves” para o jogador, que nunca fica preso.
- O mercado é deliberadamente simples (regimes estocásticos); não há livro de ofertas, slippage além do spread fixo, nem impacto das ordens no preço. Somente spot — sem alavancagem.
- Controles de toque são básicos (joystick, olhar arrastando, botões E/USE/DROP/LOOK).
- O save fica no navegador (localStorage); limpar dados do site apaga o progresso.
