//+------------------------------------------------------------------+
//|                                      DA_TrendlineBreak.mq5      |
//|            Trendline Break Strategy — RSI + MFI + EMA Filter    |
//|            Timeframes : M1 / M5 / M15                           |
//+------------------------------------------------------------------+
//  Buy  rules : Daily Green | RSI>50 | MFI>50 | EMA7>EMA20        |
//               Pullback into EMA zone | Break above swing-high TL |
//  Sell rules : Daily Red   | RSI<50 | MFI<50 | EMA7<EMA20        |
//               Pullback into EMA zone | Break below swing-low TL  |
//+------------------------------------------------------------------+
#property copyright ""
#property link      ""
#property version   "1.10"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

//--- Inputs -----------------------------------------------------------
input double InpLots          = 0.01;       // Lot size
input int    InpSL            = 20;         // Stop Loss (pips)
input int    InpTP            = 30;         // Take Profit (pips)
input int    InpRSIPeriod     = 14;         // RSI period
input int    InpMFIPeriod     = 14;         // MFI period
input int    InpEMAFast       = 7;          // Fast EMA period
input int    InpEMASlow       = 20;         // Slow EMA period
input int    InpSwingLB       = 5;          // Swing lookback (bars each side)
input int    InpPullbackBars  = 15;         // Bars to check for EMA pullback
input ulong  InpMagic         = 20240101;   // Magic number
input bool   InpCloseOpposite = true;       // Close opposite position on new signal

//--- Globals ----------------------------------------------------------
CTrade      g_trade;
CPositionInfo g_pos;

int    g_rsiHandle;
int    g_mfiHandle;
int    g_ema7Handle;
int    g_ema20Handle;
double g_pip;

//+------------------------------------------------------------------+
int OnInit()
{
    g_pip = (Digits() == 3 || Digits() == 5) ? Point() * 10.0 : Point();

    g_rsiHandle  = iRSI(_Symbol, PERIOD_CURRENT, InpRSIPeriod, PRICE_CLOSE);
    g_mfiHandle  = iMFI(_Symbol, PERIOD_CURRENT, InpMFIPeriod, VOLUME_TICK);
    g_ema7Handle = iMA (_Symbol, PERIOD_CURRENT, InpEMAFast, 0, MODE_EMA, PRICE_CLOSE);
    g_ema20Handle= iMA (_Symbol, PERIOD_CURRENT, InpEMASlow, 0, MODE_EMA, PRICE_CLOSE);

    if(g_rsiHandle  == INVALID_HANDLE || g_mfiHandle  == INVALID_HANDLE ||
       g_ema7Handle == INVALID_HANDLE || g_ema20Handle == INVALID_HANDLE)
    {
        Print("ERROR: failed to create indicator handle(s)");
        return INIT_FAILED;
    }

    g_trade.SetExpertMagicNumber(InpMagic);
    g_trade.SetDeviationInPoints(10);
    g_trade.SetTypeFilling(ORDER_FILLING_FOK);

    Print("DA TrendlineBreak EA ready. Symbol=", _Symbol,
          "  TF=", EnumToString(Period()), "  pip=", g_pip);
    return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    IndicatorRelease(g_rsiHandle);
    IndicatorRelease(g_mfiHandle);
    IndicatorRelease(g_ema7Handle);
    IndicatorRelease(g_ema20Handle);
}

