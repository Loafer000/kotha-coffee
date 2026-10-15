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
  KeyRound,
  Banknote,
  QrCode,
  CreditCard,
  Search
} from 'lucide-react';
import { 
  getStoredToken, 
  getOrders, 
  updateOrder, 
  settleOrder, 
  cancelOrder, 
  getMenuItems,
  type Order, 
  type MenuItem,
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
  const [menuCatalog, setMenuCatalog] = useState<MenuItem[]>([]);
  const [editItemSearch, setEditItemSearch] = useState<string>('');
  const [editCategoryFilter, setEditCategoryFilter] = useState<string>('All');

  // Settle Payment Selection Modal
  const [settlingOrder, setSettlingOrder] = useState<Order | null>(null);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState<'Cash' | 'UPI'>('Cash');
  const [settlingLoading, setSettlingLoading] = useState<boolean>(false);

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
    // Load full menu catalog for edit order options
    getMenuItems().then(items => setMenuCatalog(items)).catch(() => {});
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

  const handleMarkDone = (order: Order) => {
    // Open payment selection modal at the moment order is marked done
    setSettlingOrder(order);
    const existing = order.payment_method || order.paymentMethod;
    setSettlePaymentMethod(existing === 'UPI' ? 'UPI' : 'Cash');
  };

  const handleCompleteSettle = async (orderId: string, paymentMethod: 'Cash' | 'UPI' | 'Card') => {
    if (!token) return;
    setSettlingLoading(true);
    setOrderActionError(null);
    try {
      await settleOrder(orderId, token, paymentMethod);
      setSettlingOrder(null);
      await loadOrders();
    } catch (err: any) {
      setOrderActionError(err.message || 'Failed to settle order');
    } finally {
      setSettlingLoading(false);
    }
  };

  const startEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditPayment(order.payment_method || order.paymentMethod || 'Cash');
    setEditNotes(order.notes || '');
    setEditItemSearch('');
    setEditCategoryFilter('All');
    setEditItems(
      (order.items || []).map((it) => ({
        name: it.item_name || it.name,
        unitPrice: Number(it.unit_price || it.unitPrice || 0),
        quantity: Number(it.quantity || it.qty || 1)
      }))
    );
  };

  const handleAddItemToEdit = (menuItem: MenuItem) => {
    setEditItems((prev) => {
      const idx = prev.findIndex((it) => it.name.toLowerCase() === menuItem.name.toLowerCase());
      if (idx >= 0) {
        const next = [...prev];
        next[idx].quantity += 1;
        return next;
      }
      return [...prev, { name: menuItem.name, unitPrice: menuItem.price, quantity: 1 }];
    });
  };

  const handleRemoveItemFromEdit = (index: number) => {
    setEditItems((prev) => prev.filter((_, idx) => idx !== index));
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
                        onClick={() => handleMarkDone(order)}
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

      {/* Edit Order Modal with All Menu Options */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[420px] max-h-[90vh] bg-white rounded-3xl p-4 shadow-2xl border-2 border-[#EADCC8] flex flex-col space-y-3 overflow-hidden">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[#F5EBE1] pb-2">
              <div>
                <h3 className="font-bold text-sm text-[#3E2723]">
                  Edit Order #{editingOrder.daily_order_number || editingOrder.order_number}
                </h3>
                <span className="text-[11px] text-[#8D6E63]">
                  Modify quantities or add any items from the menu
                </span>
              </div>
              <button 
                onClick={() => setEditingOrder(null)}
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full text-[#8D6E63] hover:bg-[#FAF3E0] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              
              {/* Section 1: Items Currently in Order */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8D493A] block mb-1.5">
                  Items in Order ({editItems.length})
                </span>

                {editItems.length === 0 ? (
                  <p className="text-xs text-[#8D6E63] italic py-2">
                    No items in order. Select items below to add.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {editItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-[#FAF3E0] p-2 rounded-xl text-xs border border-[#EADCC8]">
                        <div className="flex-1 pr-2">
                          <p className="font-bold text-[#3E2723] leading-tight">{item.name}</p>
                          <p className="text-[10px] text-[#8D493A]">₹{item.unitPrice} each • Subtotal: ₹{item.unitPrice * item.quantity}</p>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...editItems];
                              if (next[idx].quantity > 1) {
                                next[idx].quantity -= 1;
                                setEditItems(next);
                              } else {
                                handleRemoveItemFromEdit(idx);
                              }
                            }}
                            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg bg-white border border-[#D7CCC8] text-[#3E2723] font-bold flex items-center justify-center active:scale-95 text-xs"
                          >
                            -
                          </button>
                          <span className="font-bold text-xs px-1 min-w-[16px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...editItems];
                              next[idx].quantity += 1;
                              setEditItems(next);
                            }}
                            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg bg-[#3E2723] text-white font-bold flex items-center justify-center active:scale-95 text-xs"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItemFromEdit(idx)}
                            title="Remove item"
                            className="w-9 h-9 min-w-[36px] min-h-[36px] text-rose-600 hover:bg-rose-50 rounded-lg flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Add More Items From Entire Menu Catalog */}
              <div className="pt-2 border-t border-[#F5EBE1]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5D4037] block mb-1.5">
                  Add Any Item From Menu:
                </span>

                {/* Search Bar */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#8D6E63]" />
                  <input
                    type="text"
                    value={editItemSearch}
                    onChange={(e) => setEditItemSearch(e.target.value)}
                    placeholder="Search all items (Coffee, Maggi, Shakes...)"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF3E0]/60 border border-[#D7CCC8] rounded-xl focus:outline-none focus:border-[#3E2723]"
                  />
                </div>

                {/* Category Pills */}
                <div className="flex space-x-1 overflow-x-auto no-scrollbar pb-1.5 mb-2">
                  {['All', ...Array.from(new Set(menuCatalog.map((m) => m.category)))].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditCategoryFilter(cat)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-all ${
                        editCategoryFilter === cat
                          ? 'bg-[#3E2723] text-[#FFF8E7]'
                          : 'bg-[#FAF3E0] text-[#5D4037] hover:bg-[#EADCC8]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Catalog Items List with + Add buttons */}
                <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1">
                  {menuCatalog
                    .filter((m) => {
                      const matchesCat = editCategoryFilter === 'All' || m.category === editCategoryFilter;
                      const matchesSearch = !editItemSearch.trim() || m.name.toLowerCase().includes(editItemSearch.toLowerCase());
                      return matchesCat && matchesSearch;
                    })
                    .map((item) => {
                      const alreadyIn = editItems.find((it) => it.name.toLowerCase() === item.name.toLowerCase());
                      return (
                        <div 
                          key={item.id}
                          className="flex justify-between items-center bg-white p-2 rounded-xl border border-[#EADCC8] text-xs hover:border-[#8D6E63] transition-all"
                        >
                          <div className="flex-1 pr-2">
                            <span className="font-semibold text-[#3E2723] block leading-tight">{item.name}</span>
                            <span className="text-[10px] text-[#8D493A] font-bold">₹{item.price} • {item.category}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddItemToEdit(item)}
                            className="min-h-[36px] px-3 py-1 bg-[#FAF3E0] hover:bg-[#3E2723] hover:text-[#FFF8E7] text-[#3E2723] font-bold text-xs rounded-xl border border-[#D7CCC8] transition-all flex items-center space-x-1 active:scale-95 shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{alreadyIn ? `+1 (${alreadyIn.quantity})` : 'Add'}</span>
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Order Notes */}
              <div className="pt-1">
                <label className="block text-[11px] font-semibold text-[#5D4037] mb-1">
                  Special Notes / Customer Requests:
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Less sugar, extra crispy..."
                  className="w-full px-3 py-1.5 text-xs bg-[#FAF3E0]/50 border border-[#D7CCC8] rounded-xl focus:outline-none"
                />
              </div>
            </div>

            {/* Recalculated Total Preview */}
            <div className="flex justify-between items-center bg-[#FAF3E0] p-2.5 rounded-xl border border-[#EADCC8]">
              <span className="text-xs font-semibold text-[#5D4037]">Updated Total:</span>
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
                disabled={editSaving || editItems.length === 0}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[#3E2723] text-[#FFF8E7] text-xs font-bold hover:bg-[#4E342E] shadow flex items-center justify-center disabled:opacity-40"
              >
                {editSaving ? 'Saving...' : 'Save Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Order Payment Method Modal (Choose payment and confirm with tick mark submit) */}
      {settlingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[340px] bg-white rounded-3xl p-5 shadow-2xl border-2 border-[#EADCC8] text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-[#3E2723]">
                Confirm Order #{settlingOrder.daily_order_number || settlingOrder.dailyOrderNumber || settlingOrder.order_number}
              </h3>
              <p className="text-xs text-[#5D4037] mt-0.5">
                Select payment method and confirm:
              </p>
              <div className="mt-2 py-2 px-5 bg-[#FAF3E0] rounded-xl border border-[#EADCC8] inline-block">
                <span className="text-2xl font-black text-[#3E2723]">
                  ₹{settlingOrder.total_amount || settlingOrder.totalAmount}
                </span>
              </div>
            </div>

            {/* Payment Method Selector: Cash or UPI only (Card removed) */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setSettlePaymentMethod('Cash')}
                data-testid="settle-pay-cash"
                className={`py-3 px-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center space-y-1.5 transition-all active:scale-95 ${
                  settlePaymentMethod === 'Cash'
                    ? 'bg-[#3E2723] text-[#FFF8E7] border-[#3E2723] shadow-md ring-2 ring-[#3E2723]/20'
                    : 'bg-[#FAF3E0] text-[#5D4037] border-[#D7CCC8] hover:bg-[#EADCC8]'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Banknote className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm">Cash</span>
                </div>
                {settlePaymentMethod === 'Cash' && (
                  <span className="text-[10px] text-emerald-300 font-semibold flex items-center">
                    <Check className="w-3 h-3 mr-0.5 stroke-[2.5]" /> Selected
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSettlePaymentMethod('UPI')}
                data-testid="settle-pay-upi"
                className={`py-3 px-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center space-y-1.5 transition-all active:scale-95 ${
                  settlePaymentMethod === 'UPI'
                    ? 'bg-[#3E2723] text-[#FFF8E7] border-[#3E2723] shadow-md ring-2 ring-[#3E2723]/20'
                    : 'bg-[#FAF3E0] text-[#5D4037] border-[#D7CCC8] hover:bg-[#EADCC8]'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <QrCode className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm">UPI</span>
                </div>
                {settlePaymentMethod === 'UPI' && (
                  <span className="text-[10px] text-emerald-300 font-semibold flex items-center">
                    <Check className="w-3 h-3 mr-0.5 stroke-[2.5]" /> Selected
                  </span>
                )}
              </button>
            </div>

            {/* Tick Mark Submit Button */}
            <button
              type="button"
              onClick={() => handleCompleteSettle(settlingOrder.id, settlePaymentMethod)}
              disabled={settlingLoading}
              data-testid="settle-submit-btn"
              className="w-full min-h-[48px] py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 shadow-md transition-all disabled:opacity-50"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>{settlingLoading ? 'Submitting...' : '✓ Submit'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSettlingOrder(null)}
              disabled={settlingLoading}
              className="w-full min-h-[36px] text-xs text-[#8D6E63] hover:text-[#3E2723] font-semibold py-1 transition-colors"
            >
              Cancel
            </button>
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
