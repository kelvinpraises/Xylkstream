#!/bin/bash
set -e

SERVER="root@95.179.148.19"

echo "→ copying .env..."
scp apps/server/.env $SERVER:/app/.env

echo "→ pushing to server..."
ssh $SERVER "
  cd /app/xylkstream 2>/dev/null || git clone https://github.com/kelvinpraises/xylkstream /app/xylkstream && cd /app/xylkstream
  git pull
  docker build -t xylkstream .
  docker stop xylkstream 2>/dev/null || true
  docker rm xylkstream 2>/dev/null || true
  docker run -d --name xylkstream --restart unless-stopped -p 4848:4848 -p 3000:3000 --env-file /app/.env xylkstream
  echo '✓ deployed'
  docker logs --tail 20 xylkstream
"