//+------------------------------------------------------------------+
void OnTick()
{
    // Execute once per closed bar
    static datetime s_lastBar = 0;
    datetime barTime = iTime(_Symbol, PERIOD_CURRENT, 0);
    if(barTime == s_lastBar) return;
    s_lastBar = barTime;

    // ── Copy indicator buffers (index 1 = last closed bar) ───────────
    double rsiArr[2], mfiArr[2], ema7Arr[2], ema20Arr[2];
    if(CopyBuffer(g_rsiHandle,  0, 1, 2, rsiArr)  < 2) return;
    if(CopyBuffer(g_mfiHandle,  0, 1, 2, mfiArr)  < 2) return;
    if(CopyBuffer(g_ema7Handle, 0, 1, 2, ema7Arr) < 2) return;
    if(CopyBuffer(g_ema20Handle,0, 1, 2, ema20Arr)< 2) return;

    // CopyBuffer fills [0]=oldest, [1]=newest when copying 2 bars from shift 1
    double rsi  = rsiArr [1];
    double mfi  = mfiArr [1];
    double ema7 = ema7Arr[1];
    double ema20= ema20Arr[1];

    // ── Daily candle colour ───────────────────────────────────────────
    double d1Open  = iOpen (_Symbol, PERIOD_D1, 1);
    double d1Close = iClose(_Symbol, PERIOD_D1, 1);
    bool   dailyGreen = (d1Close > d1Open);

    // ── Condition blocks ──────────────────────────────────────────────
    bool buyBase  =  dailyGreen && rsi > 50.0 && mfi > 50.0 && ema7 > ema20;
    bool sellBase = !dailyGreen && rsi < 50.0 && mfi < 50.0 && ema7 < ema20;

    // ── Price arrays (series order: index 0 = current bar) ───────────
    const int HIST = 300;
    double highArr[], lowArr[], closeArr[];
    ArraySetAsSeries(highArr,  true);
    ArraySetAsSeries(lowArr,   true);
    ArraySetAsSeries(closeArr, true);
    if(CopyHigh (_Symbol, PERIOD_CURRENT, 0, HIST, highArr)  < HIST) return;
    if(CopyLow  (_Symbol, PERIOD_CURRENT, 0, HIST, lowArr)   < HIST) return;
    if(CopyClose(_Symbol, PERIOD_CURRENT, 0, HIST, closeArr) < HIST) return;

    // ── EMA arrays for pullback check (series order) ──────────────────
    double ema7Hist[], ema20Hist[];
    ArraySetAsSeries(ema7Hist,  true);
    ArraySetAsSeries(ema20Hist, true);
    if(CopyBuffer(g_ema7Handle,  0, 0, HIST, ema7Hist)  < HIST) return;
    if(CopyBuffer(g_ema20Handle, 0, 0, HIST, ema20Hist) < HIST) return;

    // ── BUY setup ─────────────────────────────────────────────────────
    if(buyBase
       && PullbackInZone(true,  lowArr,  ema7Hist, ema20Hist)
       && TrendlineBreakUp(highArr, closeArr))
    {
        if(InpCloseOpposite) ClosePositions(POSITION_TYPE_SELL);
        if(CountPositions(POSITION_TYPE_BUY) == 0)
            OpenTrade(ORDER_TYPE_BUY);
    }

    // ── SELL setup ────────────────────────────────────────────────────
    if(sellBase
       && PullbackInZone(false, highArr, ema7Hist, ema20Hist)
       && TrendlineBreakDown(lowArr, closeArr))
    {
        if(InpCloseOpposite) ClosePositions(POSITION_TYPE_BUY);
        if(CountPositions(POSITION_TYPE_SELL) == 0)
            OpenTrade(ORDER_TYPE_SELL);
    }
}

//+------------------------------------------------------------------+
//  Swing detection — confirmed on both sides, no look-ahead
//  Arrays are series (index 0 = current bar).
//+------------------------------------------------------------------+
bool IsSwingHigh(const double &high[], int bar, int lb)
{
    if(bar - lb < 0 || bar + lb >= ArraySize(high)) return false;
    double h = high[bar];
    for(int i = 1; i <= lb; i++)
        if(high[bar - i] >= h || high[bar + i] >= h) return false;
    return true;
}

bool IsSwingLow(const double &low[], int bar, int lb)
{
    if(bar - lb < 0 || bar + lb >= ArraySize(low)) return false;
    double l = low[bar];
    for(int i = 1; i <= lb; i++)
        if(low[bar - i] <= l || low[bar + i] <= l) return false;
    return true;
}

// Find nth confirmed swing high starting from bar `fromBar` going older (larger index).
int FindSwingHigh(const double &high[], int fromBar, int nth = 0)
{
    int count = 0;
    int limit = ArraySize(high) - InpSwingLB - 1;
    for(int b = fromBar + InpSwingLB; b <= limit; b++)
    {
        if(IsSwingHigh(high, b, InpSwingLB))
        {
            if(count == nth) return b;
            count++;
        }
    }
    return -1;
}

int FindSwingLow(const double &low[], int fromBar, int nth = 0)
{
    int count = 0;
    int limit = ArraySize(low) - InpSwingLB - 1;
    for(int b = fromBar + InpSwingLB; b <= limit; b++)
    {
        if(IsSwingLow(low, b, InpSwingLB))
        {
            if(count == nth) return b;
            count++;
        }
    }
    return -1;
}

