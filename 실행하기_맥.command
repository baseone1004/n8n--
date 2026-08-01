#!/bin/bash
cd "$(dirname "$0")"
echo "옛이야기 스튜디오 - 로컬 서버로 여는 중... (이 창은 켜 두세요)"
( sleep 1; open "http://localhost:8000/index.html" ) &
python3 -m http.server 8000 || python -m http.server 8000
