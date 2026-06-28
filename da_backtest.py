"""
DA Strategy Backtest — Binance Edition
Trendline Break Strategy (RSI + MFI + EMA7/20 + Daily filter)
Timeframes: M1, M5, M15

Run with real Binance data (locally):
  python da_backtest.py BTCUSDT 5m 2024-01-01 2024-06-01
  python da_backtest.py ETHUSDT 15m 2024-01-01 2025-01-01
  python da_backtest.py SOLUSDT 1m  2024-06-01 2024-07-01

Run with synthetic demo data (no internet):
  python da_backtest.py
"""

import sys
import math
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field
from typing import Optional


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA — Binance klines
# ═══════════════════════════════════════════════════════════════════════════════

BINANCE_URL = "https://api.binance.com/api/v3/klines"

INTERVAL_MAP = {
    "1m": "1m", "M1": "1m",
    "5m": "5m", "M5": "5m",
    "15m": "15m", "M15": "15m",
}

DAILY_INTERVAL = "1d"


def _parse_klines(raw: list) -> pd.DataFrame:
    cols = ["Open time", "Open", "High", "Low", "Close", "Volume",
            "Close time", "Quote vol", "Trades", "Taker buy base",
            "Taker buy quote", "Ignore"]
    df = pd.DataFrame(raw, columns=cols)
    df["Open time"] = pd.to_datetime(df["Open time"], unit="ms", utc=True)
    df.set_index("Open time", inplace=True)
    for c in ["Open", "High", "Low", "Close", "Volume"]:
        df[c] = df[c].astype(float)
    return df[["Open", "High", "Low", "Close", "Volume"]]


