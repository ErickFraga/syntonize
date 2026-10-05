# Música de fundo

Coloque aqui o loop da música de fundo como `ambient-loop.mp3` (ou troque o
caminho em `MUSIC_SRC`, em `src/lib/music.ts`). O arquivo é servido em
`/audio/ambient-loop.mp3` e tocado em loop contínuo pelo Web Audio, então ele
deve começar e terminar no mesmo ponto do compasso, sem fade-in nem fade-out.

Enquanto o arquivo não existir, o botão de música some do cabeçalho.
