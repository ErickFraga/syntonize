# Melhorias do Syntonize

Lista completa do que foi analisado, o que foi feito neste rework e o que ainda
vale fazer. Organizado por área. Itens com ✅ já estão na `main`; 🔄 estão em
andamento numa PR aberta; ⬜ é backlog, com prioridade sugerida (**P1** faz
diferença na próxima partida, **P2** deixa o jogo mais completo, **P3**
polimento). **Só o que falta fazer está em [BACKLOG.md](./BACKLOG.md).**

Capturas (renderização estática dos componentes, 1280 px e 390 px) em `docs/screenshots/`:
Noturno em `home.png`, `lobby.png`, `game-seer-clue.png`, `game-guessing.png`, `game-revealed.png`,
`game-revealed-mobile.png`, `results.png`, `lobby-custom.png` (anfitrião com cartas personalizadas) e
`lobby-custom-guest.png` (convidado vê só a contagem); tema claro em `*-light.png`.

---

## 1. Fidelidade ao jogo de tabuleiro (SINTONIA / Wavelength)

| | Item | Detalhe |
|---|---|---|
| ✅ | **Dial semicircular com ponteiro** | A barra reta com gradiente virou um dial em SVG, com face creme, marcações, aro e ponteiro vermelho girando a partir do eixo. É a imagem do jogo físico. |
| ✅ | **Cunha 2 \| 3 \| 4 \| 3 \| 2** | O alvo é desenhado como cunha com os números impressos, nas proporções do jogo (cerca de um quarto do dial). Antes era um círculo verde/amarelo numa barra. |
| ✅ | **"Tela" que esconde o alvo** | Quem não é o Vidente vê o dial coberto com um `?`, como a tampa do jogo físico. Na revelação a tampa gira em torno do eixo e some atrás do mostrador, mostrando a cunha que já estava por baixo. |
| ✅ | **Carta de espectro embaixo do dial** | Os dois conceitos ficam nos cantos, com setas, como a carta encaixada no dispositivo. |
| ✅ | **Regra da dica** | A dica não pode conter as palavras da carta (comparação sem acento e sem caixa). O servidor recusa e explica. |
| ✅ | **Ponteiros de todo mundo na revelação** | Cada palpite aparece como uma agulha fina na cor do jogador, com avatar na ponta. Quem zerou aparece esmaecido. |
| ✅ | **Baralho de cartas maior e com a cara do jogo** | Pacote clássico com 142 cartas (opinião, comida, coisas, pessoas, situações, natureza, abstratos) + 4 pacotes temáticos (318 cartas no total), sem repetir dentro de uma partida. Antes eram 40 antônimos simples. |
| ✅ | **Pontuação por cunha** | Centro ±3 → 4 pts, ±8 → 3 pts, ±13 → 2 pts (antes ±5/±10/±20, cunha ocupava 40% do dial). |
| ✅ | **Bônus de "mais perto" só dentro da cunha** | Errar "por menos" não ganha ponto. |
| ✅ | **Pontuação do Vidente reequilibrada** | Agora recebe a **média** dos pontos de quem palpitou (máx. 4). Antes somava bônus por cada jogador: com 8 pessoas o Vidente podia fazer 14 pontos numa rodada contra 5 de um palpiteiro. |
| ✅ | **Modo em equipes** | Regra do Wavelength original como alternativa no lobby: dois times balanceados ao entrar (troca de time e anfitrião movendo gente), Vidente rodando dentro do time, ponteiro compartilhado em tempo real só para o time da vez (`game:needleMove` com throttle no cliente e no servidor), palpite único do time, fase "esquerda ou direita" do adversário (`game:sideGuess`, 1 ponto), placar por time a 10 pontos, regra de revanche no 4 (opcional), resultados e estatísticas por time. Testes em `tests/teams.test.ts`. |
| ⬜ P2 | **Modo cooperativo** | Como no app oficial: todos no mesmo time, 7 rodadas, meta de pontos conjunta. Fácil de derivar do modo atual. |
| ✅ | **Cartas em outros idiomas / pacotes temáticos** | Baralho em `shared/cards/{pt-BR,en,es}.ts` com os mesmos ids nos três idiomas (expressões adaptadas, não traduzidas ao pé da letra). Pacotes: Clássico (142), Comida e bebida, Cultura pop, Pessoas e Picante 18+ (44 cada). No lobby o anfitrião escolhe o idioma das cartas (independente do idioma da interface de cada jogador) e liga/desliga pacotes; convidados veem em modo leitura. `pickCard` sorteia só do baralho filtrado e reembaralha quando ele acaba; a regra da dica usa stop words do idioma das cartas. Testes em `tests/cards.test.ts`. |
| ✅ | **Cartas personalizadas** | No lobby o anfitrião digita pares próprios (um por linha, `Quente \| Frio`), que entram no sorteio junto com os pacotes ligados: até 50 pares, cada lado com 2 a 24 caracteres, sem duplicados (ignora caixa, espaços e a ordem dos lados) e sem `\|` dentro do texto. Linhas recusadas ficam na caixa com o motivo. A sala precisa de pelo menos um pacote ligado **ou** 5 cartas personalizadas. `RoomSettings.customCards`, validado em `sanitizeSettings` (`shared/customCards.ts`); as cartas viram `SpectrumCard` com ids negativos e `pack: 'custom'` (`deckFor`/`getCardById`/`pickCard` recebem a lista da sala, reembaralha quando acaba) e a regra da dica vale para as palavras delas. Convidados recebem só a contagem (`roomViewFor` esvazia a lista e manda `customCardCount`), inclusive no `room:restored`, que antes mandava a sala crua. A lista fica no `localStorage` do anfitrião (`syntonize:customCards`) com o botão "usar as da última vez" numa sala nova, e "copiar lista" gera o texto para colar em outro lugar. Testes em `tests/customCards.test.ts`; capturas `docs/screenshots/lobby-custom*.png`. |

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
| ✅ | **Persistência das salas** | Abstração `RoomStore` (`server/roomStore.ts`): a memória continua sendo a fonte quente e cada sala é gravada por write-through com debounce de 250 ms (sala inteira + tokens de sessão + fase e `endsAt` do timer), apagada do store quando a varredura ou a saída do último jogador apaga a sala, com TTL de 24 h renovado a cada gravação. Sem `REDIS_URL` usa o `MemoryStore` (igual a antes); com ela, o `RedisStore` (`server/redisStore.ts`) fala RESP direto sobre `net`/`tls` (AUTH, SELECT, GET, SET EX, DEL, SCAN), sem dependência npm. Na subida o servidor carrega as salas antes de aceitar conexões, mas como **dormentes** (índices e tokens prontos, sem timers e sem gravar): no deploy sem downtime do Render a instância antiga ainda está jogando. Quando o primeiro jogador volta (token ou convite), a sala é relida do store (a última gravação da instância antiga, feita no SIGTERM, vence), quem estava online conta como recém-caído (30 s para voltar pelo token) e o timer é re-armado pelo `endsAt` (fase vencida avança na hora). Sala dormente que ninguém retoma sai na varredura de salas vazias. O cliente volta para a mesma tela com o toast "Reconectado!" e, se a sala tiver expirado, mostra um aviso em vez de ficar carregando. `render.yaml` cria o Key Value grátis e passa a `REDIS_URL`. Testes em `tests/persistence.test.ts` e `tests/redis.test.ts` (parser e integração com `redis-server`). Continua valendo **uma instância só**. |
| ⬜ P2 | **Rate limiting** | Nada impede alguém de criar 10 mil salas ou spammar `room:join`. Limitar por IP/socket. |
| ⬜ P2 | **Expiração de token de sessão** | Tokens vivem até a sala morrer. Com persistência, dar TTL. |
| ⬜ P3 | **Logs estruturados e métricas** | Hoje é `console.log`. |

