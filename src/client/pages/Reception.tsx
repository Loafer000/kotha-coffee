import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Clock, 
  CheckCircle, 
  Utensils, 
  BarChart3, 
  RefreshCw, 
  Edit3, 
  Check, 
  Trash2, 
  AlertTriangle, 
  X, 
  Plus, 
  Minus,
  KeyRound 
} from 'lucide-react';
import { 
  getStoredToken, 
  getOrders, 
  updateOrder, 
  settleOrder, 
  cancelOrder, 
  type Order, 
  type UpdateOrderInput 
} from '../services/api.js';
import { PinModal } from '../components/PinModal.js';
import { ChangePinModal } from '../components/ChangePinModal.js';
import { OrderCreate } from '../components/OrderCreate.js';
import { OrderSlip } from '../components/OrderSlip.js';
import { MenuAdmin } from './MenuAdmin.js';
import { Analytics } from './Analytics.js';

type Tab = 'create' | 'pending' | 'settled' | 'menu' | 'analytics';

export const Reception: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [showChangePinModal, setShowChangePinModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<Tab>('create');

  // Orders State
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [settledOrders, setSettledOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);

  // Placed Order Confirmation Modal
  const [confirmationOrder, setConfirmationOrder] = useState<Order | null>(null);

  // Edit Order State
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState<Array<{ name: string; unitPrice: number; quantity: number }>>([]);
  const [editPayment, setEditPayment] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editSaving, setEditSaving] = useState<boolean>(false);

  // Cancel Confirmation State
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);

  useEffect(() => {
    const existing = getStoredToken();
    if (existing) {
      setToken(existing);
    } else {
      setShowPinModal(true);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadOrders();
      const interval = setInterval(loadOrders, 5000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const loadOrders = async () => {
    if (!token) return;
    setLoadingOrders(true);
    try {
      const [pending, settled] = await Promise.all([
        getOrders({ status: 'PENDING' }, token),
        getOrders({ status: 'SETTLED' }, token)
      ]);
      setPendingOrders(pending);
      setSettledOrders(settled);
    } catch (err: any) {
      if (err.message && err.message.includes('Unauthorized')) {
        setToken(null);
        setShowPinModal(true);
      }
    } finally {
      setLoadingOrders(false);
    }
  };

  const handlePinSuccess = (newToken: string) => {
    setToken(newToken);
    setShowPinModal(false);
  };

  const handleOrderPlaced = (order: Order) => {
    setConfirmationOrder(order);
    loadOrders();
  };

  const handleMarkDone = async (orderId: string) => {
    if (!token) return;
    setOrderActionError(null);
    try {
      await settleOrder(orderId, token);
      await loadOrders();
    } catch (err: any) {
      setOrderActionError(err.message || 'Failed to settle order');
    }
  };

  const startEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditPayment(order.payment_method || order.paymentMethod || 'Cash');
    setEditNotes(order.notes || '');
    setEditItems(
      (order.items || []).map((it) => ({
        name: it.item_name || it.name,
        unitPrice: Number(it.unit_price || it.unitPrice || 0),
        quantity: Number(it.quantity || it.qty || 1)
      }))
    );
  };

  const handleSaveEdit = async () => {
    if (!editingOrder || !token) return;
    setEditSaving(true);
    setOrderActionError(null);
    try {
      const payload: UpdateOrderInput = {
        paymentMethod: editPayment,
        notes: editNotes.trim() || undefined,
        items: editItems.map((it) => ({
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity
        }))
      };
      await updateOrder(editingOrder.id, payload, token);
      setEditingOrder(null);
      await loadOrders();
    } catch (err: any) {
      setOrderActionError(err.message || 'Failed to save order edits');
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingOrderId || !token) return;
    setCancelLoading(true);
    setOrderActionError(null);
    try {
      await cancelOrder(cancellingOrderId, token);
      setCancellingOrderId(null);
      await loadOrders();
    } catch (err: any) {
      setOrderActionError(err.message || 'Failed to cancel order');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#FAF3E0] min-h-screen">
      {/* PIN Gatekeeper Modal */}
      <PinModal
        isOpen={showPinModal && !token}
        onSuccess={handlePinSuccess}
        onCancel={() => setShowPinModal(false)}
      />

      {/* Large Order Slip Confirmation Modal */}
      <OrderSlip
        order={confirmationOrder}
        onNextOrder={() => setConfirmationOrder(null)}
        onViewPending={() => {
          setConfirmationOrder(null);
          setActiveTab('pending');
        }}
      />

      {/* Change PIN Modal */}
      <ChangePinModal
        isOpen={showChangePinModal}
        onClose={() => setShowChangePinModal(false)}
      />

      {/* Tab Switcher Header */}
      <div className="bg-[#3E2723] text-[#FFF8E7] px-2 py-1.5 shadow-md flex items-center justify-between overflow-x-auto no-scrollbar space-x-1 border-b border-[#2C1810]">
        <button
          onClick={() => setActiveTab('create')}
          data-testid="tab-create-order"
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
            activeTab === 'create'
              ? 'bg-[#FAF3E0] text-[#3E2723] shadow-sm'
              : 'text-[#FFF8E7]/80 hover:text-white hover:bg-[#4E342E]'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add Order</span>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          data-testid="tab-pending"
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
            activeTab === 'pending'
              ? 'bg-[#FAF3E0] text-[#3E2723] shadow-sm'
              : 'text-[#FFF8E7]/80 hover:text-white hover:bg-[#4E342E]'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Pending ({pendingOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settled')}
          data-testid="tab-settled"
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
            activeTab === 'settled'
              ? 'bg-[#FAF3E0] text-[#3E2723] shadow-sm'
              : 'text-[#FFF8E7]/80 hover:text-white hover:bg-[#4E342E]'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>Settled</span>
        </button>

        <button
          onClick={() => setActiveTab('menu')}
          data-testid="tab-menu"
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
            activeTab === 'menu'
              ? 'bg-[#FAF3E0] text-[#3E2723] shadow-sm'
              : 'text-[#FFF8E7]/80 hover:text-white hover:bg-[#4E342E]'
          }`}
        >
          <Utensils className="w-4 h-4" />
          <span>Menu</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          data-testid="tab-analytics"
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
            activeTab === 'analytics'
              ? 'bg-[#FAF3E0] text-[#3E2723] shadow-sm'
              : 'text-[#FFF8E7]/80 hover:text-white hover:bg-[#4E342E]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Analytics</span>
        </button>

        <button
          onClick={() => setShowChangePinModal(true)}
          title="Change Reception PIN"
          data-testid="btn-change-pin"
          className="min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap text-[#FFF8E7]/80 hover:text-amber-300 hover:bg-[#4E342E] transition-all flex items-center justify-center flex-shrink-0"
        >
          <KeyRound className="w-4 h-4" />
        </button>
      </div>

      {orderActionError && (
        <div className="m-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex justify-between items-center">
          <span>{orderActionError}</span>
          <button onClick={() => setOrderActionError(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* Tab 1: Create Order POS */}
      {activeTab === 'create' && (
        <div className="flex-1 flex flex-col">
          <OrderCreate onOrderPlaced={handleOrderPlaced} />
        </div>
      )}

      {/* Tab 2: Pending Orders Queue */}
      {activeTab === 'pending' && (
        <div data-testid="pending-queue" className="flex-1 p-3 space-y-3 pb-8">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-sm font-bold text-[#3E2723]">
              Active Pending Orders ({pendingOrders.length})
            </h2>
            <button
              onClick={loadOrders}
              className="text-xs text-[#5D4037] hover:text-[#3E2723] flex items-center space-x-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div data-testid="orders-list" className="space-y-3">
            {pendingOrders.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-[#EADCC8] text-xs text-[#8D6E63]">
                No pending orders. All orders are settled or new orders haven't arrived.
              </div>
            ) : (
              pendingOrders.map((order) => {
                const orderNum = order.daily_order_number || order.dailyOrderNumber || order.order_number || 1;
                const total = order.total_amount || order.totalAmount || 0;
                const payment = order.payment_method || order.paymentMethod || 'Cash';
                const items = order.items || [];

                return (
                  <div
                    key={order.id}
                    data-testid={`order-card-${order.id}`}
                    className="order-card p-4 rounded-2xl bg-white border-2 border-[#EADCC8] shadow-sm flex flex-col justify-between space-y-3"
                  >
                    {/* Header: Order Number and Total */}
                    <div className="flex justify-between items-start border-b border-[#F5EBE1] pb-2">
                      <div className="flex items-baseline space-x-2">
                        <span className="text-2xl font-black text-[#3E2723]">
                          #{orderNum}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                          Pending
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-extrabold text-[#3E2723]">
                          ₹{total}
                        </span>
                        <span className="block text-[10px] text-[#8D6E63]">
                          via {payment}
                        </span>
                      </div>
                    </div>

                    {/* Line Items List */}
                    <div className="space-y-1 text-xs text-[#5D4037]">
                      {items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[12px]">
                          <span className="font-medium text-[#3E2723]">
                            {it.quantity}x {it.item_name || it.name}
                          </span>
                          <span className="font-mono text-[11px] text-[#8D6E63]">
                            ₹{it.subtotal}
                          </span>
                        </div>
                      ))}
                      {order.notes && (
                        <p className="text-[11px] italic text-[#8D493A] mt-1 bg-[#FAF3E0] p-1.5 rounded-lg border border-[#EADCC8]">
                          Note: {order.notes}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons: Done, Edit, Cancel */}
                    <div className="flex items-center space-x-2 pt-2 border-t border-[#F5EBE1]">
                      <button
                        onClick={() => handleMarkDone(order.id)}
                        data-testid={`btn-done-${order.id}`}
                        className="flex-1 min-h-[44px] py-2 px-3 bg-emerald-700 text-white rounded-xl font-bold text-xs hover:bg-emerald-800 active:scale-95 transition-all shadow-sm flex items-center justify-center space-x-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>Done</span>
                      </button>

                      <button
                        onClick={() => startEditOrder(order)}
                        data-testid={`btn-edit-${order.id}`}
                        className="min-h-[44px] px-3.5 py-2 bg-[#FAF3E0] text-[#3E2723] rounded-xl font-semibold text-xs border border-[#D7CCC8] hover:bg-[#EADCC8] active:scale-95 transition-all flex items-center justify-center space-x-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => setCancellingOrderId(order.id)}
                        data-testid={`btn-cancel-${order.id}`}
                        className="min-w-[44px] min-h-[44px] p-2.5 bg-rose-50 text-rose-700 rounded-xl font-semibold text-xs border border-rose-200 hover:bg-rose-100 active:scale-95 transition-all flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Settled Orders Queue */}
      {activeTab === 'settled' && (
        <div data-testid="settled-queue" className="flex-1 p-3 space-y-3 pb-8">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-sm font-bold text-[#3E2723]">
              Today's Settled Orders ({settledOrders.length})
            </h2>
            <button
              onClick={loadOrders}
              className="text-xs text-[#5D4037] hover:text-[#3E2723] flex items-center space-x-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="space-y-3">
            {settledOrders.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-[#EADCC8] text-xs text-[#8D6E63]">
                No settled orders recorded for today yet.
              </div>
            ) : (
              settledOrders.map((order) => {
                const orderNum = order.daily_order_number || order.dailyOrderNumber || order.order_number || 1;
                const total = order.total_amount || order.totalAmount || 0;
                const payment = order.payment_method || order.paymentMethod || 'Cash';
                const items = order.items || [];

                return (
                  <div
                    key={order.id}
                    data-testid={`order-card-${order.id}`}
                    className="order-card p-4 rounded-2xl bg-white border border-[#EADCC8] shadow-sm flex flex-col justify-between space-y-2 opacity-90"
                  >
                    <div className="flex justify-between items-center border-b border-[#F5EBE1] pb-2">
                      <div className="flex items-baseline space-x-2">
                        <span className="text-xl font-bold text-[#3E2723]">
                          #{orderNum}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Settled
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-[#3E2723]">
                          ₹{total}
                        </span>
                        <span className="block text-[10px] text-[#8D6E63]">
                          {payment}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-0.5 text-xs text-[#5D4037]">
                      {items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[11px]">
                          <span>
                            {it.quantity}x {it.item_name || it.name}
                          </span>
                          <span className="font-mono">
                            ₹{it.subtotal}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Menu Management */}
      {activeTab === 'menu' && (
        <div className="flex-1 flex flex-col">
          <MenuAdmin />
        </div>
      )}

      {/* Tab 5: Analytics Dashboard */}
      {activeTab === 'analytics' && (
        <Analytics token={token} />
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[360px] bg-white rounded-3xl p-5 shadow-2xl border border-[#EADCC8] flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-[#3E2723]">
                Edit Order #{editingOrder.daily_order_number || editingOrder.order_number}
              </h3>
              <button 
                onClick={() => setEditingOrder(null)}
                className="w-11 h-11 min-w-[44px] min-h-[44px] p-2 rounded-full text-[#8D6E63] hover:bg-[#FAF3E0] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items Steppers */}
            <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1">
              {editItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-[#FAF3E0] p-2 rounded-xl text-xs">
                  <div className="flex-1 pr-2">
                    <p className="font-bold text-[#3E2723] leading-tight">{item.name}</p>
                    <p className="text-[10px] text-[#8D493A]">₹{item.unitPrice} each</p>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...editItems];
                        if (next[idx].quantity > 1) {
                          next[idx].quantity -= 1;
                          setEditItems(next);
                        }
                      }}
                      className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-white border border-[#D7CCC8] text-[#3E2723] font-bold flex items-center justify-center active:scale-95 text-sm"
                    >
                      -
                    </button>
                    <span className="font-bold text-xs px-1 min-w-[16px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      data-testid="qty-plus"
                      onClick={() => {
                        const next = [...editItems];
                        next[idx].quantity += 1;
                        setEditItems(next);
                      }}
                      className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-[#3E2723] text-white font-bold flex items-center justify-center active:scale-95 text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment Method Selector in Edit Modal */}
            <div>
              <label className="block text-xs font-semibold text-[#5D4037] mb-1">
                Payment Method:
              </label>
              <div className="flex space-x-1.5">
                {(['Cash', 'UPI', 'Card'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEditPayment(m)}
                    className={`flex-1 min-h-[44px] py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center ${
                      editPayment === m
                        ? 'bg-[#3E2723] text-[#FFF8E7] border-[#3E2723]'
                        : 'bg-[#FAF3E0] text-[#5D4037] border-[#D7CCC8]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Recalculated Total Preview */}
            <div className="flex justify-between items-center bg-[#FAF3E0] p-2.5 rounded-xl border border-[#EADCC8]">
              <span className="text-xs font-semibold text-[#5D4037]">Recalculated Total:</span>
              <span className="text-base font-extrabold text-[#3E2723]">
                ₹{editItems.reduce((sum, it) => sum + (it.unitPrice * it.quantity), 0)}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-[#D7CCC8] text-xs font-semibold text-[#5D4037] hover:bg-[#FAF3E0] flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[#3E2723] text-[#FFF8E7] text-xs font-bold hover:bg-[#4E342E] shadow flex items-center justify-center"
              >
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Confirmation Modal */}
      {cancellingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[320px] bg-white rounded-3xl p-5 shadow-2xl border border-[#EADCC8] text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-[#3E2723] text-base">Cancel this order?</h3>
            <p className="text-xs text-[#5D4037]">
              This will cancel the order ticket and strictly exclude it from daily analytics.
            </p>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setCancellingOrderId(null)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-[#D7CCC8] text-xs font-semibold text-[#5D4037] hover:bg-[#FAF3E0] flex items-center justify-center"
              >
                No, Keep
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={cancelLoading}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 shadow flex items-center justify-center"
              >
                {cancelLoading ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
