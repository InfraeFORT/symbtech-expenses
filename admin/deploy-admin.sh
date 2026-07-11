#!/usr/bin/env bash
# deploy-admin.sh — build l'appli admin (Vite) et la publie en statique derrière Nginx.
# A lancer depuis le dossier admin/ :  ./deploy-admin.sh
set -e

SERVER="ubuntu@app.e-fort.net"
SSH_KEY="$HOME/.ssh/efort-platform-key.pem"
REMOTE_DIR="/var/www/accounting.symbtech.net"
DOMAIN="accounting.symbtech.net"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo ">> 1. Build (vite) -> dist/"
cd "$HERE"
npm run build

echo ">> 2. Prépare le dossier distant (idempotent) + rsync dist/ -> $SERVER:$REMOTE_DIR"
ssh -i "$SSH_KEY" "$SERVER" "sudo mkdir -p $REMOTE_DIR && sudo chown -R ubuntu:ubuntu $REMOTE_DIR"
rsync -az --delete -e "ssh -i $SSH_KEY" "$HERE/dist/" "$SERVER:$REMOTE_DIR/"

echo ">> 3. Recharge Nginx (si la config est valide)"
ssh -i "$SSH_KEY" "$SERVER" "sudo nginx -t && sudo systemctl reload nginx" || echo "   (Nginx pas encore configuré pour $DOMAIN — voir le runbook one-time)"

echo ">> 4. Test"
curl -s -o /dev/null -w "   https://$DOMAIN/  -> HTTP %{http_code}\n" "https://$DOMAIN/" || true
echo ">> Déploiement admin terminé."