## 3. Interface e experiência

| | Item | Detalhe |
|---|---|---|
| ✅ | **Design system "Cozy, versão madura"** | Derivado do Geoflagle: creme/ameixa, pastéis (céu, amarelo, laranja, verde, rosa), contorno de 2 px e sombra dura só no que é clicável, Nunito em tudo e Baloo 2 só no logotipo. Tokens em `globals.css`; tema **Noturno** padrão e tema claro via `data-theme="light"`, com toggle no cabeçalho e na home, lembrado no navegador e aplicado antes da hidratação (sem flash). Mocks aprovados no Claude Design. |
| ✅ | **Home** | Hero com dial interativo de demonstração, formulário único de apelido + criar/entrar, "como funciona" em 4 passos com a regra de pontos. |
| ✅ | **Página de convite** | Mostra quem é o anfitrião, quantos estão na sala e se a partida já começou. Lembra o apelido usado da última vez. |
| ✅ | **Lobby** | Código grande e copiável, botão de convite (usa `navigator.share` no celular), lista de jogadores com avatar colorido, "você", coroa do anfitrião, estado de reconexão e botão de remover. |
| ✅ | **Regras configuráveis no lobby** | Meta de pontos, limite de rodadas, tempo para a dica, tempo para o palpite e pausa entre rodadas, com controles segmentados; quem não é anfitrião vê em modo leitura. |
| ✅ | **Tela de jogo** | Barra da rodada (número, Vidente com avatar, timer em anel), dispositivo com dial + carta + dica em destaque, painel de fase contextual, placar lateral (ou abaixo no celular). |
| ✅ | **Palpite** | Arrasta no dial (mouse e toque), slider fino, botões −1/+1, teclado (setas, Shift para pular de 5, Home/End) e leitura do valor. Depois de travar, o ponteiro muda de cor. |
| ✅ | **Quem já travou** | Avatares com check para o Vidente e para quem já palpitou. |
| ✅ | **Revelação** | Tampa abrindo, agulhas de todos, lista de resultado com zona (4/3/2/0), rótulo ("Na mosca!", "Quase lá"…), bônus de mais perto e pontos do Vidente. Botão "Pronto" com contagem e countdown para a próxima rodada; anfitrião pode forçar. |
| ✅ | **Resultados** | Pódio com os 3 primeiros, lista do resto, destaques (mira certeira, melhor Vidente, sua melhor rodada), confete para quem venceu, "jogar de novo" e "voltar ao lobby". |
| ✅ | **Cores por jogador** | Cada jogador recebe uma cor estável usada no lobby, placar, lista de resultado e no dial. |
| ✅ | **Toasts** | Avisos do servidor (entrou/saiu, novo anfitrião, rodada pulada, erros) aparecem como notificação, não como `alert`. |
| ✅ | **Sons** | Efeitos sintetizados (sem arquivos): início de rodada, dica, travar palpite, tique nos últimos 5 s, revelação, fim de partida. Botão de mudo no cabeçalho, lembrado no navegador. |
| ✅ | **Música de fundo** | Loop lo-fi (gerado no Suno a partir de um prompt chill com ar de mistério) tocando baixinho pelo Web Audio, com emenda calculada por um script: análise do andamento e dos compassos, corte em 32 compassos e crossfade de 50 ms. Botão no cabeçalho (home e sala) com ligar/desligar e volume, lembrado no navegador; começa no primeiro toque por causa do autoplay. Some sozinho se o arquivo não existir. |
| ✅ | **Timer sincronizado** | O cliente usa `endsAt` do servidor + offset e atualiza 4x por segundo; o anel fica laranja em 10 s e vermelho em 5 s. |
| ✅ | **Estado de conexão** | "Reconectando…" no cabeçalho; botão de sair pede confirmação durante a partida. |
| ✅ | **Mobile** | Layouts testados a 390 px: dial ocupa a largura, placar vai para baixo, painel de resultado reorganiza em duas linhas, botões em coluna. |
| ✅ | **Acessibilidade básica** | Dial é `role="slider"` com `aria-valuenow`; foco visível; grupos de rádio nas regras; `aria-live` nos toasts. |
| ✅ | **Metadados** | Título, descrição, Open Graph e `theme-color` em português. |
| ✅ | **Imagem Open Graph** | `src/app/opengraph-image.tsx` (`next/og`, 1200×630): logo, "Leia a mente dos seus amigos" com a segunda linha em destaque, frase curta e dois chips à esquerda; à direita o dial semicircular (cunha 2 \| 3 \| 4 \| 3 \| 2, ponteiro vermelho, cores do dial) inclinado −3° sobre uma carta "Quente / Frio". Cores do tema Noturno do design system (`globals.css` e `Dial.module.css`), replicadas em `src/lib/og/OgDial.tsx` porque o Satori não lê variáveis CSS. O convite `/join/[código]` tem imagem própria ("Entre na sala de {anfitrião}", jogadores na sala, código), que consulta o servidor por `GET /api/room/[código]` (`server/httpApi.ts`, responde só `{ hostName, playerCount, status }`, 404 para sala inexistente) e cai numa imagem genérica se a consulta falhar. Textos via i18n (`meta.tagline`, `meta.joinTitle`, `meta.joinPlayers`) no idioma do cookie `syntonize-locale` ou do Accept-Language. Sem fontes externas (usa a fonte embutida no `next/og`). `metadataBase` vem de `SITE_URL` ou `RENDER_EXTERNAL_URL` para a URL da imagem ser absoluta. Testes em `tests/httpApi.test.ts`. |
| ✅ | **QR code no lobby** | Gerador próprio em `src/lib/qrcode.ts` (sem dependência): modo byte UTF-8, correção M, versões 1–10 escolhidas pelo tamanho, Reed-Solomon em GF(256) com intercalação de blocos, formato BCH, informação de versão (≥ 7) e máscara pelas 4 regras de penalidade; vira um único `path` SVG. No lobby, ao lado do código, aponta para o link de convite; clicar amplia em tela cheia (QR grande + código, fecha com Esc ou clique) para a galera na mesma sala apontar o celular. Testes em `tests/qrcode.test.ts` com valores de referência publicados e um decodificador independente que lê a matriz de volta. |
| ⬜ P2 | **Histórico de rodadas na partida** | Guardamos `roundHistory`; dá para abrir um painel com todas as cartas/dicas/resultados da partida. |
| ✅ | **Chat e reações** | Chat da sala (`chat:send` / `chat:message`): texto normalizado de até 200 caracteres e 6 reações rápidas (🔥 😂 🤔 👏 😱 ❤️), rate limit de 5 mensagens a cada 10 s por jogador (janela deslizante), últimas 50 mensagens guardadas na sala e enviadas em `chat:history` para quem entra ou reconecta, mensagens de sistema (entrou, saiu, removido, rodada revelada, fim de jogo) como códigos. O Vidente só manda reações enquanto a rodada dele está aberta, para não vazar a dica. Painel ao lado do placar no desktop, botão flutuante com badge de não lidas + folha inferior no celular, som curto respeitando o mudo. Testes em `tests/chat.test.ts`. |
| ⬜ P2 | **Modo espectador** | Entrar numa sala só para assistir (sem participar da rotação). |
| ✅ | **Tema claro** | Paleta clara (creme, branco, lilás) e toggle sol/lua. |
| ⬜ P3 | **PWA** | Manifesto + ícone para "instalar" no celular. |
| ✅ | **Internacionalização** | pt-BR (padrão), en e es sem biblioteca: dicionários em `src/i18n/<locale>.ts` tipados pelo pt-BR (chave faltando quebra o typecheck), `useT()` com interpolação `{nome}`, plural simples e texto rico, seletor de idioma no cabeçalho da sala e na home/convite, escolha salva no localStorage + cookie (o servidor usa o cookie ou o `Accept-Language` para `<html lang>` e os metadados). O servidor não manda mais texto: erros e avisos são `{ code, params }` (`MESSAGE_CODES` em `shared/types.ts`) traduzidos no cliente. Testes em `tests/i18n.test.ts` (cobertura de chaves e placeholders nos 3 idiomas). |
| ✅ | **Animação da tampa** | Na revelação a tampa (o mesmo semicírculo `--cream-2` com `?`, borda `--line-soft` para a beirada aparecer no giro) gira 180° em torno do eixo do ponteiro em 700 ms (`cubic-bezier(0.22, 1, 0.36, 1)`) e é recortada na linha do mostrador, como se fosse para trás dele; a cunha já está desenhada por baixo, sem animação de crescer. O `Dial` lembra se o jogador tinha a tampa, então ela abre mesmo com `covered` já `false` e não aparece para o Vidente. Marcadores entram depois (0,75 s + 0,08 s por jogador). Com `prefers-reduced-motion` a tampa some na hora e os marcadores entram sem atraso. Quadros intermediários na tela `dial-lid` do preview. |

