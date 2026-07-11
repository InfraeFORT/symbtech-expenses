#!/usr/bin/env bash
# deploy.sh — déploiement du backend symbtech-expenses sur l'EC2 (même box qu'e-FORT,
# mais process/port/vhost/domaine distincts). Pas de git : rsync direct, comme e-FORT.
set -e

# --- Paramètres (ajuste SERVER/DOMAIN à ta config) ---
SERVER="${SERVER:-ubuntu@app.e-fort.net}"          # même box EC2 ; mets l'IP ou ton alias SSH si besoin
SSH_KEY="${SSH_KEY:-$HOME/.ssh/efort-platform-key.pem}"  # même clé que le déploiement e-FORT
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/symbtech-expenses}"
PM2_NAME="${PM2_NAME:-symbtech-expenses}"
DOMAIN="${DOMAIN:-expenses.symbtech.net}"          # sous-domaine neutre (à confirmer)
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"         # le dossier backend/

SSH="ssh -i $SSH_KEY"

echo ">> 1. rsync  $LOCAL_DIR  ->  $SERVER:$REMOTE_DIR"
# On NE pousse PAS .env (le serveur garde le sien), ni node_modules/backups.
rsync -az -e "$SSH" \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '*.bak.*' \
  --exclude '.git' \
  "$LOCAL_DIR"/ "$SERVER:$REMOTE_DIR"/

echo ">> 2. npm install (prod) + (re)start pm2  [cwd = $REMOTE_DIR pour dotenv]"
$SSH "$SERVER" "cd $REMOTE_DIR && npm install --omit=dev && (pm2 restart $PM2_NAME || pm2 start server.js --name $PM2_NAME) && pm2 save"

echo ">> 3. test /health via le domaine"
curl -s -o /dev/null -w 'HTTP %{http_code}\n' "https://$DOMAIN/health" || echo "(domaine pas encore prêt — voir runbook Nginx/Cloudflare)"

echo ">> Déploiement terminé."
