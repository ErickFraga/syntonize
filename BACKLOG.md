# Backlog do Syntonize

Só o que ainda **não** está feito. O histórico completo (feito, em andamento e
decisões de regra) fica em [MELHORIAS.md](./MELHORIAS.md).

Prioridade: **P1** faz diferença na próxima partida · **P2** deixa o jogo mais
completo · **P3** polimento.

## Em andamento (sessões paralelas, uma branch e uma PR por item)

| Branch | Item | Prioridade |
|---|---|---|
| `claude/feature-persistencia` | Persistência das salas (sobreviver a reinício/sono do Render) | P1 |
| `claude/feature-ci` | CI no GitHub Actions + remoção das dependências não usadas | P1 |
| `claude/feature-historico-rodadas` | Histórico de rodadas na partida | P2 |

Já na `main` (PRs #2–#6, #8, #10, #11): modo em equipes, internacionalização,
cartas em três idiomas e pacotes temáticos, imagem Open Graph (home e convite,
com o nome do anfitrião e quantos estão na sala), QR code no lobby, chat e
reações, animação da tampa, design "Cozy, versão madura". A PR #12 corrige o
`target` do `tsconfig.json` para o `next build` passar no Render.

Ao fechar cada PR: rodar `npm test`, `npm run typecheck`, `npm run typecheck:server`
e conferir o visual das telas novas contra os mocks do canvas.

## P1 — vale fazer antes de divulgar

- [ ] **Validar o build e uma partida real no deploy.** O `next build` nunca rodou
      nos ambientes de nuvem (registro npm bloqueado); o Render é o teste de verdade.
      Falta também uma partida completa com 3+ celulares no deploy (livre e em equipes).
- [ ] **Conferir o visual das telas novas contra o canvas.** Lobby em equipes,
      "esquerda ou direita", chat no celular, QR e Open Graph; aplicar o que ficou de
      fora do design (botão Confirmar, Embaralhar times, pílula de idioma, rótulo
      "Psychic" em inglês).

## P2 — deixa o jogo mais completo

- [ ] **Modo cooperativo.** Como no app oficial: todos no mesmo time, 7 rodadas,
      meta de pontos conjunta. Deriva do modo atual.
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

- [ ] **PWA.** Manifesto + ícone para "instalar" no celular.
- [ ] **Logs estruturados e métricas.** Hoje é `console.log`.
- [ ] **Dockerfile.** Para Cloud Run, VM da Oracle ou qualquer host com container.