def fetch_binance(symbol: str, interval: str,
                  start: str, end: str) -> pd.DataFrame:
    """Download klines from Binance in chunks of 1000 bars."""
    iv = INTERVAL_MAP.get(interval, interval)
    start_ms = int(datetime.strptime(start, "%Y-%m-%d")
                   .replace(tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.strptime(end, "%Y-%m-%d")
                 .replace(tzinfo=timezone.utc).timestamp() * 1000)

    frames = []
    cursor = start_ms
    while cursor < end_ms:
        params = dict(symbol=symbol, interval=iv,
                      startTime=cursor, endTime=end_ms, limit=1000)
        resp = requests.get(BINANCE_URL, params=params, timeout=15)
        resp.raise_for_status()
        raw = resp.json()
        if not raw:
            break
        chunk = _parse_klines(raw)
        frames.append(chunk)
        cursor = int(raw[-1][0]) + 1   # next bar's open time

    if not frames:
        raise ValueError(f"No data returned for {symbol} {interval} {start}→{end}")
    return pd.concat(frames)


def make_daily_from_intraday(df: pd.DataFrame) -> pd.DataFrame:
    return df.resample("1D").agg(
        Open=("Open", "first"),
        High=("High", "max"),
        Low=("Low", "min"),
        Close=("Close", "last"),
        Volume=("Volume", "sum"),
    ).dropna()


# ═══════════════════════════════════════════════════════════════════════════════
#  SYNTHETIC DATA  (realistic GBM with regime changes)
# ═══════════════════════════════════════════════════════════════════════════════

def make_synthetic(n: int = 2000, base: float = 30000.0,
                   freq: str = "5min", seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    prices = [base]
    regime_len = 0
    drift = rng.choice([-1, 1]) * 0.0004
    for i in range(1, n):
        regime_len += 1
        if regime_len > rng.integers(40, 120):
            drift = rng.choice([-1, 0, 1]) * rng.uniform(0.0001, 0.0005)
            regime_len = 0
        ret = drift + rng.normal(0, 0.0015)
        prices.append(prices[-1] * math.exp(ret))

    prices = np.array(prices)
    noise = abs(rng.normal(0, 0.002, n))
    highs = prices * (1 + noise)
    lows = prices * (1 - noise)
    opens = np.concatenate([[prices[0]], prices[:-1]])
    volume = rng.uniform(50, 500, n) * 1000
    idx = pd.date_range("2024-01-02 00:00", periods=n, freq=freq, tz="UTC")
    return pd.DataFrame(
        {"Open": opens, "High": highs, "Low": lows,
         "Close": prices, "Volume": volume}, index=idx
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  INDICATORS  (vectorised, applied to full series)
# ═══════════════════════════════════════════════════════════════════════════════

def ema(s: pd.Series, p: int) -> pd.Series:
    return s.ewm(span=p, adjust=False).mean()


def rsi_series(close: pd.Series, p: int = 14) -> pd.Series:
    d = close.diff()
    g = d.clip(lower=0).ewm(alpha=1 / p, adjust=False).mean()
    l = (-d.clip(upper=0)).ewm(alpha=1 / p, adjust=False).mean()
    return 100 - 100 / (1 + g / l.replace(0, np.nan))


def mfi_series(h: pd.Series, lo: pd.Series,
               c: pd.Series, v: pd.Series, p: int = 14) -> pd.Series:
    tp = (h + lo + c) / 3
    mf = tp * v
    pos = mf.where(tp > tp.shift(1), 0.0)
    neg = mf.where(tp < tp.shift(1), 0.0)
    ps = pos.rolling(p).sum()
    ns = neg.rolling(p).sum()
    return 100 - 100 / (1 + ps / ns.replace(0, np.nan))


def add_indicators(df: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["EMA7"] = ema(df["Close"], 7)
    df["EMA20"] = ema(df["Close"], 20)
    df["RSI"] = rsi_series(df["Close"])
    df["MFI"] = mfi_series(df["High"], df["Low"], df["Close"], df["Volume"])

    daily = daily.copy()
    daily["DayGreen"] = daily["Close"] > daily["Open"]
    daily.index = daily.index.normalize()
    day_map = daily["DayGreen"]

    df["Date"] = df.index.normalize()
    df["DayGreen"] = df["Date"].map(day_map)
    df.drop(columns="Date", inplace=True)
    return df


# ═══════════════════════════════════════════════════════════════════════════════
#  SWING HIGH / LOW  (left-side only — no look-ahead)
# ═══════════════════════════════════════════════════════════════════════════════

def left_swing_high(high: np.ndarray, i: int, lb: int = 5) -> bool:
    if i < lb:
        return False
    return high[i] == high[i - lb: i + 1].max()


def left_swing_low(low: np.ndarray, i: int, lb: int = 5) -> bool:
    if i < lb:
        return False
    return low[i] == low[i - lb: i + 1].min()


# ═══════════════════════════════════════════════════════════════════════════════
#  TRENDLINE
# ═══════════════════════════════════════════════════════════════════════════════

def trendline_at(i1, y1, i2, y2, ix):
    if i2 == i1:
        return None
    slope = (y2 - y1) / (i2 - i1)
    return y1 + slope * (ix - i1)


# ═══════════════════════════════════════════════════════════════════════════════
#  SIGNAL LOGIC  (evaluated at bar i, using only history up to i)
# ═══════════════════════════════════════════════════════════════════════════════

def _recent_swing_highs(high: np.ndarray, i: int, lb: int = 5,
                        max_search: int = 100):
    found = []
    for j in range(i - lb, max(i - max_search, lb - 1), -1):
        if left_swing_high(high, j, lb):
            found.append(j)
            if len(found) == 2:
                break
    return found  # newest first


def _recent_swing_lows(low: np.ndarray, i: int, lb: int = 5,
                       max_search: int = 100):
    found = []
    for j in range(i - lb, max(i - max_search, lb - 1), -1):
        if left_swing_low(low, j, lb):
            found.append(j)
            if len(found) == 2:
                break
    return found


def _pullback_in_zone_buy(low: np.ndarray, ema7: np.ndarray,
                          ema20: np.ndarray, i: int, look: int = 15) -> bool:
    start = max(0, i - look)
    band_lo = np.minimum(ema7[start:i], ema20[start:i]).min()
    band_hi = np.maximum(ema7[start:i], ema20[start:i]).max()
    recent_low = low[start:i].min()
    return recent_low <= band_hi


def _pullback_in_zone_sell(high: np.ndarray, ema7: np.ndarray,
                           ema20: np.ndarray, i: int, look: int = 15) -> bool:
    start = max(0, i - look)
    band_lo = np.minimum(ema7[start:i], ema20[start:i]).min()
    band_hi = np.maximum(ema7[start:i], ema20[start:i]).max()
    recent_high = high[start:i].max()
    return recent_high >= band_lo


def check_buy_at(i: int, data: dict) -> Optional[dict]:
    """Return signal dict or None. All data arrays indexed up to i (inclusive)."""
    if not data["DayGreen"][i]:
        return None
    if data["RSI"][i] <= 50:
        return None
    if data["MFI"][i] <= 50:
        return None
    if data["EMA7"][i] <= data["EMA20"][i]:
        return None
    if not _pullback_in_zone_buy(data["Low"], data["EMA7"], data["EMA20"], i):
        return None

    sh = _recent_swing_highs(data["High"], i)
    if len(sh) < 2:
        return None
    i2, i1 = sh[0], sh[1]         # i2 is more recent
    tl_prev = trendline_at(i1, data["High"][i1], i2, data["High"][i2], i - 1)
    tl_curr = trendline_at(i1, data["High"][i1], i2, data["High"][i2], i)
    if tl_prev is None or tl_curr is None:
        return None
    if not (data["Close"][i - 1] <= tl_prev and data["Close"][i] > tl_curr):
        return None

    return {"type": "BUY", "bar": i, "entry": data["Close"][i]}


def check_sell_at(i: int, data: dict) -> Optional[dict]:
    if data["DayGreen"][i]:
        return None
    if data["RSI"][i] >= 50:
        return None
    if data["MFI"][i] >= 50:
        return None
    if data["EMA7"][i] >= data["EMA20"][i]:
        return None
    if not _pullback_in_zone_sell(data["High"], data["EMA7"], data["EMA20"], i):
        return None

    sl = _recent_swing_lows(data["Low"], i)
    if len(sl) < 2:
        return None
    i2, i1 = sl[0], sl[1]
    tl_prev = trendline_at(i1, data["Low"][i1], i2, data["Low"][i2], i - 1)
    tl_curr = trendline_at(i1, data["Low"][i1], i2, data["Low"][i2], i)
    if tl_prev is None or tl_curr is None:
        return None
    if not (data["Close"][i - 1] >= tl_prev and data["Close"][i] < tl_curr):
        return None

    return {"type": "SELL", "bar": i, "entry": data["Close"][i]}


# ═══════════════════════════════════════════════════════════════════════════════
#  TRADE  &  RISK
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Trade:
    type: str           # "BUY" or "SELL"
    bar_open: int
    entry: float
    sl: float
    tp: float
    bar_close: int = -1
    exit_price: float = 0.0
    outcome: str = ""   # "TP", "SL", or "OPEN"
    pnl_pct: float = 0.0


def open_trade(signal: dict, sl_pct: float = 0.005,
               tp_pct: float = 0.010) -> Trade:
    e = signal["entry"]
    if signal["type"] == "BUY":
        return Trade("BUY", signal["bar"], e,
                     sl=e * (1 - sl_pct), tp=e * (1 + tp_pct))
    else:
        return Trade("SELL", signal["bar"], e,
                     sl=e * (1 + sl_pct), tp=e * (1 - tp_pct))


def resolve_trade(t: Trade, i: int,
                  high: np.ndarray, low: np.ndarray) -> bool:
    """Check if TP or SL was hit on bar i. Returns True if closed."""
    if t.type == "BUY":
        if low[i] <= t.sl:
            t.bar_close, t.exit_price = i, t.sl
            t.outcome = "SL"
            t.pnl_pct = (t.sl - t.entry) / t.entry * 100
            return True
        if high[i] >= t.tp:
            t.bar_close, t.exit_price = i, t.tp
            t.outcome = "TP"
            t.pnl_pct = (t.tp - t.entry) / t.entry * 100
            return True
    else:
        if high[i] >= t.sl:
            t.bar_close, t.exit_price = i, t.sl
            t.outcome = "SL"
            t.pnl_pct = (t.entry - t.sl) / t.entry * 100
            return True
        if low[i] <= t.tp:
            t.bar_close, t.exit_price = i, t.tp
            t.outcome = "TP"
            t.pnl_pct = (t.entry - t.tp) / t.entry * 100
            return True
    return False


# ═══════════════════════════════════════════════════════════════════════════════
#  BACKTEST ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def run_backtest(df: pd.DataFrame, daily: pd.DataFrame,
                 sl_pct: float = 0.005, tp_pct: float = 0.010,
                 max_open: int = 1) -> list[Trade]:
    """
    Walk forward bar by bar.
    sl_pct / tp_pct: fraction of entry price (0.5% SL, 1.0% TP = 2R default).
    max_open: max concurrent open trades.
    """
    df = add_indicators(df, daily)
    df = df.dropna(subset=["EMA7", "EMA20", "RSI", "MFI"])

    arrays = {
        "Open":    df["Open"].values,
        "High":    df["High"].values,
        "Low":     df["Low"].values,
        "Close":   df["Close"].values,
        "Volume":  df["Volume"].values,
        "EMA7":    df["EMA7"].values,
        "EMA20":   df["EMA20"].values,
        "RSI":     df["RSI"].values,
        "MFI":     df["MFI"].values,
        "DayGreen": df["DayGreen"].values,
    }

    closed_trades: list[Trade] = []
    open_trades: list[Trade] = []
    n = len(df)
    start = 30          # skip warm-up bars

    for i in range(start, n):
        # Resolve open trades first
        still_open = []
        for t in open_trades:
            if resolve_trade(t, i, arrays["High"], arrays["Low"]):
                closed_trades.append(t)
            else:
                still_open.append(t)
        open_trades = still_open

        # New signals only if we have room
        if len(open_trades) >= max_open:
            continue

        sig = check_buy_at(i, arrays) or check_sell_at(i, arrays)
        if sig:
            t = open_trade(sig, sl_pct=sl_pct, tp_pct=tp_pct)
            open_trades.append(t)

    # Close any still-open trades at last price
    last_price = arrays["Close"][-1]
    for t in open_trades:
        t.bar_close = n - 1
        t.exit_price = last_price
        t.outcome = "OPEN"
        if t.type == "BUY":
            t.pnl_pct = (last_price - t.entry) / t.entry * 100
        else:
            t.pnl_pct = (t.entry - last_price) / t.entry * 100
        closed_trades.append(t)

    return closed_trades


# ═══════════════════════════════════════════════════════════════════════════════
#  STATISTICS & REPORT
# ═══════════════════════════════════════════════════════════════════════════════

def stats(trades: list[Trade], df: pd.DataFrame,
          symbol: str, interval: str,
          sl_pct: float, tp_pct: float):
    if not trades:
        print("  No trades found.")
        return

    total = len(trades)
    wins = [t for t in trades if t.outcome == "TP"]
    losses = [t for t in trades if t.outcome == "SL"]
    open_t = [t for t in trades if t.outcome == "OPEN"]
    buys = [t for t in trades if t.type == "BUY"]
    sells = [t for t in trades if t.type == "SELL"]

    win_rate = len(wins) / total * 100 if total else 0
    gross_profit = sum(t.pnl_pct for t in wins)
    gross_loss = abs(sum(t.pnl_pct for t in losses))
    pf = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    # Equity curve (compounded from 1.0)
    equity = [1.0]
    for t in trades:
        prev = equity[-1]
        equity.append(prev * (1 + t.pnl_pct / 100))
    equity = np.array(equity)
    peak = np.maximum.accumulate(equity)
    dd = (equity - peak) / peak * 100
    max_dd = dd.min()

    net_return = (equity[-1] - 1) * 100

    # Dates
    start_date = df.index[0].strftime("%Y-%m-%d")
    end_date = df.index[-1].strftime("%Y-%m-%d")
    bars_total = len(df)

    w = 55
    print(f"\n{'═' * w}")
    print(f"  DA BACKTEST RESULTS")
    print(f"  {symbol}  |  {interval}  |  SL {sl_pct*100:.1f}%  TP {tp_pct*100:.1f}%")
    print(f"  Period : {start_date} → {end_date}  ({bars_total} bars)")
    print(f"{'═' * w}")
    print(f"  Total trades  : {total}  (Buy: {len(buys)}  Sell: {len(sells)}  Still open: {len(open_t)})")
    print(f"  Wins / Losses : {len(wins)} / {len(losses)}  ({win_rate:.1f}% win rate)")
    print(f"  Profit factor : {pf:.2f}")
    print(f"  Net return    : {net_return:+.2f}%")
    print(f"  Max drawdown  : {max_dd:.2f}%")
    if wins:
        avg_win = sum(t.pnl_pct for t in wins) / len(wins)
        print(f"  Avg win       : +{avg_win:.3f}%")
    if losses:
        avg_loss = sum(t.pnl_pct for t in losses) / len(losses)
        print(f"  Avg loss      :  {avg_loss:.3f}%")
    print(f"{'─' * w}")
    print(f"  Last 10 trades:")
    print(f"  {'#':>3}  {'Type':5}  {'Outcome':7}  {'Entry':>12}  {'Exit':>12}  {'P&L%':>7}")
    for k, t in enumerate(trades[-10:], 1):
        mark = "+" if t.pnl_pct > 0 else ""
        print(f"  {k:>3}  {t.type:5}  {t.outcome:7}  "
              f"{t.entry:>12.4f}  {t.exit_price:>12.4f}  {mark}{t.pnl_pct:.3f}%")
    print(f"{'═' * w}\n")


# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    # Defaults
    symbol   = sys.argv[1] if len(sys.argv) > 1 else None
    interval = sys.argv[2] if len(sys.argv) > 2 else "5m"
    start    = sys.argv[3] if len(sys.argv) > 3 else "2024-01-01"
    end      = sys.argv[4] if len(sys.argv) > 4 else "2025-01-01"
    sl_pct   = float(sys.argv[5]) / 100 if len(sys.argv) > 5 else 0.005
    tp_pct   = float(sys.argv[6]) / 100 if len(sys.argv) > 6 else 0.010

    iv_label = INTERVAL_MAP.get(interval.upper(), interval)

    if symbol is None:
        print("\n[DEMO MODE] Running on synthetic data — no internet needed.")
        print("For real data: python da_backtest.py BTCUSDT 5m 2024-01-01 2025-01-01\n")
        df = make_synthetic(2000)
        daily = make_daily_from_intraday(df)
        sym_label = "SYNTHETIC"
        iv_label = "5m"
    else:
        print(f"\nFetching {symbol} {interval} from Binance ({start} → {end}) …")
        try:
            df = fetch_binance(symbol, interval, start, end)
            daily = make_daily_from_intraday(df)
            sym_label = symbol
        except Exception as e:
            print(f"ERROR: {e}")
            sys.exit(1)

    trades = run_backtest(df, daily, sl_pct=sl_pct, tp_pct=tp_pct)
    stats(trades, df, sym_label, iv_label, sl_pct, tp_pct)


if __name__ == "__main__":
    main()
