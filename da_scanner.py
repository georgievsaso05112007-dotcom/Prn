"""
Trendline Break DA (Daily Analyzer) - Signal Scanner
Based on the strategy from Forex Factory:
  Timeframes: M1, M5, M15
  Indicators: RSI(14), MFI(14), EMA(7), EMA(20)
  Concept: Trendline break after pullback into EMA zone
"""

import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta


# ── Indicator helpers ────────────────────────────────────────────────────────

def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def mfi(high: pd.Series, low: pd.Series, close: pd.Series,
        volume: pd.Series, period: int = 14) -> pd.Series:
    typical = (high + low + close) / 3
    raw_mf = typical * volume
    pos_mf = raw_mf.where(typical > typical.shift(1), 0)
    neg_mf = raw_mf.where(typical < typical.shift(1), 0)
    pos_sum = pos_mf.rolling(period).sum()
    neg_sum = neg_mf.rolling(period).sum()
    mf_ratio = pos_sum / neg_sum.replace(0, np.nan)
    return 100 - (100 / (1 + mf_ratio))


# ── Swing high / low detection ───────────────────────────────────────────────

def swing_highs(high: pd.Series, lookback: int = 5) -> pd.Series:
    """Returns True at candles that are local swing highs."""
    result = pd.Series(False, index=high.index)
    for i in range(lookback, len(high) - lookback):
        window = high.iloc[i - lookback: i + lookback + 1]
        if high.iloc[i] == window.max():
            result.iloc[i] = True
    return result


def swing_lows(low: pd.Series, lookback: int = 5) -> pd.Series:
    """Returns True at candles that are local swing lows."""
    result = pd.Series(False, index=low.index)
    for i in range(lookback, len(low) - lookback):
        window = low.iloc[i - lookback: i + lookback + 1]
        if low.iloc[i] == window.min():
            result.iloc[i] = True
    return result


# ── Trendline break detection ────────────────────────────────────────────────

def trendline_slope_intercept(x1, y1, x2, y2):
    if x2 == x1:
        return None, None
    slope = (y2 - y1) / (x2 - x1)
    intercept = y1 - slope * x1
    return slope, intercept


def trendline_value_at(slope, intercept, x):
    return slope * x + intercept


def find_last_two_swing_highs(df, swing_mask):
    indices = df.index[swing_mask][-2:]
    if len(indices) < 2:
        return None
    i1, i2 = df.index.get_loc(indices[0]), df.index.get_loc(indices[1])
    y1, y2 = df["High"].iloc[i1], df["High"].iloc[i2]
    return i1, y1, i2, y2


def find_last_two_swing_lows(df, swing_mask):
    indices = df.index[swing_mask][-2:]
    if len(indices) < 2:
        return None
    i1, i2 = df.index.get_loc(indices[0]), df.index.get_loc(indices[1])
    y1, y2 = df["Low"].iloc[i1], df["Low"].iloc[i2]
    return i1, y1, i2, y2


def broke_above_trendline(df: pd.DataFrame, slope, intercept) -> bool:
    """True if the last closed bar closed above the trendline."""
    i = len(df) - 1
    tl_val = trendline_value_at(slope, intercept, i)
    prev_tl_val = trendline_value_at(slope, intercept, i - 1)
    close_now = df["Close"].iloc[i]
    close_prev = df["Close"].iloc[i - 1]
    return close_prev <= prev_tl_val and close_now > tl_val


def broke_below_trendline(df: pd.DataFrame, slope, intercept) -> bool:
    """True if the last closed bar closed below the trendline."""
    i = len(df) - 1
    tl_val = trendline_value_at(slope, intercept, i)
    prev_tl_val = trendline_value_at(slope, intercept, i - 1)
    close_now = df["Close"].iloc[i]
    close_prev = df["Close"].iloc[i - 1]
    return close_prev >= prev_tl_val and close_now < tl_val


# ── Pullback detection ───────────────────────────────────────────────────────

