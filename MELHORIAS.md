# Melhorias do Syntonize

Lista completa do que foi analisado, o que foi feito neste rework e o que ainda
vale fazer. Organizado por área. Itens com ✅ já estão no código; ⬜ é backlog,
com prioridade sugerida (**P1** faz diferença na próxima partida, **P2** deixa
o jogo mais completo, **P3** polimento).

Capturas (renderização estática dos componentes, 1280 px e 390 px) em `docs/screenshots/`:
`home.png`, `lobby.png`, `game-seer-clue.png`, `game-guessing.png`, `game-revealed.png`,
`game-revealed-mobile.png`, `results.png`.

---

## 1. Fidelidade ao jogo de tabuleiro (SINTONIA / Wavelength)

| | Item | Detalhe |
|---|---|---|
| ✅ | **Dial semicircular com ponteiro** | A barra reta com gradiente virou um dial em SVG, com face creme, marcações, aro e ponteiro vermelho girando a partir do eixo. É a imagem do jogo físico. |
| ✅ | **Cunha 2 \| 3 \| 4 \| 3 \| 2** | O alvo é desenhado como cunha com os números impressos, nas proporções do jogo (cerca de um quarto do dial). Antes era um círculo verde/amarelo numa barra. |
| ✅ | **"Tela" que esconde o alvo** | Quem não é o Vidente vê o dial coberto com um `?`, como a tampa do jogo físico. Na revelação a cunha "abre" com animação. |
| ✅ | **Carta de espectro embaixo do dial** | Os dois conceitos ficam nos cantos, com setas, como a carta encaixada no dispositivo. |
| ✅ | **Regra da dica** | A dica não pode conter as palavras da carta (comparação sem acento e sem caixa). O servidor recusa e explica. |
| ✅ | **Ponteiros de todo mundo na revelação** | Cada palpite aparece como uma agulha fina na cor do jogador, com avatar na ponta. Quem zerou aparece esmaecido. |
| ✅ | **Baralho de cartas maior e com a cara do jogo** | 142 cartas em português (opinião, comida, coisas, pessoas, situações, natureza, abstratos), sem repetir dentro de uma partida. Antes eram 40 antônimos simples. |
| ✅ | **Pontuação por cunha** | Centro ±3 → 4 pts, ±8 → 3 pts, ±13 → 2 pts (antes ±5/±10/±20, cunha ocupava 40% do dial). |
| ✅ | **Bônus de "mais perto" só dentro da cunha** | Errar "por menos" não ganha ponto. |
| ✅ | **Pontuação do Vidente reequilibrada** | Agora recebe a **média** dos pontos de quem palpitou (máx. 4). Antes somava bônus por cada jogador: com 8 pessoas o Vidente podia fazer 14 pontos numa rodada contra 5 de um palpiteiro. |
| ✅ | **Modo em equipes** | Regra do Wavelength original como alternativa no lobby: dois times balanceados ao entrar (troca de time e anfitrião movendo gente), Vidente rodando dentro do time, ponteiro compartilhado em tempo real só para o time da vez (`game:needleMove` com throttle no cliente e no servidor), palpite único do time, fase "esquerda ou direita" do adversário (`game:sideGuess`, 1 ponto), placar por time a 10 pontos, regra de revanche no 4 (opcional), resultados e estatísticas por time. Testes em `tests/teams.test.ts`. |
| ⬜ P2 | **Modo cooperativo** | Como no app oficial: todos no mesmo time, 7 rodadas, meta de pontos conjunta. Fácil de derivar do modo atual. |
| ⬜ P3 | **Cartas em outros idiomas / pacotes temáticos** | Baralho em `shared/cards.ts`; dá para adicionar "pack família", "pack +18", "pack nerd" e deixar o anfitrião escolher. |
| ⬜ P3 | **Cartas personalizadas** | O anfitrião digita pares próprios para a partida. |

## 2. Bugs e robustez (servidor)

