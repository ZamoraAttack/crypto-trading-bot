# Private Ops Notes — Crypto Trading Bot

Not for public repo. Real infra details for disaster recovery only.
Actual secrets (API keys, passwords, tokens) are NOT here — see Bitwarden.

## Env vars in use (backend/.env) — names only, values in Bitwarden
LUNARCRUSH_API_KEY, COINBASE_KEY_FILE, COINBASE_API_KEY, COINBASE_API_SECRET,
DASHBOARD_USERNAME, DASHBOARD_PASSWORD, DASHBOARD_JWT_SECRET, INTERNAL_API_KEY,
TELEGRAM_TOKEN

## Deploy
- VPS host/user: same VPS as Polymarket bot (see polymarket-bot-private notes)
- Service: crypto-api.service (systemctl)
