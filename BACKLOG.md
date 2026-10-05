# Backlog do Syntonize

Só o que ainda **não** está feito. O histórico completo (feito, em andamento e
decisões de regra) fica em [MELHORIAS.md](./MELHORIAS.md).

Prioridade: **P1** faz diferença na próxima partida · **P2** deixa o jogo mais
completo · **P3** polimento.

## Na `release`, aguardando a PR para a `main`

PRs #13 (CI e remoção das dependências não usadas), #14 (cartas personalizadas),
#15 (persistência das salas com Redis), #16 (histórico de rodadas) e a de rate limiting
e TTL do token de sessão. Já na `main`
(PRs #2–#6, #8, #10–#12): modo em equipes, internacionalização, cartas em três
idiomas e pacotes temáticos, imagem Open Graph (home e convite, com o nome do
anfitrião e quantos estão na sala), QR code no lobby, chat e reações, animação
da tampa, design "Cozy, versão madura" e o `target` do `tsconfig.json`.

Ao fechar cada PR: CI verde (testes, tipagem, lint e build rodam sozinhos no
GitHub Actions) e conferir o visual das telas novas contra os mocks do canvas.

## P1 — vale fazer antes de divulgar

- [ ] **Validar uma partida real no deploy.** O `next build` agora roda na CI de cada
      PR (PR #13); falta uma partida completa com 3+ celulares no deploy (livre e em equipes).
- [x] **Conferir o visual das telas novas contra o canvas.** Feito: botão Confirmar
      no "esquerda ou direita", Embaralhar times no lobby, pílula de idioma PT·EN·ES
      (o rótulo "Psychic" em inglês já estava nas traduções). O teste de fluxo em equipes
      (`e2e/equipes.spec.ts`) guarda os prints dessas telas.

## P2 — deixa o jogo mais completo

- [ ] **Modo cooperativo.** Como no app oficial: todos no mesmo time, 7 rodadas,
      meta de pontos conjunta. Deriva do modo atual.
- [ ] **Modo espectador.** Entrar na sala só para assistir, fora da rotação de Videntes.
- [ ] **Testes de componente.** Formalizar com Vitest + Testing Library o que o
      `tools/preview` faz hoje (Dial: ângulo e teclado; Game: painéis por fase).

## P3 — polimento

- [ ] **PWA.** Manifesto + ícone para "instalar" no celular.
- [ ] **Métricas.** Os logs já são estruturados (JSON em produção; `LOG_LEVEL` e
      `LOG_FORMAT`); faltam contadores (salas ativas, jogadores, erros) e um endpoint
      de saúde/métricas.
- [ ] **Validar a imagem Docker.** O `Dockerfile` existe, mas ainda não foi
      construído num ambiente com Docker (o build e o start foram simulados sem ele).