| | Item | Detalhe |
|---|---|---|
| ✅ | **Reconexão quebrava a partida** | O id do jogador era o `socket.id`; ao reconectar o id mudava, mas `seerOrder`, palpites e "prontos" guardavam o id antigo. Resultado: o próximo Vidente não existia e o jogo travava. Agora cada jogador tem um id estável e um token de sessão. |
| ✅ | **Vidente desconectado travava o jogo** | Não havia timer na fase de dica; se o Vidente caísse, ninguém saía dali. Agora a rodada é pulada (com aviso) e o anfitrião também pode pular manualmente. |
| ✅ | **Rodada esperava jogadores offline** | Só jogadores conectados são aguardados para o palpite e para o "pronto". |
| ✅ | **F5 não é desconexão** | Período de tolerância de 6 s: quem atualiza a página volta sem perder a rodada, sem pular a vez e sem ser removido. |
| ✅ | **Alvo vazava para todo mundo** | O `room:state` mandava `targetPosition` para todos os clientes (bastava abrir a aba de rede). Agora cada jogador recebe uma visão sanitizada: alvo só para o Vidente, palpites só os seus até a revelação. |
| ✅ | **Palpites alheios visíveis** | Idem: antes os palpites eram enviados conforme chegavam. |
| ✅ | **Jogador que não palpitou aparecia em 50** | A revelação usava `?? 50`. Agora quem não palpitou aparece como "não palpitou", sem marcador. |
| ✅ | **Salas e sessões vazavam memória** | Jogadores desconectados nunca eram removidos e salas nunca eram apagadas. Agora há uma varredura: remove quem abandonou o lobby (45 s), passa o anfitrião adiante (15 s offline) e apaga salas sem ninguém (10 min). |
| ✅ | **Anfitrião sumia e ninguém podia iniciar** | O anfitrião passa automaticamente para alguém conectado. |
| ✅ | **Rotação de Vidente** | Ao remover um jogador, o índice da rotação é corrigido e o próximo Vidente é sempre alguém conectado. |
| ✅ | **Validação no servidor** | Apelido (1–16 letras, normalizado), código, dica (60 caracteres, sem palavras da carta), palpite (número, 0–100), configurações (só valores permitidos). Antes um socket malicioso podia mandar apelido vazio, dica gigante ou `NaN`. |
| ✅ | **Partida com 1 jogador** | Se alguém sair e sobrar só um, a partida termina com resultado em vez de ficar em um limbo. |
| ✅ | **`maxRounds` nunca era usado** | Agora é uma regra real. |
| ✅ | **Engine separada do Socket.io** | `server/roomManager.ts` não conhece sockets; `server/index.ts` só faz a ponte. Permite testar tudo sem rede e trocar o transporte no futuro. |
| ✅ | **Um socket por jogador** | Abrir a mesma sessão em duas abas substitui a anterior em vez de duplicar o jogador. |
| ⬜ P1 | **Persistência das salas** | Tudo é memória: reiniciar o servidor derruba todas as partidas. Redis (ou SQLite) com os `Room` serializados resolve e permite mais de uma instância. |
| ⬜ P2 | **Rate limiting** | Nada impede alguém de criar 10 mil salas ou spammar `room:join`. Limitar por IP/socket. |
| ⬜ P2 | **Expiração de token de sessão** | Tokens vivem até a sala morrer. Com persistência, dar TTL. |
| ⬜ P3 | **Logs estruturados e métricas** | Hoje é `console.log`. |

## 3. Interface e experiência