//+------------------------------------------------------------------+
//  Trendline value at target bar (series arrays: 0 = current)
//+------------------------------------------------------------------+
double TLValue(int b1, double p1, int b2, double p2, int target)
{
    // b1 < b2 in series arrays (b1 is newer)
    if(b2 == b1) return p1;
    double slope = (p2 - p1) / (double)(b2 - b1);
    return p1 + slope * (double)(target - b1);
}

// Bar 1 (last closed) broke above the swing-high trendline
bool TrendlineBreakUp(const double &high[], const double &close[])
{
    // Search from bar 2 — exclude the breakout bar from being a swing anchor
    int sh1 = FindSwingHigh(high, 2, 0);
    if(sh1 < 0) return false;
    int sh2 = FindSwingHigh(high, sh1 + 1, 0);
    if(sh2 < 0) return false;

    double tl1 = TLValue(sh1, high[sh1], sh2, high[sh2], 1);
    double tl2 = TLValue(sh1, high[sh1], sh2, high[sh2], 2);

    // Bar 2 below TL, bar 1 (just closed) above TL
    return (close[2] < tl2 && close[1] > tl1);
}

// Bar 1 (last closed) broke below the swing-low trendline
bool TrendlineBreakDown(const double &low[], const double &close[])
{
    int sl1 = FindSwingLow(low, 2, 0);
    if(sl1 < 0) return false;
    int sl2 = FindSwingLow(low, sl1 + 1, 0);
    if(sl2 < 0) return false;

    double tl1 = TLValue(sl1, low[sl1], sl2, low[sl2], 1);
    double tl2 = TLValue(sl1, low[sl1], sl2, low[sl2], 2);

    return (close[2] > tl2 && close[1] < tl1);
}

//+------------------------------------------------------------------+
//  Pullback into EMA band
//  Buy : any bar's Low in the last N bars touched the band
//  Sell: any bar's High in the last N bars touched the band
//+------------------------------------------------------------------+
bool PullbackInZone(bool isBuy,
                    const double &priceArr[],   // Low[] for buy, High[] for sell
                    const double &ema7Hist[],
                    const double &ema20Hist[])
{
    for(int i = 2; i <= InpPullbackBars + 1; i++)
    {
        double bandH = MathMax(ema7Hist[i], ema20Hist[i]);
        double bandL = MathMin(ema7Hist[i], ema20Hist[i]);

        if(isBuy  && priceArr[i] <= bandH) return true;
        if(!isBuy && priceArr[i] >= bandL) return true;
    }
    return false;
}

//+------------------------------------------------------------------+
//  Position utilities
//+------------------------------------------------------------------+
int CountPositions(ENUM_POSITION_TYPE posType)
{
    int n = 0;
    for(int i = PositionsTotal() - 1; i >= 0; i--)
    {
        if(!g_pos.SelectByIndex(i)) continue;
        if(g_pos.Symbol() != _Symbol) continue;
        if(g_pos.Magic()  != InpMagic) continue;
        if(g_pos.PositionType() == posType) n++;
    }
    return n;
}

void ClosePositions(ENUM_POSITION_TYPE posType)
{
    for(int i = PositionsTotal() - 1; i >= 0; i--)
    {
        if(!g_pos.SelectByIndex(i)) continue;
        if(g_pos.Symbol() != _Symbol) continue;
        if(g_pos.Magic()  != InpMagic) continue;
        if(g_pos.PositionType() != posType) continue;
        if(!g_trade.PositionClose(g_pos.Ticket()))
            Print("ClosePositions error: ", GetLastError());
    }
}

void OpenTrade(ENUM_ORDER_TYPE orderType)
{
    double sl, tp;

    if(orderType == ORDER_TYPE_BUY)
    {
        double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
        sl = NormalizeDouble(ask - InpSL * g_pip, Digits());
        tp = NormalizeDouble(ask + InpTP * g_pip, Digits());
        if(!g_trade.Buy(InpLots, _Symbol, ask, sl, tp, "DA TL Break"))
            Print("Buy failed: ", GetLastError());
        else
            Print("BUY opened  Ask=", ask, "  SL=", sl, "  TP=", tp);
    }
    else
    {
        double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
        sl = NormalizeDouble(bid + InpSL * g_pip, Digits());
        tp = NormalizeDouble(bid - InpTP * g_pip, Digits());
        if(!g_trade.Sell(InpLots, _Symbol, bid, sl, tp, "DA TL Break"))
            Print("Sell failed: ", GetLastError());
        else
            Print("SELL opened  Bid=", bid, "  SL=", sl, "  TP=", tp);
    }
}
//+------------------------------------------------------------------+
