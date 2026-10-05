# Backlog do Syntonize

Só o que ainda **não** está feito. O histórico completo (feito, em andamento e
decisões de regra) fica em [MELHORIAS.md](./MELHORIAS.md).

Prioridade: **P1** faz diferença na próxima partida · **P2** deixa o jogo mais
completo · **P3** polimento.

## Em andamento (PRs abertas da sessão de features)

| PR | Item | Estado |
|---|---|---|
| #3 | Modo em equipes + internacionalização (pt-BR, en, es) | aberta, base `claude/jolly-davinci-t8tq4h`; precisa de rebase na `main` |
| #2 | Animação da tampa do dial abrindo na revelação | aberta, encadeada na #3 |
| #4 | Imagem Open Graph (home e convite) + endpoint público da sala | aberta, encadeada na #3 |
| #5 | QR code do convite no lobby | aberta, encadeada na #3 |
| #6 | Chat e reações na partida | aberta, encadeada na #3 |
| — | Cartas em outros idiomas e pacotes temáticos (clássico, comida, cultura pop, pessoas, adulto) | em desenvolvimento, ainda sem PR |

Ao fechar essas PRs: consolidar tudo numa PR única para a `main`, rodar `npm test`,
`npm run typecheck`, `npm run typecheck:server` e conferir o visual das telas novas
contra os mocks do canvas (lobby em equipes, "esquerda ou direita", chat mobile).

## P1 — vale fazer antes de divulgar

- [ ] **Persistência das salas.** Tudo vive em memória: reiniciar o servidor (ou o
      Render dormir) derruba todas as partidas. Redis ou SQLite com os `Room`
      serializados; depois disso dá para rodar mais de uma instância.
- [ ] **CI no GitHub Actions.** Rodar `npm test`, `npm run typecheck`,
      `npm run typecheck:server`, `npm run lint` e `npm run build` em toda PR. O build
      do Next só quebrou no deploy porque ninguém o rodava antes.
- [ ] **Remover dependências não usadas.** `lucide-react`, `nanoid`, `uuid`,
      `@types/uuid` e `ts-node` não são importados em lugar nenhum. Precisa de
      `npm install` com acesso ao registro para regenerar o `package-lock.json`.
- [ ] **Validar o build e uma partida real no deploy.** O `next build` nunca rodou
      nos ambientes de nuvem (registro npm bloqueado); o Render é o teste de verdade.

## P2 — deixa o jogo mais completo

- [ ] **Modo cooperativo.** Como no app oficial: todos no mesmo time, 7 rodadas,
      meta de pontos conjunta. Deriva do modo atual.
- [ ] **Histórico de rodadas na partida.** Já guardamos `roundHistory`; falta um
      painel com cartas, dicas e resultados de todas as rodadas.
- [ ] **Modo espectador.** Entrar na sala só para assistir, fora da rotação de Videntes.
- [ ] **Rate limiting.** Nada impede criar milhares de salas ou spammar `room:join`.
      Limitar por IP/socket.
- [ ] **Expiração de token de sessão.** Hoje o token vive até a sala morrer; com
      persistência, dar TTL.
- [ ] **Testes de componente.** Formalizar com Vitest + Testing Library o que o
      `tools/preview` faz hoje (Dial: ângulo e teclado; Game: painéis por fase).
- [ ] **Teste ponta a ponta.** Playwright com 3 navegadores jogando uma rodada
      completa (criar, entrar, dica, palpites, revelação).

## P3 — polimento

- [ ] **Cartas personalizadas.** O anfitrião digita pares próprios para a partida.
- [ ] **PWA.** Manifesto + ícone para "instalar" no celular.
- [ ] **Logs estruturados e métricas.** Hoje é `console.log`.
- [ ] **Dockerfile.** Para Cloud Run, VM da Oracle ou qualquer host com container.
- [ ] **Imagem Open Graph dinâmica por sala** com o nome do anfitrião (a PR #4 cobre a
      home e o convite; conferir se o endpoint cobre esse caso).
