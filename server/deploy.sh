#!/bin/bash
set -e

echo "=== nexEvent VPS Deploy ==="
cd /var/www/nexevent/server

echo "[1/5] git pull..."
git pull origin main

echo "[2/5] npm install..."
npm install

echo "[3/5] npx prisma generate..."
npx prisma generate

echo "[4/5] npx prisma db push..."
npx prisma db push --accept-data-loss

echo "[5/5] pm2 restart..."
pm2 restart nexevent-api
pm2 save

echo "=== Deploy selesai ==="
pm2 status
