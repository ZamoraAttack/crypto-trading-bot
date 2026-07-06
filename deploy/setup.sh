#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Crypto Bot — VPS setup script
# Run once on: ssh youruser@your-server-ip
# Usage: bash deploy/setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJ_DIR="/home/youruser/crypto-bot"
VENV_DIR="$PROJ_DIR/venv"
SYSTEMD_DIR="/etc/systemd/system"

echo "=== 1. System packages ==="
sudo apt-get update -q
sudo apt-get install -y python3.11 python3.11-venv python3-pip nginx nodejs npm

echo "=== 2. Project directories ==="
mkdir -p "$PROJ_DIR/data" "$PROJ_DIR/logs"

echo "=== 3. Python venv ==="
python3.11 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r "$PROJ_DIR/backend/requirements.txt"

echo "=== 4. .env file ==="
if [ ! -f "$PROJ_DIR/.env" ]; then
    cp "$PROJ_DIR/.env.example" "$PROJ_DIR/.env"
    echo ">>> IMPORTANT: edit $PROJ_DIR/.env and fill in your secrets before starting services <<<"
fi

echo "=== 5. Dashboard npm install + build ==="
cd "$PROJ_DIR/dashboard"
npm install --silent
# Copy env vars needed by Next.js build
export $(grep -v '^#' "$PROJ_DIR/.env" | xargs)
npm run build

echo "=== 6. systemd services ==="
sudo cp "$PROJ_DIR/deploy/crypto-api.service"       "$SYSTEMD_DIR/"
sudo cp "$PROJ_DIR/deploy/crypto-bot.service"       "$SYSTEMD_DIR/"
sudo cp "$PROJ_DIR/deploy/crypto-dashboard.service" "$SYSTEMD_DIR/"
sudo systemctl daemon-reload
sudo systemctl enable crypto-api crypto-bot crypto-dashboard

echo "=== 7. nginx ==="
sudo cp "$PROJ_DIR/deploy/nginx.conf" /etc/nginx/sites-available/bots
sudo ln -sf /etc/nginx/sites-available/bots /etc/nginx/sites-enabled/bots
# Disable default site if it conflicts
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "========================================================="
echo " Setup complete."
echo " 1. Edit $PROJ_DIR/.env with your API keys + secrets"
echo " 2. sudo systemctl start crypto-api"
echo " 3. sudo systemctl start crypto-dashboard"
echo " 4. sudo systemctl start crypto-bot  (paper mode first!)"
echo " 5. Dashboard: http://your-server-ip"
echo "========================================================="
