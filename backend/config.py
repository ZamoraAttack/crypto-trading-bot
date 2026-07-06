import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


# ─── Asset Universe ────────────────────────────────────────────────────────────

# Maps asset symbol → Coinbase product ID (None = not listed on Coinbase)
COINBASE_PRODUCTS: dict[str, str | None] = {
    # Tier 1
    "XRP":  "XRP-USD",
    "XLM":  "XLM-USD",
    "XDC":  None,         # Not on Coinbase Advanced; skipped at execution
    "QNT":  "QNT-USD",
    "HBAR": "HBAR-USD",
    "SHX":  None,         # Stronghold — not on Coinbase Advanced; skipped at execution
    # Tier 2 (representative; extend as needed)
    "ETH":  "ETH-USD",
    "SOL":  "SOL-USD",
    "POL":  "POL-USD",
    "AVAX": "AVAX-USD",
    "DOT":  "DOT-USD",
    "LINK": "LINK-USD",
    "ADA":  "ADA-USD",
}

TIER_1_ASSETS: set[str] = {"XRP", "XLM", "XDC", "QNT", "HBAR", "SHX"}

TIER_2_ASSETS: set[str] = {"ETH", "SOL", "POL", "AVAX", "DOT", "LINK", "ADA"}

# Tier 3: everything else that appears in LunarCrush top-50 not in T1/T2


def get_asset_tier(symbol: str) -> int:
    if symbol in TIER_1_ASSETS:
        return 1
    if symbol in TIER_2_ASSETS:
        return 2
    return 3


# ─── Scoring Weights ───────────────────────────────────────────────────────────

WEIGHT_SOCIAL   = 0.35
WEIGHT_VOLUME   = 0.35
WEIGHT_PRICE    = 0.30

TIER_1_MULTIPLIER = 1.20
TIER_2_MULTIPLIER = 1.00
TIER_3_MULTIPLIER = 0.80

TIER_MULTIPLIERS = {1: TIER_1_MULTIPLIER, 2: TIER_2_MULTIPLIER, 3: TIER_3_MULTIPLIER}

# Tier 3 requires a higher raw score before the multiplier penalty to be considered
TIER_3_MIN_RAW_SCORE = 80.0


# ─── Risk Defaults ─────────────────────────────────────────────────────────────

DEFAULT_STOP_LOSS_PCT   = 0.04   # 4% below entry
DEFAULT_TAKE_PROFIT_RR  = 2.0    # 2:1 risk-reward ratio
FEE_PCT                 = 0.006  # Coinbase taker fee (0.6%)


# ─── LunarCrush ────────────────────────────────────────────────────────────────

LUNARCRUSH_BASE_URL   = "https://lunarcrush.com/api4/public"
LUNARCRUSH_CACHE_TTL  = 600   # seconds between refreshes (free tier rate limit)
LUNARCRUSH_TOP_N      = 50    # how many coins to fetch per scan


# ─── Coinbase ──────────────────────────────────────────────────────────────────

COINBASE_BASE_URL = "https://api.coinbase.com/api/v3/brokerage"
COINBASE_CANDLE_GRANULARITY = "ONE_HOUR"  # for technical indicators
COINBASE_CANDLE_LIMIT       = 50          # number of candles to fetch


# ─── Runtime Config (from env) ─────────────────────────────────────────────────

@dataclass
class Config:
    trading_mode:           str   = field(default_factory=lambda: os.getenv("TRADING_MODE", "paper"))
    initial_balance:        float = field(default_factory=lambda: float(os.getenv("INITIAL_BALANCE", "50.0")))
    risk_per_trade_pct:     float = field(default_factory=lambda: float(os.getenv("RISK_PER_TRADE_PCT", "1.0")))
    max_daily_loss_pct:     float = field(default_factory=lambda: float(os.getenv("MAX_DAILY_LOSS_PCT", "5.0")))
    max_open_positions:     int   = field(default_factory=lambda: int(os.getenv("MAX_OPEN_POSITIONS", "3")))
    signal_score_threshold: float = field(default_factory=lambda: float(os.getenv("SIGNAL_SCORE_THRESHOLD", "65.0")))
    scan_interval:          int   = field(default_factory=lambda: int(os.getenv("SCAN_INTERVAL_SECONDS", "45")))

    lunarcrush_api_key:   str = field(default_factory=lambda: os.getenv("LUNARCRUSH_API_KEY", ""))
    coinbase_key_file:    str = field(default_factory=lambda: os.getenv("COINBASE_KEY_FILE", ""))
    coinbase_api_key:     str = field(default_factory=lambda: os.getenv("COINBASE_API_KEY", ""))
    coinbase_api_secret:  str = field(default_factory=lambda: os.getenv("COINBASE_API_SECRET", ""))

    postgres_url:         str = field(default_factory=lambda: os.getenv("POSTGRES_URL", ""))
    database_path:        str = field(default_factory=lambda: os.getenv("DATABASE_PATH", "./data/trading.db"))
    log_path:             str = field(default_factory=lambda: os.getenv("LOG_PATH", "./logs/bot.log"))
    polymarket_data_dir:  str = field(default_factory=lambda: os.getenv("POLYMARKET_DATA_DIR", ""))

    api_host:             str = field(default_factory=lambda: os.getenv("API_HOST", "0.0.0.0"))
    api_port:             int = field(default_factory=lambda: int(os.getenv("API_PORT", "8000")))

    internal_api_key:     str = field(default_factory=lambda: os.getenv("INTERNAL_API_KEY", ""))
    dashboard_username:   str = field(default_factory=lambda: os.getenv("DASHBOARD_USERNAME", "admin"))
    dashboard_password:   str = field(default_factory=lambda: os.getenv("DASHBOARD_PASSWORD", ""))
    dashboard_jwt_secret: str = field(default_factory=lambda: os.getenv("DASHBOARD_JWT_SECRET", ""))

    @property
    def is_live(self) -> bool:
        return self.trading_mode == "live"

    @property
    def social_scoring_enabled(self) -> bool:
        return bool(self.lunarcrush_api_key)

    @property
    def database_url(self) -> str:
        if self.postgres_url:
            url = self.postgres_url
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+asyncpg://", 1)
            elif url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return url
        return f"sqlite+aiosqlite:///{self.database_path}"


cfg = Config()
