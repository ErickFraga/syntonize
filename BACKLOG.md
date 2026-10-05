# Backlog do Syntonize

Só o que ainda **não** está feito. O histórico completo (feito, em andamento e
decisões de regra) fica em [MELHORIAS.md](./MELHORIAS.md).

Prioridade: **P1** faz diferença na próxima partida · **P2** deixa o jogo mais
completo · **P3** polimento.

## Na `release`, aguardando a PR para a `main`

PRs #13 (CI e remoção das dependências não usadas), #14 (cartas personalizadas),
#15 (persistência das salas com Redis) e #16 (histórico de rodadas). Já na `main`
(PRs #2–#6, #8, #10–#12): modo em equipes, internacionalização, cartas em três
idiomas e pacotes temáticos, imagem Open Graph (home e convite, com o nome do
anfitrião e quantos estão na sala), QR code no lobby, chat e reações, animação
da tampa, design "Cozy, versão madura" e o `target` do `tsconfig.json`.

Ao fechar cada PR: CI verde (testes, tipagem, lint e build rodam sozinhos no
GitHub Actions) e conferir o visual das telas novas contra os mocks do canvas.

## P1 — vale fazer antes de divulgar

- [ ] **Validar uma partida real no deploy.** O `next build` agora roda na CI de cada
      PR (PR #13); falta uma partida completa com 3+ celulares no deploy (livre e em equipes).
- [ ] **Conferir o visual das telas novas contra o canvas.** Lobby em equipes,
      "esquerda ou direita", chat no celular, QR e Open Graph; aplicar o que ficou de
      fora do design (botão Confirmar, Embaralhar times, pílula de idioma, rótulo
      "Psychic" em inglês).

## P2 — deixa o jogo mais completo

- [ ] **Modo espectador.** Entrar na sala só para assistir, fora da rotação de Videntes.
- [ ] **Rate limiting.** Nada impede criar milhares de salas ou spammar `room:join`.
      Limitar por IP/socket.
- [ ] **Expiração de token de sessão.** Hoje o token vive até a sala morrer; com
      persistência, dar TTL.
- [ ] **Testes de componente.** Formalizar com Vitest + Testing Library o que o
      `tools/preview` faz hoje (Dial: ângulo e teclado; Game: painéis por fase).

## P3 — polimento

- [ ] **PWA.** Manifesto + ícone para "instalar" no celular.
- [ ] **Logs estruturados e métricas.** Hoje é `console.log`.
- [ ] **Dockerfile.** Para Cloud Run, VM da Oracle ou qualquer host com container.
