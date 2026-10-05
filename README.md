# Syntonize

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
  acordar no primeiro acesso. As salas ficam em memória, então somem quando
  ele dorme (só acontece quando não há partida rolando).
- Mantenha **uma única instância**: duas instâncias teriam salas diferentes.
- A porta vem da variável `PORT`, que o Render define sozinho.

## Testes e checagens

```bash
npm test           # casos de uso do servidor (node:test, relógio falso, sem rede)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

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
## Idiomas

A interface está em português (padrão), inglês e espanhol (`src/i18n/`). Na primeira visita o
idioma vem do navegador; depois, do seletor no cabeçalho. O servidor nunca manda texto pronto:
erros e avisos são códigos (`MESSAGE_CODES` em `shared/types.ts`) traduzidos no cliente. Para
adicionar um texto, crie a chave em `src/i18n/pt-BR.ts` e o typecheck aponta onde faltar em
`en.ts` e `es.ts`.

## Estrutura

```
shared/     tipos, baralho de cartas e regras puras (usados pelo cliente e pelo servidor)
server/     roomManager.ts (orquestração testável) e index.ts (Next + Socket.io)
src/        app Next: páginas, componentes (Dial, Lobby, Game, Results, ui) e hooks
tests/      casos de uso do RoomManager com relógio e transporte falsos
```

A lista completa de melhorias feitas e do que ainda dá para fazer está em
[MELHORIAS.md](./MELHORIAS.md).
