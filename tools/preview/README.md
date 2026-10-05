# Preview estático (sem node_modules)

Renderiza os componentes React do app para HTML estático usando o Bun (transpila TSX
nativamente) e um React mínimo em `shims/`, e tira screenshots com o Chromium do
Playwright. Serve para conferir o visual quando não dá para instalar dependências
(registro npm bloqueado nos ambientes de nuvem).

```bash
tools/preview/shoot.sh                 # todas as telas
tools/preview/shoot.sh game-revealed   # só uma
```

Saída em `tools/preview/out/*.png` (desktop 1280px e mobile 390px). As telas e os
dados de exemplo ficam em `main.ts`. Hooks viram no-ops: cada tela é um estado fixo.

Para checar tipos do cliente sem `@types/react`, use os shims em
`tools/preview/types/` com `tsc -p tools/preview/tsconfig.typecheck.json`.
