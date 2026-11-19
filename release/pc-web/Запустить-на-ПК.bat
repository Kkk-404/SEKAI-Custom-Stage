@echo off
chcp 65001 >nul
title SEKAI: Custom Stage (PC)
cd /d "%~dp0"

echo Запускаю SEKAI: Custom Stage на http://127.0.0.1:4173/ ...
start "" "http://127.0.0.1:4173/"

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 4173 --bind 127.0.0.1
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server 4173 --bind 127.0.0.1
  goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
  npx --yes serve -l 4173 .
  goto :eof
)

echo Не найден Python или Node.js для локального веб-сервера.
echo Установите Python (https://python.org) или запустите папку через любой статический сервер.
pause
