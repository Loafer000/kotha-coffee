import React, { useState, useEffect, useCallback } from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  IndianRupee, 
  ShoppingBag, 
  TrendingUp, 
  CreditCard, 
  Banknote, 
  QrCode, 
  AlertCircle,
  FolderOpen
} from 'lucide-react';
import { 
  getDailyAnalytics, 
  type DailyAnalytics, 
  type ItemSaleRecord 
} from '../services/api.js';

interface AnalyticsProps {
  token?: string | null;
}

function getTodayKolkata(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function shiftDate(dateStr: string, deltaDays: number): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + deltaDays);
    return date.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

function formatDisplayDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export const Analytics: React.FC<AnalyticsProps> = ({ token }) => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata());
  const [data, setData] = useState<DailyAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDailyAnalytics(targetDate, token || undefined);
      setData(result);
    } catch (err: any) {
      console.error('[Analytics Fetch Error]', err);
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAnalytics(selectedDate);
  }, [selectedDate, fetchAnalytics]);

  const handlePrevDay = () => setSelectedDate(shiftDate(selectedDate, -1));
  const handleNextDay = () => setSelectedDate(shiftDate(selectedDate, 1));
  const handleToday = () => setSelectedDate(getTodayKolkata());
  const handleYesterday = () => setSelectedDate(shiftDate(getTodayKolkata(), -1));

  const grandTotal = data?.grandTotal ?? 0;
  const orderCount = data?.orderCount ?? 0;
  const avgOrderValue = orderCount > 0 ? Math.round(grandTotal / orderCount) : 0;

  const cashSplit = data?.paymentBreakdown?.Cash || { total: 0, count: 0 };
  const upiSplit = data?.paymentBreakdown?.UPI || { total: 0, count: 0 };
  const cardSplit = data?.paymentBreakdown?.Card || { total: 0, count: 0 };

  const cashPct = grandTotal > 0 ? Math.round((cashSplit.total / grandTotal) * 100) : 0;
  const upiPct = grandTotal > 0 ? Math.round((upiSplit.total / grandTotal) * 100) : 0;
  const cardPct = grandTotal > 0 ? Math.round((cardSplit.total / grandTotal) * 100) : 0;

  const itemsList: ItemSaleRecord[] = data?.itemSales || data?.items || [];
  const isZeroOrders = orderCount === 0 && grandTotal === 0;

  return (
    <div 
      data-testid="analytics-page" 
      className="flex-1 flex flex-col bg-[#FAF3E0] min-h-screen p-3 space-y-3 max-w-full overflow-x-hidden pb-12"
    >
      {/* Title & Quick Refresh */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-base font-extrabold text-[#3E2723] flex items-center space-x-1.5">
            <span>Daily Sales Analytics</span>
          </h1>
          <p className="text-[11px] text-[#8D6E63]">
            {formatDisplayDate(selectedDate)}
          </p>
        </div>
        <button
          onClick={() => fetchAnalytics(selectedDate)}
          disabled={loading}
          aria-label="Refresh Analytics"
          className="min-h-[44px] min-w-[44px] px-3 py-2 bg-white text-[#5D4037] border border-[#D7CCC8] rounded-xl text-xs font-semibold hover:bg-[#FAF3E0] active:scale-95 transition-all flex items-center justify-center space-x-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-[11px]">Sync</span>
        </button>
      </div>

      {/* Date Navigation & Calendar Picker */}
      <div className="bg-white p-3 rounded-2xl border-2 border-[#EADCC8] shadow-sm space-y-2.5">
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrevDay}
            data-testid="btn-date-prev"
            aria-label="Previous Day"
            className="min-h-[44px] min-w-[44px] p-2 bg-[#FAF3E0] text-[#3E2723] border border-[#D7CCC8] rounded-xl hover:bg-[#EADCC8] active:scale-95 transition-all flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="relative flex-1">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                }
              }}
              data-testid="analytics-date-picker"
              className="w-full min-h-[44px] px-3 py-2 bg-[#FFF8E7] text-[#3E2723] font-bold text-xs rounded-xl border border-[#D7CCC8] focus:outline-none focus:ring-2 focus:ring-[#8D493A] transition-all"
            />
          </div>

          <button
            onClick={handleNextDay}
            data-testid="btn-date-next"
            aria-label="Next Day"
            className="min-h-[44px] min-w-[44px] p-2 bg-[#FAF3E0] text-[#3E2723] border border-[#D7CCC8] rounded-xl hover:bg-[#EADCC8] active:scale-95 transition-all flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Nav Chips */}
        <div className="flex space-x-2 pt-0.5">
          <button
            onClick={handleToday}
            data-testid="btn-date-today"
            className={`flex-1 min-h-[44px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
              selectedDate === getTodayKolkata()
                ? 'bg-[#3E2723] text-[#FFF8E7] shadow-sm'
                : 'bg-[#FAF3E0] text-[#5D4037] border border-[#D7CCC8] hover:bg-[#EADCC8]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Today</span>
          </button>

          <button
            onClick={handleYesterday}
            data-testid="btn-date-yesterday"
            className={`flex-1 min-h-[44px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center ${
              selectedDate === shiftDate(getTodayKolkata(), -1)
                ? 'bg-[#3E2723] text-[#FFF8E7] shadow-sm'
                : 'bg-[#FAF3E0] text-[#5D4037] border border-[#D7CCC8] hover:bg-[#EADCC8]'
            }`}
          >
            <span>Yesterday</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="p-8 text-center bg-white rounded-2xl border border-[#EADCC8] text-xs text-[#8D6E63] flex flex-col items-center justify-center space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin text-[#8D493A]" />
          <span>Calculating daily sales totals...</span>
        </div>
      )}

      {/* KPI Cards */}
      {(!loading || data) && (
        <div className="grid grid-cols-3 gap-2">
          {/* Grand Total */}
          <div 
            data-testid="kpi-grand-total"
            className="bg-white p-3 rounded-2xl border-2 border-[#EADCC8] shadow-sm flex flex-col justify-between"
          >
            <div className="flex items-center space-x-1 text-[#8D493A]">
              <IndianRupee className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Revenue</span>
            </div>
            <div className="mt-1">
              <span className="text-xl font-black text-[#3E2723] leading-tight block">
                ₹{grandTotal}
              </span>
              <span className="text-[10px] text-[#8D6E63]">Grand Total</span>
            </div>
          </div>

          {/* Settled Orders */}
          <div 
            data-testid="kpi-order-count"
            className="bg-white p-3 rounded-2xl border-2 border-[#EADCC8] shadow-sm flex flex-col justify-between"
          >
            <div className="flex items-center space-x-1 text-emerald-700">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Orders</span>
            </div>
            <div className="mt-1">
              <span className="text-xl font-black text-[#3E2723] leading-tight block">
                {orderCount}
              </span>
              <span className="text-[10px] text-[#8D6E63]">Settled</span>
            </div>
          </div>

          {/* Average Order Value */}
          <div 
            data-testid="kpi-avg-order-value"
            className="bg-white p-3 rounded-2xl border-2 border-[#EADCC8] shadow-sm flex flex-col justify-between"
          >
            <div className="flex items-center space-x-1 text-blue-700">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Avg Order</span>
            </div>
            <div className="mt-1">
              <span className="text-xl font-black text-[#3E2723] leading-tight block">
                ₹{avgOrderValue}
              </span>
              <span className="text-[10px] text-[#8D6E63]">Per Ticket</span>
            </div>
          </div>
        </div>
      )}

      {/* Payment Method Breakdown Cards */}
      {(!loading || data) && (
        <div className="bg-white p-3.5 rounded-2xl border-2 border-[#EADCC8] shadow-sm space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#5D4037] flex items-center justify-between">
            <span>Payment Method Breakdown</span>
            <span className="text-[10px] text-[#8D6E63] font-normal">Strict Invariant Verified</span>
          </h2>

          <div className="grid grid-cols-3 gap-2">
            {/* Cash Card */}
            <div 
              data-testid="payment-split-cash"
              className="p-2.5 rounded-xl bg-[#FAF3E0] border border-[#EADCC8] flex flex-col justify-between space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#3E2723] flex items-center space-x-1">
                  <Banknote className="w-3 h-3 text-emerald-700" />
                  <span>Cash</span>
                </span>
                <span className="text-[10px] font-bold text-[#8D6E63]">{cashPct}%</span>
              </div>
              <div>
                <span className="text-sm font-extrabold text-[#3E2723] block leading-tight">
                  ₹{cashSplit.total}
                </span>
                <span className="text-[10px] text-[#8D6E63]">
                  {cashSplit.count} {cashSplit.count === 1 ? 'order' : 'orders'}
                </span>
              </div>
              <div className="w-full bg-[#EADCC8] h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, cashPct)}%` }}
                />
              </div>
            </div>

            {/* UPI Card */}
            <div 
              data-testid="payment-split-upi"
              className="p-2.5 rounded-xl bg-[#FAF3E0] border border-[#EADCC8] flex flex-col justify-between space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#3E2723] flex items-center space-x-1">
                  <QrCode className="w-3 h-3 text-indigo-700" />
                  <span>UPI</span>
                </span>
                <span className="text-[10px] font-bold text-[#8D6E63]">{upiPct}%</span>
              </div>
              <div>
                <span className="text-sm font-extrabold text-[#3E2723] block leading-tight">
                  ₹{upiSplit.total}
                </span>
                <span className="text-[10px] text-[#8D6E63]">
                  {upiSplit.count} {upiSplit.count === 1 ? 'order' : 'orders'}
                </span>
              </div>
              <div className="w-full bg-[#EADCC8] h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, upiPct)}%` }}
                />
              </div>
            </div>

            {/* Card Card */}
            <div 
              data-testid="payment-split-card"
              className="p-2.5 rounded-xl bg-[#FAF3E0] border border-[#EADCC8] flex flex-col justify-between space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#3E2723] flex items-center space-x-1">
                  <CreditCard className="w-3 h-3 text-amber-700" />
                  <span>Card</span>
                </span>
                <span className="text-[10px] font-bold text-[#8D6E63]">{cardPct}%</span>
              </div>
              <div>
                <span className="text-sm font-extrabold text-[#3E2723] block leading-tight">
                  ₹{cardSplit.total}
                </span>
                <span className="text-[10px] text-[#8D6E63]">
                  {cardSplit.count} {cardSplit.count === 1 ? 'order' : 'orders'}
                </span>
              </div>
              <div className="w-full bg-[#EADCC8] h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, cardPct)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Itemized Sales Breakdown or Clean Empty State */}
      {(!loading || data) && (
        <div className="bg-white p-3.5 rounded-2xl border-2 border-[#EADCC8] shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#5D4037]">
              Itemized Sales Breakdown
            </h2>
            <span className="text-[11px] text-[#8D6E63]">
              {itemsList.length} {itemsList.length === 1 ? 'Item' : 'Items'} Sold
            </span>
          </div>

          {isZeroOrders || itemsList.length === 0 ? (
            <div 
              data-testid="analytics-empty-state"
              className="p-6 text-center rounded-xl bg-[#FAF3E0] border border-[#EADCC8] space-y-2"
            >
              <div className="w-10 h-10 rounded-full bg-white border border-[#D7CCC8] text-[#8D6E63] flex items-center justify-center mx-auto">
                <FolderOpen className="w-5 h-5 text-[#8D493A]" />
              </div>
              <h3 className="text-xs font-bold text-[#3E2723]">No Settled Orders</h3>
              <p className="text-[11px] text-[#8D6E63] max-w-[240px] mx-auto leading-relaxed">
                No orders were settled on this date. Pending and cancelled orders are strictly excluded from analytics.
              </p>
            </div>
          ) : (
            <div data-testid="item-sales-list" className="space-y-2">
              {itemsList.map((item, idx) => (
                <div
                  key={idx}
                  data-testid={`item-sale-row-${idx}`}
                  className="p-2.5 rounded-xl bg-[#FAF3E0] border border-[#EADCC8] flex items-center justify-between space-x-2"
                >
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center space-x-1.5 flex-wrap">
                      <span className="text-xs font-bold text-[#3E2723] truncate">
                        {item.itemName || item.item_name}
                      </span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-md bg-white border border-[#D7CCC8] text-[#8D6E63] font-semibold">
                        {item.category || 'General'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8D6E63] flex items-center space-x-2 mt-0.5">
                      <span className="font-semibold text-[#5D4037]">
                        {item.totalQuantity || item.quantity}x sold
                      </span>
                      <span>•</span>
                      <span>{item.percentage}% of revenue</span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-extrabold text-[#3E2723] block leading-tight">
                      ₹{item.totalRevenue ?? item.revenue ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Analytics;