def price_inside_ema_zone(df: pd.DataFrame) -> bool:
    """True if the recent low touched or entered the 7/20 EMA band."""
    recent = df.iloc[-10:]
    low_min = recent["Low"].min()
    ema7 = recent["EMA7"].mean()
    ema20 = recent["EMA20"].mean()
    band_low = min(ema7, ema20)
    band_high = max(ema7, ema20)
    return band_low <= low_min <= band_high or low_min <= band_high


def price_inside_ema_zone_sell(df: pd.DataFrame) -> bool:
    """True if the recent high touched or entered the 7/20 EMA band (sell pullback)."""
    recent = df.iloc[-10:]
    high_max = recent["High"].max()
    ema7 = recent["EMA7"].mean()
    ema20 = recent["EMA20"].mean()
    band_low = min(ema7, ema20)
    band_high = max(ema7, ema20)
    return band_low <= high_max <= band_high or high_max >= band_low


# ── Main signal checker ──────────────────────────────────────────────────────

def add_indicators(df: pd.DataFrame, daily_df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["EMA7"] = ema(df["Close"], 7)
    df["EMA20"] = ema(df["Close"], 20)
    df["RSI"] = rsi(df["Close"])
    df["MFI"] = mfi(df["High"], df["Low"], df["Close"], df["Volume"])

    # Map daily candle color to intraday bars
    daily_df = daily_df.copy()
    daily_df["DailyGreen"] = daily_df["Close"] > daily_df["Open"]
    daily_df.index = daily_df.index.normalize()

    df.index = pd.DatetimeIndex(df.index)
    df["Date"] = df.index.normalize()
    daily_map = daily_df["DailyGreen"]
    df["DailyGreen"] = df["Date"].map(daily_map)

    df["SwingHigh"] = swing_highs(df["High"])
    df["SwingLow"] = swing_lows(df["Low"])
    return df


def check_buy(df: pd.DataFrame) -> dict:
    last = df.iloc[-1]

    # Conditions 1-4
    if not last["DailyGreen"]:
        return {"signal": False, "reason": "Daily candle is not Green"}
    if last["RSI"] <= 50:
        return {"signal": False, "reason": f"RSI {last['RSI']:.1f} not above 50"}
    if last["MFI"] <= 50:
        return {"signal": False, "reason": f"MFI {last['MFI']:.1f} not above 50"}
    if last["EMA7"] <= last["EMA20"]:
        return {"signal": False, "reason": "No uptrend: EMA7 not above EMA20"}

    # Condition 5 - pullback into EMA zone
    if not price_inside_ema_zone(df):
        return {"signal": False, "reason": "No pullback into 7/20 EMA zone detected"}

    # Conditions 6 & 7 - trendline from highest swing, break above
    pts = find_last_two_swing_highs(df, df["SwingHigh"])
    if pts is None:
        return {"signal": False, "reason": "Not enough swing highs for trendline"}
    i1, y1, i2, y2 = pts
    slope, intercept = trendline_slope_intercept(i1, y1, i2, y2)
    if slope is None:
        return {"signal": False, "reason": "Could not compute trendline"}

    if not broke_above_trendline(df, slope, intercept):
        return {"signal": False, "reason": "Price has not broken above trendline yet"}

    entry = last["Close"]
    sl = entry - 0.0020   # 20 pips below entry (default mid-range)
    tp = entry + 0.0030   # 30 pips above entry
    return {
        "signal": True,
        "type": "BUY",
        "entry": round(entry, 5),
        "sl": round(sl, 5),
        "tp": round(tp, 5),
        "rsi": round(last["RSI"], 1),
        "mfi": round(last["MFI"], 1),
        "ema7": round(last["EMA7"], 5),
        "ema20": round(last["EMA20"], 5),
    }


def check_sell(df: pd.DataFrame) -> dict:
    last = df.iloc[-1]

    # Conditions 1-4
    if last["DailyGreen"]:
        return {"signal": False, "reason": "Daily candle is not Red"}
    if last["RSI"] >= 50:
        return {"signal": False, "reason": f"RSI {last['RSI']:.1f} not below 50"}
    if last["MFI"] >= 50:
        return {"signal": False, "reason": f"MFI {last['MFI']:.1f} not below 50"}
    if last["EMA7"] >= last["EMA20"]:
        return {"signal": False, "reason": "No downtrend: EMA7 not below EMA20"}

    # Condition 5 - pullback into EMA zone
    if not price_inside_ema_zone_sell(df):
        return {"signal": False, "reason": "No pullback into 7/20 EMA zone detected"}

    # Conditions 6 & 7 - trendline from lowest swing, break below
    pts = find_last_two_swing_lows(df, df["SwingLow"])
    if pts is None:
        return {"signal": False, "reason": "Not enough swing lows for trendline"}
    i1, y1, i2, y2 = pts
    slope, intercept = trendline_slope_intercept(i1, y1, i2, y2)
    if slope is None:
        return {"signal": False, "reason": "Could not compute trendline"}

    if not broke_below_trendline(df, slope, intercept):
        return {"signal": False, "reason": "Price has not broken below trendline yet"}

    entry = last["Close"]
    sl = entry + 0.0020
    tp = entry - 0.0030
    return {
        "signal": True,
        "type": "SELL",
        "entry": round(entry, 5),
        "sl": round(sl, 5),
        "tp": round(tp, 5),
        "rsi": round(last["RSI"], 1),
        "mfi": round(last["MFI"], 1),
        "ema7": round(last["EMA7"], 5),
        "ema20": round(last["EMA20"], 5),
    }


# ── Data fetcher ─────────────────────────────────────────────────────────────

TIMEFRAME_MAP = {
    "M1": "1m",
    "M5": "5m",
    "M15": "15m",
}

TIMEFRAME_LOOKBACK = {
    "M1": "1d",
    "M5": "5d",
    "M15": "60d",
}


def _make_demo_bars(n: int = 300, base: float = 1.10000,
                    spread: float = 0.0002, seed: int = 42) -> pd.DataFrame:
    """Generate synthetic OHLCV bars for offline testing."""
    rng = np.random.default_rng(seed)
    closes = [base]
    for _ in range(n - 1):
        closes.append(closes[-1] * (1 + rng.normal(0, 0.0003)))
    closes = np.array(closes)
    highs = closes + abs(rng.normal(0, spread, n))
    lows = closes - abs(rng.normal(0, spread, n))
    opens = np.roll(closes, 1)
    opens[0] = base
    volume = rng.integers(500, 5000, n).astype(float)
    idx = pd.date_range("2026-01-02 08:00", periods=n, freq="5min")
    return pd.DataFrame(
        {"Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": volume},
        index=idx,
    )


def fetch_data(symbol: str, timeframe: str):
    tf = TIMEFRAME_MAP.get(timeframe.upper(), "5m")
    lb = TIMEFRAME_LOOKBACK.get(timeframe.upper(), "5d")
    try:
        df = yf.download(symbol, period=lb, interval=tf, auto_adjust=True, progress=False)
        daily = yf.download(symbol, period="5d", interval="1d", auto_adjust=True, progress=False)
        if not df.empty:
            return df, daily
    except Exception:
        pass
    raise ValueError(f"No data returned for {symbol} on {timeframe}")


def fetch_data_csv(intraday_csv: str, daily_csv: str = None):
    """Load OHLCV data from CSV files (exported from MT4/broker platform).

    Expected columns: Date/Datetime, Open, High, Low, Close, Volume
    """
    df = pd.read_csv(intraday_csv, parse_dates=[0], index_col=0)
    df.columns = [c.strip().capitalize() for c in df.columns]
    if daily_csv:
        daily = pd.read_csv(daily_csv, parse_dates=[0], index_col=0)
        daily.columns = [c.strip().capitalize() for c in daily.columns]
    else:
        daily = df.resample("1D").agg(
            {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}
        ).dropna()
    return df, daily


def fetch_demo():
    """Return synthetic data for offline testing of the scanner logic."""
    intraday = _make_demo_bars(300)
    daily = intraday.resample("1D").agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}
    ).dropna()
    return intraday, daily


