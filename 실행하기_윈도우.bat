@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   옛이야기 스튜디오 - 로컬 서버로 열기
echo   (수익/분석 구글 로그인을 쓰려면 이 방법 필요)
echo ================================================
echo.
echo 브라우저가 자동으로 열립니다. 이 검은 창은 켜 두세요.
echo 끝내려면 이 창을 닫으면 됩니다.
echo.
start "" http://localhost:8000/index.html
python -m http.server 8000 2>nul || py -m http.server 8000 2>nul || (
  echo.
  echo [안내] Python이 설치되어 있지 않습니다.
  echo  1^) https://www.python.org/downloads 에서 설치 후 다시 실행하거나
  echo  2^) 수익/분석이 필요없으면 그냥 index.html 을 더블클릭하세요.
  echo.
  pause
)
