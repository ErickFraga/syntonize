#!/bin/bash
# Renders every screen in main.ts to static HTML (Bun + a tiny React shim, no node_modules needed)
# and screenshots them with the Playwright Chromium at 1280px and 390px.
# Usage: tools/preview/shoot.sh [screen ...]
cd "$(dirname "$0")"
bun --preload ./plugin.ts --tsconfig-override ./tsconfig.json main.ts 2>&1 | grep -v "Internal error"
cd out
CHROME=${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
for f in ${@:-home join lobby lobby-guest game-seer-clue game-guesser-wait game-guessing game-seer-guessing game-revealed results lobby-teams team-guessing team-opponent-wait team-side-guess team-revealed team-results home-en lobby-en lobby-teams-en game-revealed-en lobby-guest-es team-side-guess-es results-es}; do
  timeout 60 "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --screenshot="$f-desktop.png" --window-size=1280,1700 "file://$PWD/$f.html" >/dev/null 2>&1
  printf '<!doctype html><html><body style="margin:0;background:#000"><iframe src="%s.html" width="390" height="2300" style="border:0;display:block"></iframe></body></html>' "$f" > "$f-mobile-frame.html"
  timeout 60 "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --screenshot="$f-mobile.png" --window-size=600,2300 "file://$PWD/$f-mobile-frame.html" >/dev/null 2>&1
done
echo "done: $(ls *.png | wc -l) screenshots in tools/preview/out"
