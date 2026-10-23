#!/bin/bash
# 수능 단어 웹앱을 로컬 서버로 띄우고 브라우저로 여는 실행 스크립트.
# 더블클릭으로 실행 (최초 1회는 터미널에서 `chmod +x 실행하기.command 종료하기.command` 필요).
#
# 빌드된 앱(dist 폴더)을 python3로 띄우므로 Node.js가 없어도 된다.
# Node.js가 설치되어 있고 src를 고쳤다면 실행 전에 자동으로 다시 빌드한다.
#
# 포트는 항상 고정(5180)으로 사용한다. 저장 데이터(IndexedDB)는 오리진(포트)별로
# 따로 저장되기 때문에, 포트가 바뀌면 단어 목록이 비어 보인다.
# 이미 이 앱의 서버가 떠 있으면 새로 띄우지 않고 그 서버를 그대로 연다.

cd "$(dirname "$0")" || exit 1
APP_DIR="$(pwd -P)"

PORT=5180
URL="http://localhost:$PORT/"
LOG="/tmp/suneung-vocab-server.log"

wait_key_and_exit() {
  echo "(이 창을 닫으려면 아무 키나 누르세요)"
  read -n 1 -s -r
  exit "${1:-0}"
}

print_phone_url() {
  local ip
  ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
  if [ -n "$ip" ]; then
    echo "같은 와이파이의 폰에서 열기: http://$ip:$PORT/"
    echo "  (폰의 단어 데이터는 컴퓨터와 따로 저장됩니다. 옮기려면 설정 → 백업 사용)"
  fi
}

EXISTING_PID=$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1)

if [ -n "$EXISTING_PID" ]; then
  EXISTING_DIR=$(lsof -a -p "$EXISTING_PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
  if [ "$EXISTING_DIR" = "$APP_DIR" ]; then
    open "$URL"
    echo "이미 실행 중인 서버(PID $EXISTING_PID)를 사용해 $URL 를 열었습니다."
    print_phone_url
    echo "서버를 끄려면: 종료하기.command 더블클릭 (또는 kill $EXISTING_PID)"
    echo ""
    wait_key_and_exit 0
  fi
  echo "포트 $PORT 를 다른 프로그램(PID $EXISTING_PID)이 사용 중입니다."
  echo "해당 프로그램을 종료한 뒤 다시 실행하세요."
  wait_key_and_exit 1
fi

# Node.js가 있으면: dist가 없거나 소스가 더 최신일 때 다시 빌드
if command -v npm >/dev/null 2>&1; then
  if [ ! -f dist/index.html ] || [ -n "$(find src public index.html package.json vite.config.js -newer dist/index.html 2>/dev/null | head -n 1)" ]; then
    echo "소스가 바뀌어 다시 빌드합니다..."
    [ -d node_modules ] || npm install --no-audit --no-fund || { echo "npm install 실패"; wait_key_and_exit 1; }
    npm run build || { echo "빌드 실패. 위 오류를 확인하세요."; wait_key_and_exit 1; }
  fi
fi

if [ ! -f dist/index.html ]; then
  echo "빌드된 앱(dist 폴더)이 없습니다."
  echo "Node.js(https://nodejs.org)를 설치한 뒤 다시 실행하면 자동으로 빌드합니다."
  wait_key_and_exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3가 없습니다. 터미널에서 'xcode-select --install'로 설치한 뒤 다시 실행하세요."
  wait_key_and_exit 1
fi

echo "수능 단어: 포트 $PORT 에서 로컬 서버를 시작합니다..."
python3 -m http.server "$PORT" --directory dist >"$LOG" 2>&1 &
SERVER_PID=$!

sleep 1.5

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "서버 시작에 실패했습니다. 로그를 확인하세요: $LOG"
  wait_key_and_exit 1
fi

open "$URL"

echo ""
echo "브라우저에서 $URL 를 열었습니다."
print_phone_url
echo "이 창을 닫아도 서버는 백그라운드에서 계속 실행됩니다."
echo "서버를 끄려면: 종료하기.command 더블클릭 (또는 kill $SERVER_PID)"
echo ""
wait_key_and_exit 0