| | Item | Detalhe |
|---|---|---|
| ✅ | **Design system novo** | Tokens de cor, tipografia (Fredoka para títulos, Nunito para texto), botões, inputs, chips, cards, animações e `prefers-reduced-motion` em `globals.css`. |
| ✅ | **Home** | Hero com dial interativo de demonstração, formulário único de apelido + criar/entrar, "como funciona" em 4 passos com a regra de pontos. |
| ✅ | **Página de convite** | Mostra quem é o anfitrião, quantos estão na sala e se a partida já começou. Lembra o apelido usado da última vez. |
| ✅ | **Lobby** | Código grande e copiável, botão de convite (usa `navigator.share` no celular), lista de jogadores com avatar colorido, "você", coroa do anfitrião, estado de reconexão e botão de remover. |
| ✅ | **Regras configuráveis no lobby** | Meta de pontos, limite de rodadas, tempo para a dica, tempo para o palpite e pausa entre rodadas, com controles segmentados; quem não é anfitrião vê em modo leitura. |
| ✅ | **Tela de jogo** | Barra da rodada (número, Vidente com avatar, timer em anel), dispositivo com dial + carta + dica em destaque, painel de fase contextual, placar lateral (ou abaixo no celular). |
| ✅ | **Palpite** | Arrasta no dial (mouse e toque), slider fino, botões −1/+1, teclado (setas, Shift para pular de 5, Home/End) e leitura do valor. Depois de travar, o ponteiro muda de cor. |
| ✅ | **Quem já travou** | Avatares com check para o Vidente e para quem já palpitou. |
| ✅ | **Revelação** | Animação da cunha, agulhas de todos, lista de resultado com zona (4/3/2/0), rótulo ("Na mosca!", "Quase lá"…), bônus de mais perto e pontos do Vidente. Botão "Pronto" com contagem e countdown para a próxima rodada; anfitrião pode forçar. |
| ✅ | **Resultados** | Pódio com os 3 primeiros, lista do resto, destaques (mira certeira, melhor Vidente, sua melhor rodada), confete para quem venceu, "jogar de novo" e "voltar ao lobby". |
| ✅ | **Cores por jogador** | Cada jogador recebe uma cor estável usada no lobby, placar, lista de resultado e no dial. |
| ✅ | **Toasts** | Avisos do servidor (entrou/saiu, novo anfitrião, rodada pulada, erros) aparecem como notificação, não como `alert`. |
| ✅ | **Sons** | Efeitos sintetizados (sem arquivos): início de rodada, dica, travar palpite, tique nos últimos 5 s, revelação, fim de partida. Botão de mudo no cabeçalho, lembrado no navegador. |
| ✅ | **Timer sincronizado** | O cliente usa `endsAt` do servidor + offset e atualiza 4x por segundo; o anel fica laranja em 10 s e vermelho em 5 s. |
| ✅ | **Estado de conexão** | "Reconectando…" no cabeçalho; botão de sair pede confirmação durante a partida. |
| ✅ | **Mobile** | Layouts testados a 390 px: dial ocupa a largura, placar vai para baixo, painel de resultado reorganiza em duas linhas, botões em coluna. |
| ✅ | **Acessibilidade básica** | Dial é `role="slider"` com `aria-valuenow`; foco visível; grupos de rádio nas regras; `aria-live` nos toasts. |
| ✅ | **Metadados** | Título, descrição, Open Graph e `theme-color` em português. |
| ✅ | **Imagem Open Graph** | `src/app/opengraph-image.tsx` (`next/og`, 1200×630): dial semicircular com a cunha 2 \| 3 \| 4 \| 3 \| 2 e ponteiro vermelho, nas cores do dial, mais "Syntonize" e "Leia a mente dos seus amigos". O convite `/join/[código]` tem imagem própria ("Entre na sala de {anfitrião}", jogadores na sala, código), que consulta o servidor por `GET /api/room/[código]` (`server/httpApi.ts`, responde só `{ hostName, playerCount, status }`, 404 para sala inexistente) e cai numa imagem genérica se a consulta falhar. Sem fontes externas (usa a fonte embutida no `next/og`). `metadataBase` vem de `SITE_URL` ou `RENDER_EXTERNAL_URL` para a URL da imagem ser absoluta. Testes em `tests/httpApi.test.ts`. |
| ⬜ P1 | **QR code no lobby** | Para quem está na mesma sala física apontar o celular. (`qrcode` npm ou SVG próprio.) |
| ⬜ P2 | **Histórico de rodadas na partida** | Guardamos `roundHistory`; dá para abrir um painel com todas as cartas/dicas/resultados da partida. |
| ⬜ P2 | **Chat ou reações** | Emojis rápidos durante o palpite ("🔥", "😂") dão vida ao jogo remoto. |
| ⬜ P2 | **Modo espectador** | Entrar numa sala só para assistir (sem participar da rotação). |
| ⬜ P2 | **Tema claro** | Os tokens estão prontos; falta a paleta clara e o toggle. |
| ⬜ P3 | **PWA** | Manifesto + ícone para "instalar" no celular. |
| ⬜ P3 | **Internacionalização** | Textos estão todos em pt-BR hard-coded. |
| ⬜ P3 | **Animação da tampa** | Hoje a cunha "cresce"; uma tampa deslizando como no jogo físico seria ainda mais fiel. |

