#!/bin/bash
# 실행하기.command로 띄운 수능 단어 서버(포트 5180)를 끈다.

cd "$(dirname "$0")" || exit 1
APP_DIR="$(pwd -P)"
PORT=5180

PID=$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1)
if [ -z "$PID" ]; then
  echo "실행 중인 서버가 없습니다."
else
  DIR=$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
  if [ "$DIR" = "$APP_DIR" ]; then
    kill "$PID" && echo "서버(PID $PID)를 종료했습니다. 단어 데이터는 그대로 남아 있습니다."
  else
    echo "포트 $PORT 는 다른 프로그램(PID $PID)이 사용 중이라 건드리지 않았습니다."
  fi
fi
echo "(이 창을 닫으려면 아무 키나 누르세요)"
read -n 1 -s -r
