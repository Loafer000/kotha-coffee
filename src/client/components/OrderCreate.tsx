import React, { useState, useEffect } from 'react';
import { Plus, Minus, Search, ShoppingBag, CreditCard, Banknote, QrCode } from 'lucide-react';
import { getMenuItems, createOrder, type MenuItem, type Order } from '../services/api.js';

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

interface OrderCreateProps {
  onOrderPlaced: (order: Order) => void;
}

export const OrderCreate: React.FC<OrderCreateProps> = ({ onOrderPlaced }) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart state
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const categories = ['All', 'Drinks', 'Snacks', 'Pasta', 'Sandwich', 'Mocktails', 'Ice Cream'];

  useEffect(() => {
    loadMenu();
  }, []);

  const loadMenu = async () => {
    setLoading(true);
    try {
      const items = await getMenuItems();
      setMenuItems(items);
    } catch (err: any) {
      setError(err.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  const addItemToCart = (item: MenuItem) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (existing) {
        next.set(item.id, { ...existing, quantity: existing.quantity + 1 });
      } else {
        next.set(item.id, {
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          quantity: 1
        });
      }
      return next;
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        next.delete(itemId);
      } else {
        next.set(itemId, { ...existing, quantity: nextQty });
      }
      return next;
    });
  };

  // Filter items
  const filteredItems = menuItems.filter((item) => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Calculate cart totals
  const cartItems = Array.from(cart.values());
  const totalItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSubmitOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (cartItems.length === 0) {
      setError('Please select at least one item');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        items: cartItems.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          unitPrice: item.price,
          quantity: item.quantity
        })),
        paymentMethod,
        notes: notes.trim() || undefined
      };

      const createdOrder = await createOrder(payload);
      // Reset cart and notify
      setCart(new Map());
      setNotes('');
      onOrderPlaced(createdOrder);
    } catch (err: any) {
      setError(err.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-28">
      {/* Category Filter Pills (Horizontal Scroll) */}
      <div className="bg-[#FAF3E0] px-3 py-2 border-b border-[#EADCC8] overflow-x-auto no-scrollbar flex space-x-2 flex-shrink-0">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-sm flex items-center justify-center ${
              selectedCategory === cat
                ? 'bg-[#3E2723] text-[#FFF8E7]'
                : 'bg-white text-[#5D4037] border border-[#D7CCC8] hover:bg-[#FFF8E7]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search Input Bar */}
      <div className="px-3 py-2 bg-white border-b border-[#EADCC8] flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[#8D6E63]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search coffee, momos, shakes..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF3E0]/50 border border-[#D7CCC8] rounded-xl focus:outline-none focus:border-[#3E2723]"
          />
        </div>
      </div>

      {error && (
        <div className="m-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* Menu Item Grid / List */}
      <div className="p-3 space-y-2 flex-1">
        {loading ? (
          <div className="py-12 text-center text-xs text-[#8D6E63]">
            Loading menu items...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#8D6E63]">
            No menu items found.
          </div>
        ) : (
          filteredItems.map((item) => {
            const inCart = cart.get(item.id);
            const qty = inCart ? inCart.quantity : 0;

            return (
              <div
                key={item.id}
                data-testid={`item-${item.id}`}
                className={`menu-item-card p-3 rounded-2xl bg-white border transition-all flex items-center justify-between ${
                  qty > 0
                    ? 'border-[#3E2723] shadow-sm bg-[#FFFDF9]'
                    : 'border-[#EADCC8] hover:border-[#8D6E63]'
                }`}
              >
                {/* Item Details */}
                <div 
                  onClick={() => addItemToCart(item)}
                  className="flex-1 pr-3 cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-sm text-[#3E2723] leading-snug">
                      {item.name}
                    </h3>
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs font-bold text-[#8D493A]">
                      ₹{item.price}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-[#8D6E63] px-1.5 py-0.5 rounded bg-[#FAF3E0]">
                      {item.category}
                    </span>
                  </div>
                </div>

                {/* Counter Steppers or Add Button */}
                <div>
                  {qty === 0 ? (
                    <button
                      onClick={() => addItemToCart(item)}
                      className="min-h-[44px] min-w-[70px] px-3 py-2 bg-[#FAF3E0] hover:bg-[#3E2723] hover:text-[#FFF8E7] text-[#3E2723] text-xs font-bold rounded-xl border border-[#D7CCC8] transition-all flex items-center justify-center space-x-1 active:scale-95 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  ) : (
                    <div className="flex items-center bg-[#FAF3E0] rounded-xl border border-[#3E2723] p-0.5 shadow-inner">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        data-testid="qty-minus"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#3E2723] hover:bg-white active:scale-90 font-bold transition-all"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="px-2 text-xs font-bold text-[#3E2723] min-w-[20px] text-center">
                        {qty}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        data-testid="qty-plus"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#3E2723] text-[#FFF8E7] active:scale-90 font-bold transition-all"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Order Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center pointer-events-none">
        <div className="w-full max-w-[420px] bg-white border-t border-[#EADCC8] p-3 shadow-2xl pointer-events-auto">
          {/* Cart Summary & Submit Button */}
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-[#FAF3E0] rounded-xl px-3 py-2 border border-[#EADCC8] flex flex-col justify-center">
              <span className="text-[10px] uppercase text-[#8D6E63] font-semibold">
                {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
              </span>
              <span 
                data-testid="cart-total"
                className="text-lg font-black text-[#3E2723] leading-none"
              >
                ₹{cartTotal}
              </span>
            </div>

            <button
              onClick={handleSubmitOrder}
              disabled={submitting || cartItems.length === 0}
              data-testid="btn-submit-order"
              className="min-h-[48px] px-6 bg-[#3E2723] text-[#FFF8E7] font-bold text-sm rounded-xl hover:bg-[#4E342E] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center space-x-2"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{submitting ? 'Placing...' : 'Place Order'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
