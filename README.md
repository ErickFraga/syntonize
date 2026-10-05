# Syntonize

[![CI](https://github.com/ErickFraga/syntonize/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ErickFraga/syntonize/actions/workflows/ci.yml)

Versão online, em tempo real, do jogo de tabuleiro **SINTONIA** (*Wavelength*).
Um jogador é o **Vidente**: vê onde o alvo está escondido no dial e dá uma dica.
Todo mundo gira o ponteiro para onde acha que o alvo está, trava o palpite e a
cunha **2 | 3 | 4 | 3 | 2** é revelada.

- Next.js 14 (App Router) + Socket.io, tudo em um único processo Node.
- Salas por código de 6 letras, link de convite, reconexão automática por token.
- Dial semicircular em SVG, arrastável no celular e no desktop, com teclado.
- Regras configuráveis pelo anfitrião (meta de pontos, limite de rodadas, tempos).
- Lógica de jogo isolada e coberta por testes (sem precisar subir socket nem navegador).

## Rodando

```bash
npm install
npm run dev        # http://localhost:3000
```

Produção:

```bash
npm run build
npm start          # PORT=3000 por padrão
```

Requer Node **22.18+** (os testes usam o suporte nativo a TypeScript do Node).

## Deploy de graça (Render)

O projeto tem um [`render.yaml`](./render.yaml) pronto para o plano gratuito do Render:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ErickFraga/syntonize)

Ou, no painel do Render: **New → Blueprint**, escolha este repositório e confirme.
Cada push na branch configurada faz um deploy novo.

O que esperar do plano free:

- O serviço dorme após 15 minutos sem ninguém conectado e leva uns 50 s para
  acordar no primeiro acesso. Com o Key Value do blueprint as salas sobrevivem
  ao sono, a deploys e a crashes (veja "Persistência das salas" abaixo).
- Mantenha **uma única instância**: as salas vivem na memória do processo e o
  Key Value é só a cópia para reinícios, não um estado compartilhado.
- A porta vem da variável `PORT`, que o Render define sozinho.
- A prévia do link (imagem Open Graph) precisa da URL pública do site. No Render
  ela vem de `RENDER_EXTERNAL_URL`, automaticamente; em outro host, defina
  `SITE_URL=https://seu-dominio` (no build e na execução).

## Persistência das salas

As salas ficam em memória e são copiadas (write-through, com debounce curto) para um store,
de onde voltam quando o processo reinicia. Os jogadores reconectam sozinhos pelo token de
sessão salvo no navegador e caem na mesma tela, com um aviso de "Reconectado!".

Na subida as salas são carregadas como *dormentes*: só voltam a rodar (timers, gravações)
quando o primeiro jogador reconecta, e nesse momento são relidas do store. Assim, num deploy
sem downtime, o que a instância antiga gravou ao receber o SIGTERM é o que vale. Uma fase cujo
tempo acabou enquanto o servidor estava fora avança na hora.

| Variável | Efeito |
|---|---|
| `TRUSTED_PROXY_HOPS` (opcional) | Quantos proxies à frente do servidor acrescentam o IP ao `X-Forwarded-For` (padrão `1`, o balanceador do Render). Usado no rate limiting por IP. |
| `REDIS_URL` (opcional) | `redis://[usuário:senha@]host[:porta][/db]` ou `rediss://` (TLS). Salas gravadas no Redis com TTL de 24 h renovado a cada alteração. |
| `LOG_LEVEL` (opcional) | `debug`, `info` (padrão), `warn` ou `error`. |
| `LOG_FORMAT` (opcional) | `json` (padrão em produção, uma linha por evento) ou `text` (padrão em dev). |
| *(sem `REDIS_URL`)* | Memória do processo, como antes: reiniciar derruba as partidas. |

O `render.yaml` cria um **Key Value** grátis (`syntonize-kv`, 25 MB, mesma região) e passa a URL
interna para o serviço via `fromService`, então o deploy pelo blueprint já sai com persistência.
Num serviço criado antes desta mudança, rode o blueprint de novo (ou crie o Key Value à mão e
defina `REDIS_URL` com a "Internal Key Value URL"). O Key Value grátis não grava em disco: se ele
próprio reiniciar, as salas somem, mas os reinícios do serviço web (os comuns) estão cobertos.

Para testar localmente: `redis-server &` e `REDIS_URL=redis://localhost:6379 npm run dev`; crie uma
sala, derrube o servidor no meio da rodada e suba de novo.

## Música de fundo

Um loop lo-fi toca baixinho em todas as telas, pelo Web Audio (loop sem
engasgo, diferente da tag `<audio loop>`). O botão de nota musical no
cabeçalho liga, desliga e ajusta o volume; a escolha fica no navegador. Por
causa da política de autoplay, a música começa no primeiro toque na tela.

O arquivo é `public/audio/ambient-loop.mp3` (108 s, 32 compassos a 71 BPM,
emenda com crossfade de 50 ms). Para trocar a faixa, substitua o arquivo por
outro loop que comece e termine no mesmo ponto do compasso, sem fade.

## Testes e checagens

```bash
npm test           # casos de uso do servidor (node:test, relógio falso, sem rede)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run e2e        # teste de fluxo com prints (Playwright), veja abaixo
```

### Teste de fluxo com prints

`npm run e2e` sobe o servidor de verdade e joga uma partida com dois navegadores
(criar sala, entrar pelo convite, dica, palpite arrastando o dial, revelação e
rodada 2), no desktop e no celular, nos temas escuro e claro. Cada tela vira um
print em `e2e/prints/` (galeria em `e2e/prints/index.html`). Na CI os prints
ficam no artefato **prints-do-fluxo** de cada execução. Detalhes em
[`e2e/README.md`](./e2e/README.md).

## Como o jogo funciona

1. O anfitrião cria a sala, ajusta as regras e compartilha o código ou o link.
2. A cada rodada, um jogador vira o Vidente e vê o alvo no dial. Os outros veem o dial coberto.
3. O Vidente escreve uma dica (não pode usar as palavras da carta).
4. Os outros arrastam o ponteiro e travam o palpite antes do tempo acabar.
5. Revelação: a cunha aparece com todos os ponteiros. Centro vale 4, do lado 3, na borda 2.
   Quem chegou mais perto ganha +1. O Vidente ganha a média dos pontos de quem palpitou.
6. Ganha quem bater a meta de pontos (ou quem tiver mais ao fim do limite de rodadas).

### Modo em equipes

O anfitrião pode trocar o modo para **Em equipes** no lobby (mínimo de 2 jogadores por time).

1. Os times se alternam; o Vidente é sempre do time da vez e roda entre os membros do time.
2. O time inteiro gira **o mesmo ponteiro** em tempo real (o outro time não vê) e qualquer um trava o palpite do time.
3. O time adversário chuta se o alvo está **à esquerda ou à direita** do ponteiro: acertar vale 1 ponto.
4. O time da vez pontua pela cunha (4/3/2). Meta padrão: 10 pontos; empate na meta continua até alguém passar.
5. **Revanche no 4** (opcional, ligada por padrão): o time que acerta na mosca e continua atrás no placar joga de novo.

### Cartas e pacotes

O anfitrião escolhe no lobby o **idioma das cartas** (português, inglês ou espanhol, valendo para a sala toda,
independente do idioma da interface de cada um) e quais **pacotes** entram no baralho:

| Pacote | Cartas | Tema |
|---|---|---|
| Clássico | 142 | o baralho original: opinião, coisas, situações, natureza |
| Alimentos | 44 | do boteco ao restaurante chique |
| Cultura pop | 44 | filmes, séries, música, jogos e memes |
| Pessoas | 44 | manias, amizades e comportamento |
| Picante (18+) | 44 | paquera, encontros e noitadas, sem conteúdo explícito ou ofensivo |

As cartas não se repetem até o baralho escolhido acabar. Os textos ficam em `shared/cards/<idioma>.ts`, com os
mesmos ids e pacotes nos três idiomas (`tests/cards.test.ts` confere).

O anfitrião também pode escrever **cartas personalizadas** no lobby: um par por linha, separado por `|`
(`Quente | Frio`), até 50 pares com 2 a 24 caracteres por lado. Elas entram no sorteio junto com os pacotes
ligados, valem a mesma regra da dica e permitem desligar todos os pacotes quando há pelo menos 5 delas
(a sala precisa de um pacote ligado **ou** 5 personalizadas). Os convidados veem só quantas são, para não
estragar a surpresa; cada carta só aparece quando é sorteada. A lista fica salva no navegador do anfitrião
("usar as da última vez" numa sala nova) e "copiar lista" gera o texto para colar em outra sala.

### Chat

Todo mundo na sala pode conversar (texto de até 200 caracteres) e mandar reações rápidas
(🔥 😂 🤔 👏 😱 ❤️), no lobby, na partida e nos resultados.

- **O Vidente só manda reações enquanto a rodada dele está aberta** (da carta até a revelação,
  incluindo a fase de esquerda/direita no modo em equipes), para não dar a dica pelo chat.
- Limite de 5 mensagens a cada 10 segundos por jogador.
- A sala guarda as últimas 50 mensagens. O histórico **não** viaja no `room:state` (seria
  reenviado a cada mudança de estado): o servidor manda `chat:history` junto com o estado no
  join, na reconexão e no `game:requestState`; depois cada mensagem chega em `chat:message`.
- Mensagens de sistema vão como código + parâmetros (`joined`, `left`, `kicked`,
  `round_revealed` com o número da rodada, `game_finished`) e o cliente escreve o texto.
  A revelação nunca inclui a posição do alvo.

### Histórico da partida

O botão **Histórico** na barra da rodada (e **Ver rodadas** nos resultados) abre um painel com
as rodadas da mais recente para a mais antiga: carta, dica, Vidente, um mini dial com a cunha e os
palpites, os pontos de cada um (ou de cada time, com o chute de esquerda/direita) e as rodadas
puladas com o motivo. No desktop o painel desliza da direita; no celular é uma folha de baixo.

- Só rodadas **já reveladas** entram em `roundHistory`, então o histórico nunca leva o alvo nem os
  palpites da rodada em jogo. Cada rodada guarda um `roster` (apelido, cor e time de quem participou)
  para continuar nomeando quem saiu da sala.
- Rodadas puladas antes da dica (anfitrião, tempo da dica, Vidente que saiu/foi removido/caiu) ficam
  em `skippedRounds` (últimas 30), sem alvo. Elas continuam não contando no número da rodada.
- Como o chat, o histórico **não** viaja no `room:state`: vai em `game:history` no join, na
  reconexão, no `game:requestState` e quando muda (revelação, rodada pulada, início e volta ao
  lobby). O `useGameState` junta de volta em `room.roundHistory` / `room.skippedRounds`.

## Idiomas

A interface está em português (padrão), inglês e espanhol (`src/i18n/`). Na primeira visita o
idioma vem do navegador; depois, do seletor no cabeçalho. O servidor nunca manda texto pronto:
erros e avisos são códigos (`MESSAGE_CODES` em `shared/types.ts`) traduzidos no cliente. Para
adicionar um texto, crie a chave em `src/i18n/pt-BR.ts` e o typecheck aponta onde faltar em
`en.ts` e `es.ts`.

## Estrutura

```
shared/     tipos, baralho de cartas (cards/<idioma>.ts) e regras puras (usados pelo cliente e pelo servidor)
server/     roomManager.ts (orquestração testável), roomStore.ts/redisStore.ts (persistência) e index.ts (Next + Socket.io)
src/        app Next: páginas, componentes (Dial, Lobby, Game, Results, ui) e hooks
tests/      casos de uso do RoomManager com relógio e transporte falsos
```

A lista completa de melhorias feitas e do que ainda dá para fazer está em
[MELHORIAS.md](./MELHORIAS.md).
