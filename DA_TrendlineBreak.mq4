//+------------------------------------------------------------------+
//|                                      DA_TrendlineBreak.mq4      |
//|            Trendline Break Strategy — RSI + MFI + EMA Filter    |
//|            Timeframes : M1 / M5 / M15                           |
//+------------------------------------------------------------------+
//  Buy  rules : Daily Green | RSI>50 | MFI>50 | EMA7>EMA20        |
//               Pullback into EMA zone | Break above trendline     |
//  Sell rules : Daily Red   | RSI<50 | MFI<50 | EMA7<EMA20        |
//               Pullback into EMA zone | Break below trendline     |
//+------------------------------------------------------------------+
#property copyright ""
#property link      ""
#property version   "1.10"
#property strict

//--- Inputs -----------------------------------------------------------
input double InpLots          = 0.01;      // Lot size
input int    InpSL            = 20;        // Stop Loss (pips)
input int    InpTP            = 30;        // Take Profit (pips)
input int    InpRSIPeriod     = 14;        // RSI period
input int    InpMFIPeriod     = 14;        // MFI period
input int    InpEMAFast       = 7;         // Fast EMA period
input int    InpEMASlow       = 20;        // Slow EMA period
input int    InpSwingLB       = 5;         // Swing lookback (bars each side)
input int    InpPullbackBars  = 15;        // Bars to look back for EMA pullback
input int    InpMagic         = 20240101;  // Magic number (unique per EA instance)
input bool   InpCloseOpposite = true;      // Close opposite trade when new signal fires

//--- Globals ----------------------------------------------------------
double g_pip;   // true pip size (handles 3/5-digit brokers)

//+------------------------------------------------------------------+
int OnInit()
{
    g_pip = (_Digits == 3 || _Digits == 5) ? _Point * 10.0 : _Point;
    Print("DA TrendlineBreak EA ready. Symbol=", Symbol(),
          "  TF=", Period(), "  pip=", g_pip);
    return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnTick()
{
    // Run once per closed bar (no tick noise)
    static datetime s_lastBar = 0;
    if(Time[0] == s_lastBar) return;
    s_lastBar = Time[0];

    // ── Indicators on the last CLOSED bar (index 1 = confirmed) ──────
    bool   dailyGreen = (iClose(NULL, PERIOD_D1, 1) > iOpen(NULL, PERIOD_D1, 1));
    double rsi        = iRSI(NULL, 0, InpRSIPeriod, PRICE_CLOSE, 1);
    double mfi        = iMFI(NULL, 0, InpMFIPeriod, 1);
    double ema7       = iMA (NULL, 0, InpEMAFast, 0, MODE_EMA, PRICE_CLOSE, 1);
    double ema20      = iMA (NULL, 0, InpEMASlow, 0, MODE_EMA, PRICE_CLOSE, 1);

    // ── Condition blocks ──────────────────────────────────────────────
    bool buyBase  =  dailyGreen && rsi > 50.0 && mfi > 50.0 && ema7 > ema20;
    bool sellBase = !dailyGreen && rsi < 50.0 && mfi < 50.0 && ema7 < ema20;

    // ── BUY : pullback into EMA zone + trendline break up ────────────
    if(buyBase && PullbackInZone(true) && TrendlineBreakUp())
    {
        if(InpCloseOpposite) CloseTrades(OP_SELL);
        if(CountTrades(OP_BUY) == 0) OpenTrade(OP_BUY);
    }

    // ── SELL : pullback into EMA zone + trendline break down ─────────
    if(sellBase && PullbackInZone(false) && TrendlineBreakDown())
    {
        if(InpCloseOpposite) CloseTrades(OP_BUY);
        if(CountTrades(OP_SELL) == 0) OpenTrade(OP_SELL);
    }
}

//+------------------------------------------------------------------+
//  Swing detection — confirmed (needs InpSwingLB bars on both sides)
//+------------------------------------------------------------------+
bool IsSwingHigh(int bar)
{
    if(bar - InpSwingLB < 0 || bar + InpSwingLB >= Bars) return false;
    double h = High[bar];
    for(int i = 1; i <= InpSwingLB; i++)
        if(High[bar - i] >= h || High[bar + i] >= h) return false;
    return true;
}

bool IsSwingLow(int bar)
{
    if(bar - InpSwingLB < 0 || bar + InpSwingLB >= Bars) return false;
    double l = Low[bar];
    for(int i = 1; i <= InpSwingLB; i++)
        if(Low[bar - i] <= l || Low[bar + i] <= l) return false;
    return true;
}

// Find the nth confirmed swing high starting from bar `fromBar` going older.
// Returns bar index, or -1 if not found.
int FindSwingHigh(int fromBar, int nth = 0)
{
    int count = 0;
    int limit = MathMin(fromBar + 300, Bars - InpSwingLB - 1);
    for(int b = fromBar + InpSwingLB; b <= limit; b++)
    {
        if(IsSwingHigh(b))
        {
            if(count == nth) return b;
            count++;
        }
    }
    return -1;
}

int FindSwingLow(int fromBar, int nth = 0)
{
    int count = 0;
    int limit = MathMin(fromBar + 300, Bars - InpSwingLB - 1);
    for(int b = fromBar + InpSwingLB; b <= limit; b++)
    {
        if(IsSwingLow(b))
        {
            if(count == nth) return b;
            count++;
        }
    }
    return -1;
}

//+------------------------------------------------------------------+
//  Trendline — project value to a target bar index
//+------------------------------------------------------------------+
//  MQL4 note: smaller index = newer bar. b1 < b2 means b1 is newer.
double TLValue(int b1, double p1, int b2, double p2, int target)
{
    if(b2 == b1) return p1;
    // slope expressed as price-change per one bar going toward older bars
    double slope = (p2 - p1) / (double)(b2 - b1);
    return p1 + slope * (double)(target - b1);
}

// True if the last CLOSED bar (bar 1) broke above the trendline drawn
// from the two most recent confirmed swing HIGHS.
bool TrendlineBreakUp()
{
    // Start search from bar 2 so the breakout bar (bar 1) is not counted as a swing
    int sh1 = FindSwingHigh(2, 0);   // most recent swing high
    if(sh1 < 0) return false;
    int sh2 = FindSwingHigh(sh1 + 1, 0);  // second most recent
    if(sh2 < 0) return false;

    double tl1 = TLValue(sh1, High[sh1], sh2, High[sh2], 1);
    double tl2 = TLValue(sh1, High[sh1], sh2, High[sh2], 2);

    // Bar 2 closed below TL, bar 1 (just closed) closed above TL → breakout
    return (Close[2] < tl2 && Close[1] > tl1);
}

// True if the last CLOSED bar (bar 1) broke below the trendline drawn
// from the two most recent confirmed swing LOWS.
bool TrendlineBreakDown()
{
    int sl1 = FindSwingLow(2, 0);
    if(sl1 < 0) return false;
    int sl2 = FindSwingLow(sl1 + 1, 0);
    if(sl2 < 0) return false;

    double tl1 = TLValue(sl1, Low[sl1], sl2, Low[sl2], 1);
    double tl2 = TLValue(sl1, Low[sl1], sl2, Low[sl2], 2);

    return (Close[2] > tl2 && Close[1] < tl1);
}

//+------------------------------------------------------------------+
//  Pullback into EMA zone
//  Buy  : any of the last N bars had its Low touch or enter the band
//  Sell : any of the last N bars had its High touch or enter the band
//+------------------------------------------------------------------+
bool PullbackInZone(bool isBuy)
{
    for(int i = 2; i <= InpPullbackBars + 1; i++)
    {
        double e7  = iMA(NULL, 0, InpEMAFast, 0, MODE_EMA, PRICE_CLOSE, i);
        double e20 = iMA(NULL, 0, InpEMASlow, 0, MODE_EMA, PRICE_CLOSE, i);
        double bandH = MathMax(e7, e20);
        double bandL = MathMin(e7, e20);

        if(isBuy  && Low [i] <= bandH) return true;
        if(!isBuy && High[i] >= bandL) return true;
    }
    return false;
}

//+------------------------------------------------------------------+
//  Trade utilities
//+------------------------------------------------------------------+
int CountTrades(int orderType)
{
    int n = 0;
    for(int i = 0; i < OrdersTotal(); i++)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
        if(OrderMagicNumber() != InpMagic)  continue;
        if(OrderSymbol()      != Symbol())  continue;
        if(OrderType()        == orderType) n++;
    }
    return n;
}