## 4. Código, testes e tooling

| | Item | Detalhe |
|---|---|---|
| ✅ | **34 testes de caso de uso** | `tests/roomManager.test.ts` cobre criar/entrar, validações, regras, iniciar, dica, timers, palpite, pontuação, pronto/próxima rodada, fim por pontos e por rodadas, voltar ao lobby, reconexão, Vidente ausente, kick, saída, entrada no meio da partida, tolerância de reconexão e limpeza. Rodam com `node --test`, relógio falso, sem rede. |
| ✅ | **`npm test`, `npm run typecheck`** | Scripts novos. |
| ✅ | **Código morto removido** | `src/app/api/room/[code]/route.ts` (stub nunca usado), `Spectrum.tsx`, ícones duplicados nas páginas. |
| ✅ | **Tipos compartilhados** | `shared/types.ts` é a fonte única; o cliente importa via `@/types/game`. Eventos de socket tipados nos dois lados. |
| ✅ | **Imports com extensão `.ts` no código compartilhado** | Permite o Node rodar `shared/` e `server/` sem transpilar (`allowImportingTsExtensions`). |
| ⬜ P1 | **Remover dependências não usadas** | `lucide-react`, `nanoid`, `uuid`, `@types/uuid` e `ts-node` não são importados em lugar nenhum. Não removi porque o `package-lock.json` precisa ser regenerado com acesso ao registro npm (bloqueado neste ambiente). |
| ⬜ P1 | **CI** | GitHub Actions rodando `npm test`, `typecheck`, `lint` e `build`. |
| ⬜ P2 | **Testes de componente** | O harness usado nesta sessão renderizou os componentes com um React mínimo; vale formalizar com Vitest + Testing Library (Dial: cálculo de ângulo, teclado; Game: painéis por fase). |
| ⬜ P2 | **Teste ponta a ponta** | Playwright com 3 navegadores jogando uma rodada completa. |
| ⬜ P3 | **Dockerfile** | Para deploy simples (Fly.io, Railway, Render). |

## 5. Decisões de regra que mudaram (para você validar)

Estas mudanças alteram o jogo em relação ao código anterior. Todas são fáceis
de ajustar em `shared/types.ts` (`SCORING`, `DEFAULT_SETTINGS`, `SETTINGS_OPTIONS`):

1. **Cunha mais estreita** (±3/±8/±13 em vez de ±5/±10/±20) — mais próximo do jogo físico, exige dicas melhores.
2. **Vidente ganha a média** dos pontos dos palpiteiros, em vez de bônus acumulado por jogador.
3. **Bônus "+1 mais perto"** só para quem pontuou; empate dá +1 para todos os empatados.
4. **Meta padrão 15 pontos** (era 30) e **45 s para palpitar** (era 30 s). Tudo configurável no lobby.
5. **Entrar no meio da partida** é permitido (só não em partida encerrada).
6. **Rodada pulada não conta** no número da rodada nem no histórico.
7. **"Jogar de novo"** reinicia na hora; **"Voltar ao lobby"** zera e permite mexer nas regras e esperar mais gente.

---

### Como foi verificado

- Lógica do servidor: 34 testes automatizados (`npm test`), todos passando.
- Tipagem: `tsc` sem erros em `shared/`, `server/` e `src/` (com shims de React/Next, já que o registro npm estava bloqueado e `node_modules` não pôde ser instalado neste ambiente).
- Visual: cada tela (home, convite, lobby anfitrião/convidado, Vidente esperando dica, palpiteiro esperando, palpitando, Vidente vendo palpites, revelação, resultados) foi renderizada para HTML estático e fotografada no Chromium em 1280 px e 390 px.
- **Pendente no seu ambiente**: `npm install && npm run build && npm run dev` para confirmar o build do Next e jogar uma partida real com 2–3 abas. O código de socket segue o mesmo contrato dos testes, mas não pôde ser executado aqui.
