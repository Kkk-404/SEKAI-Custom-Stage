#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT=4173
URL="http://127.0.0.1:${PORT}/"
echo "Запускаю SEKAI: Custom Stage на ${URL} ..."
(sleep 1 && (xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || true)) &
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
else
  echo "Нужен python3 или npx для запуска локального сервера."
  exit 1
fi