## 4. Código, testes e tooling

| | Item | Detalhe |
|---|---|---|
| ✅ | **34 testes de caso de uso** | `tests/roomManager.test.ts` cobre criar/entrar, validações, regras, iniciar, dica, timers, palpite, pontuação, pronto/próxima rodada, fim por pontos e por rodadas, voltar ao lobby, reconexão, Vidente ausente, kick, saída, entrada no meio da partida, tolerância de reconexão e limpeza. Rodam com `node --test`, relógio falso, sem rede. |
| ✅ | **`npm test`, `npm run typecheck`** | Scripts novos. |
| ✅ | **Código morto removido** | `src/app/api/room/[code]/route.ts` (stub nunca usado), `Spectrum.tsx`, ícones duplicados nas páginas. |
| ✅ | **Tipos compartilhados** | `shared/types.ts` é a fonte única; o cliente importa via `@/types/game`. Eventos de socket tipados nos dois lados. |
| ✅ | **Imports com extensão `.ts` no código compartilhado** | Permite o Node rodar `shared/` e `server/` sem transpilar (`allowImportingTsExtensions`). |
| ✅ | **Deploy no Render** | `render.yaml` (Blueprint, plano free, auto-deploy) e seção no README. |
| ✅ | **Build do Next no deploy** | O `tsconfig.json` incluía `server/**` e o `next build` quebrava checando tipos do servidor. Agora o Next cobre só `src/` e `shared/`; o servidor tem `npm run typecheck:server`. |
| ✅ | **Preview sem `node_modules`** | `tools/preview`: Bun + React mínimo renderizam as telas para HTML, Chromium tira screenshots (dois temas), shims de tipos permitem rodar o `tsc` no cliente. |
| ✅ | **Dependências não usadas removidas** | `lucide-react`, `nanoid`, `uuid`, `@types/uuid` e `ts-node` saíram do `package.json`; o `package-lock.json` foi regenerado com `npm uninstall --package-lock-only` (remover não precisa do registro) e o `npm ci` da CI confirma o lockfile. O `nanoid` 3 continua no lock como dependência interna do `postcss`. |
| ✅ | **CI no GitHub Actions** | `.github/workflows/ci.yml`: em toda PR e em push na `main` e na `release`, com Node 22 e cache do npm, roda `npm ci`, `npm test`, `typecheck:server`, `lint`, `build` e `typecheck` (depois do build, que gera o `next-env.d.ts`). `SITE_URL` fictícia no job para o `metadataBase`. Badge no README. A primeira execução achou um erro de tipagem real em `server/index.ts` (o `withPlayer` tipava o erro como `string`, o contrato usa `Message`). O lint passa com dois avisos de `react-hooks/exhaustive-deps` que são intencionais (efeitos que só devem rodar em nova rodada ou com guarda de tentativa). |
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