# ── CLI ──────────────────────────────────────────────────────────────────────

def scan_csv(intraday_csv: str, daily_csv: str = None,
             symbol: str = "PAIR", timeframe: str = "M5",
             pip_size: float = 0.0001):
    """Run the scanner on CSV data exported from your broker/MT4."""
    df, daily = fetch_data_csv(intraday_csv, daily_csv)
    return _run_scan(df, daily, symbol, timeframe, pip_size)


def scan_demo():
    """Run the scanner on synthetic data (offline self-test)."""
    df, daily = fetch_demo()
    return _run_scan(df, daily, "DEMO", "M5", 0.0001)


def scan(symbol: str, timeframe: str = "M5", pip_size: float = 0.0001):
    df, daily = fetch_data(symbol, timeframe)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    if isinstance(daily.columns, pd.MultiIndex):
        daily.columns = daily.columns.droplevel(1)
    return _run_scan(df, daily, symbol, timeframe, pip_size)


def _run_scan(df: pd.DataFrame, daily: pd.DataFrame,
              symbol: str, timeframe: str, pip_size: float):
    print(f"\n{'=' * 55}")
    print(f"  DA Scanner  |  {symbol}  |  {timeframe}")
    print(f"  {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'=' * 55}")

    df = add_indicators(df, daily)
    df = df.dropna(subset=["EMA7", "EMA20", "RSI", "MFI"])

    last = df.iloc[-1]
    print(f"\n  Last bar : {df.index[-1]}")
    print(f"  Close    : {last['Close']:.5f}")
    print(f"  EMA7     : {last['EMA7']:.5f}")
    print(f"  EMA20    : {last['EMA20']:.5f}")
    print(f"  RSI      : {last['RSI']:.1f}")
    print(f"  MFI      : {last['MFI']:.1f}")
    daily_color = "Green" if last["DailyGreen"] else "Red"
    print(f"  Daily    : {daily_color}")
    print()

    buy = check_buy(df)
    sell = check_sell(df)

    if buy["signal"]:
        print(f"  *** BUY SIGNAL ***")
        print(f"  Entry : {buy['entry']}")
        print(f"  SL    : {buy['sl']}  ({round((buy['entry'] - buy['sl']) / pip_size)} pips)")
        print(f"  TP    : {buy['tp']}  ({round((buy['tp'] - buy['entry']) / pip_size)} pips)")
    else:
        print(f"  No BUY  — {buy['reason']}")

    if sell["signal"]:
        print(f"  *** SELL SIGNAL ***")
        print(f"  Entry : {sell['entry']}")
        print(f"  SL    : {sell['sl']}  ({round((sell['sl'] - sell['entry']) / pip_size)} pips)")
        print(f"  TP    : {sell['tp']}  ({round((sell['entry'] - sell['tp']) / pip_size)} pips)")
    else:
        print(f"  No SELL — {sell['reason']}")

    print(f"{'=' * 55}\n")
    return buy, sell


if __name__ == "__main__":
    import sys

    # Usage:
    #   python da_scanner.py                       → demo mode (offline)
    #   python da_scanner.py EURUSD=X M5           → live data via yfinance
    #   python da_scanner.py GBPUSD=X M15
    #   python da_scanner.py USDJPY=X M1
    #   python da_scanner.py --csv data.csv M5     → load from CSV file

    if len(sys.argv) > 1 and sys.argv[1] == "--csv":
        csv_file = sys.argv[2] if len(sys.argv) > 2 else "data.csv"
        tf = sys.argv[3] if len(sys.argv) > 3 else "M5"
        scan_csv(csv_file, timeframe=tf)
    elif len(sys.argv) == 1:
        scan_demo()
    else:
        symbol = sys.argv[1]
        timeframe = sys.argv[2] if len(sys.argv) > 2 else "M5"
        pip = 0.01 if "JPY" in symbol.upper() else 0.0001
        try:
            scan(symbol, timeframe, pip_size=pip)
        except ValueError as e:
            print(f"\nERROR: {e}")
            print("Tip: Run without arguments for demo mode, or use --csv to load a file.")
            sys.exit(1)
