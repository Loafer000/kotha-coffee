import React from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import type { Order } from '../services/api.js';

interface OrderSlipProps {
  order: Order | null;
  onNextOrder: () => void;
  onViewPending?: () => void;
}

export const OrderSlip: React.FC<OrderSlipProps> = ({
  order,
  onNextOrder,
  onViewPending
}) => {
  if (!order) return null;

  const orderNum = order.daily_order_number || order.dailyOrderNumber || order.order_number || 1;
  const total = order.total_amount || order.totalAmount || 0;
  const payment = order.payment_method || order.paymentMethod || 'Cash';
  const items = order.items || [];

  const hasParcel = items.some((it) => it.is_parcel || it.isParcel);

  return (
    <div 
      data-testid="order-confirmation-slip"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-[360px] bg-[#FFF8E7] rounded-3xl p-6 shadow-2xl border-2 border-[#8D493A]/40 text-center relative flex flex-col items-center">
        
        {/* Success Badge */}
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mb-2 shadow-sm">
          <CheckCircle2 className="w-7 h-7" />
        </div>

        <p className="text-xs font-semibold tracking-wider uppercase text-[#8D493A]">
          Order Created Successfully
        </p>

        {/* Paper Slip Instruction Notice */}
        <p className="text-[11px] text-[#5D4037] mt-0.5 mb-2">
          Write this number on the customer paper slip:
        </p>

        {/* Huge Order Number */}
        <div className="my-2 py-3 px-6 bg-white rounded-2xl border-2 border-[#3E2723] shadow-inner w-full flex items-center justify-center">
          <span className="text-6xl font-black text-[#3E2723] tracking-tighter">
            #{orderNum}
          </span>
        </div>

        {hasParcel && (
          <span className="my-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-orange-600 text-white shadow-xs">
            📦 Takeaway / Parcel Order
          </span>
        )}

        {/* Order Details & Items Snapshot */}
        <div className="w-full bg-[#FAF3E0] rounded-xl p-3 my-2 text-left border border-[#EADCC8] text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-[#D7CCC8] font-medium text-[#3E2723]">
            <span>Payment: <strong className="text-[#8D493A]">{payment}</strong></span>
            <span>Total: <strong className="text-base text-[#3E2723]">₹{total}</strong></span>
          </div>
          
          <div className="mt-2 max-h-[110px] overflow-y-auto space-y-1 pr-1 text-[#5D4037]">
            {items.map((it, idx) => {
              const itIsParcel = Boolean(it.is_parcel || it.isParcel);
              return (
                <div key={idx} className="flex justify-between items-center text-[11px]">
                  <span className="truncate max-w-[190px] flex items-center space-x-1">
                    <span>{it.quantity}x {it.item_name || it.name}</span>
                    {itIsParcel && (
                      <span className="text-[9px] font-black text-orange-600 ml-1">
                        [Parcel]
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[#3E2723] font-semibold">
                    ₹{it.subtotal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-2 mt-1">
          <button
            onClick={onNextOrder}
            data-testid="btn-next-order"
            className="w-full min-h-[48px] py-3 px-4 bg-[#3E2723] text-[#FFF8E7] font-bold text-base rounded-xl hover:bg-[#4E342E] active:scale-[0.98] transition-all shadow flex items-center justify-center space-x-2"
          >
            <span>Next Order</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          {onViewPending && (
            <button
              onClick={onViewPending}
              data-testid="btn-view-pending"
              className="w-full min-h-[44px] py-2 px-3 bg-transparent text-[#5D4037] hover:text-[#3E2723] font-semibold text-xs rounded-xl hover:bg-[#FAF3E0] transition-colors"
            >
              View in Pending Queue
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
