#!/bin/bash
# 수능 단어 앱(https://aesvinuh.github.io/suneung-vocab/)을 크롬 '앱 창'으로 연다.
# 서버를 띄우지 않으므로 끄는 과정이 필요 없다. 데이터는 GitHub 동기화로 폰과 맞춰진다.
# Dock에서 쓰려면 ~/Applications/수능 단어.app 을 쓰면 된다 (README 참고).

URL="https://aesvinuh.github.io/suneung-vocab/"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ -x "$CHROME" ]; then
  "$CHROME" --app="$URL" >/dev/null 2>&1 &
else
  open "$URL"
fi

# 터미널 창이 남지 않도록 바로 닫기
osascript -e 'tell application "Terminal" to close (every window whose name contains "실행하기")' >/dev/null 2>&1 &
exit 0
