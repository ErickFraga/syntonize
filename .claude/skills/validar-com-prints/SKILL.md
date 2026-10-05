---
name: validar-com-prints
description: Roda o teste de fluxo do Syntonize (Playwright, dois navegadores jogando uma partida) e confere os prints de cada tela. Use antes de abrir ou atualizar uma PR que mexe em tela, estilo, socket ou regra de jogo, e quando pedirem para validar com print.
---

# Validar com prints

1. Instale as dependências se faltar: `npm ci`. No ambiente de nuvem o Chromium
   já está em `/opt/pw-browsers`; nunca rode `playwright install` lá. Fora dele,
   `npx playwright install chromium` uma vez.
2. Gere o build (o teste usa o servidor de produção quando ele existe):
   `SITE_URL=https://syntonize.example.com npm run build`.
3. Rode `npm run e2e` (4 cenários, cerca de 1 minuto). Para iterar rápido,
   `npm run e2e:desktop`.
4. **Olhe os prints** em `e2e/prints/<projeto>/` com a ferramenta de leitura de
   imagens, pelo menos as telas que a mudança afeta, no desktop e no mobile.
   Confira texto cortado, sobreposição, contraste no tema claro e se o que a
   mudança promete aparece de fato. Teste verde não basta: o print é a prova.
5. Se a mudança cria uma tela ou estado novo, acrescente o passo em
   `e2e/partida.spec.ts` (ou um spec novo) com `print('nome')`.
6. Ao entregar, diga quais prints conferiu e o que viu; anexe os mais
   relevantes quando a ferramenta de resposta permitir. Na PR, cite que a CI
   publica tudo no artefato **prints-do-fluxo**.

Se o teste falhar por erro de console ou rolagem horizontal, trate como bug da
mudança (ou bug existente que o teste pegou), não como teste frágil. Nunca
desligue a checagem para passar.

Detalhes do harness: `e2e/README.md`.