void CloseTrades(int orderType)
{
    for(int i = OrdersTotal() - 1; i >= 0; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
        if(OrderMagicNumber() != InpMagic) continue;
        if(OrderSymbol()      != Symbol()) continue;
        if(OrderType()        != orderType) continue;

        double price = (orderType == OP_BUY) ? Bid : Ask;
        if(!OrderClose(OrderTicket(), OrderLots(), price, 3, clrNONE))
            Print("CloseTrades error: ", GetLastError());
    }
}

void OpenTrade(int orderType)
{
    double price, sl, tp;

    if(orderType == OP_BUY)
    {
        price = Ask;
        sl    = NormalizeDouble(price - InpSL * g_pip, _Digits);
        tp    = NormalizeDouble(price + InpTP * g_pip, _Digits);
    }
    else
    {
        price = Bid;
        sl    = NormalizeDouble(price + InpSL * g_pip, _Digits);
        tp    = NormalizeDouble(price - InpTP * g_pip, _Digits);
    }

    int ticket = OrderSend(
        Symbol(), orderType, InpLots, price, 3, sl, tp,
        "DA TL Break", InpMagic, 0,
        (orderType == OP_BUY) ? clrDodgerBlue : clrOrangeRed
    );

    if(ticket < 0)
        Print("OpenTrade failed, error=", GetLastError(),
              "  type=", (orderType == OP_BUY ? "BUY" : "SELL"),
              "  price=", price);
    else
        Print("Trade opened #", ticket, " ",
              (orderType == OP_BUY ? "BUY" : "SELL"),
              "  Entry=", price, "  SL=", sl, "  TP=", tp);
}
//+------------------------------------------------------------------+
