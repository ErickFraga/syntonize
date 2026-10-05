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

## Estrutura

```
shared/     tipos, baralho de cartas e regras puras (usados pelo cliente e pelo servidor)
server/     roomManager.ts (orquestração testável) e index.ts (Next + Socket.io)
src/        app Next: páginas, componentes (Dial, Lobby, Game, Results, ui) e hooks
tests/      casos de uso do RoomManager com relógio e transporte falsos
```

A lista completa de melhorias feitas e do que ainda dá para fazer está em
[MELHORIAS.md](./MELHORIAS.md).
