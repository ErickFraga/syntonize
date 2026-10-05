# Teste de fluxo com prints

Playwright jogando uma partida real: o servidor sobe de verdade (Next + Socket.io,
sem Redis) e dois navegadores, cada um com seu `localStorage`, fazem o papel de
dois jogadores.

```bash
npm run e2e                 # os 4 cenários
npm run e2e:desktop         # só o desktop escuro (mais rápido)
npx playwright test --project=mobile-claro
```

O fluxo (`partida.spec.ts`): home → Ana cria a sala → Bia entra pelo link de
convite → lobby dos dois lados → começa → Vidente pensa na dica / palpiteiro
espera → dica enviada → palpite **arrastando o dial** (o teste confere que o
ponteiro acompanhou) → trava → revelação → os dois ficam prontos → rodada 2.

## Cenários

| Projeto | Tela | Tema |
|---|---|---|
| `desktop` | 1280 × 800 | Noturno |
| `mobile` | 390 × 844, toque | Noturno |
| `desktop-claro` | 1280 × 800 | Claro |
| `mobile-claro` | 390 × 844, toque | Claro |

## O que faz o teste falhar

- Qualquer passo do fluxo que não acontece (botão, texto ou tela que não aparece).
- Erro de JavaScript ou `console.error` em qualquer um dos navegadores.
- Tela que rola na horizontal no momento do print (pegou o cabeçalho da sala
  vazando no celular na primeira rodada).

## Prints

Cada `print('nome')` do teste salva `e2e/prints/<projeto>/NN-nome.png` (página
inteira, animações paradas) e anexa a imagem ao relatório. No fim,
`gallery.ts` monta `e2e/prints/index.html` com todos os prints lado a lado.
O relatório do Playwright fica em `e2e/report/` e, quando algo falha, o trace em
`e2e/test-results/` (`npx playwright show-trace <arquivo>`).

Na CI os três diretórios sobem no artefato **prints-do-fluxo** (14 dias).

Os prints não são comparados pixel a pixel com uma referência: servem para
alguém (ou o Claude) olhar as telas de cada mudança. Comparação automática
quebraria a cada ajuste de visual e com fonte diferente entre máquinas.

## Servidor

O `playwright.config.ts` sobe o servidor na porta `3100`: `npm start` se já
existe build (`.next/BUILD_ID`), senão `npm run dev`. Fora da CI ele reaproveita
um servidor que já esteja nessa porta. Variáveis:

- `E2E_BASE_URL=https://...` roda contra um servidor já no ar (ex.: o deploy)
  sem subir nada.
- `E2E_SERVER="..."` troca o comando do servidor; `E2E_PORT` troca a porta.
- `CHROMIUM_PATH` usa um Chromium específico.

## Escrevendo um fluxo novo

Use o fixture `newPlayer` de `fixtures.ts` (um navegador por jogador, tema do
projeto aplicado, música desligada) e chame `print()` em cada tela que vale ver.
Seletores pelo que o jogador lê (`getByRole`, `getByLabel`, textos em pt-BR),
sem `data-testid`.
