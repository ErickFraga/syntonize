# Syntonize

Versão online do SINTONIA / Wavelength. Next.js 14 + Socket.io num processo só
(`server/index.ts`); regras em `shared/gameLogic.ts`, engine em
`server/roomManager.ts`. Tudo em português: código comentado, commits e PRs.

## Fluxo de branches

- Melhorias: PR contra a `release`; no fim, PR `release` → `main`.
- Bugs: PR direto na `main`.

## Antes de entregar uma mudança

- `npm test`, `npm run typecheck:server`, `npm run lint`, `npm run build`,
  `npm run typecheck` (o mesmo que a CI).
- Mexeu em tela, estilo, socket ou regra: rode o teste de fluxo e **olhe os
  prints** (skill `validar-com-prints`, ou `e2e/README.md`). A CI roda o mesmo
  teste e publica os prints no artefato `prints-do-fluxo`.
- O palpite é sempre arrastando o dial (nunca um slider); o teste confere isso.

## Docs

`MELHORIAS.md` é o histórico (✅ na main, 🔄 em PR, ⬜ backlog) e `BACKLOG.md`
só o que falta. Atualize os dois quando entregar algo da lista.
