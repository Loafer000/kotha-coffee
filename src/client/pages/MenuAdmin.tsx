import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Edit2,
  Archive,
  RefreshCw,
  Check,
  X,
  Search,
  ArrowLeft,
  UtensilsCrossed,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  MenuItem,
  CreateMenuItemInput,
  UpdateMenuItemInput,
  getMenuItems,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getStoredToken,
  verifyPin
} from '../services/api.js';

const CATEGORIES = [
  'Drinks',
  'Snacks',
  'Pasta',
  'Sandwich',
  'Mocktails',
  'Ice Cream'
] as const;

export interface MenuAdminProps {
  onBack?: () => void;
}

export const MenuAdmin: React.FC<MenuAdminProps> = ({ onBack }) => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auth state
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<CreateMenuItemInput>({
    name: '',
    category: 'Drinks',
    price: 0
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Edit Item Modal
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editForm, setEditForm] = useState<UpdateMenuItemInput>({
    name: '',
    category: 'Drinks',
    price: 0,
    is_active: 1
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Archive Confirm Modal
  const [itemToArchive, setItemToArchive] = useState<MenuItem | null>(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMenuItems(true); // Fetch all including inactive
      setItems(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load menu items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;

    try {
      setIsVerifyingPin(true);
      setPinError(null);
      const res = await verifyPin(pinInput.trim());
      setToken(res.token);
      setPinInput('');
      setSuccessMessage('Unlocked successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setPinError(err.message || 'Invalid PIN');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false;
      }
      // Archived filter
      if (!showArchived && item.is_active === 0) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [items, selectedCategory, showArchived, searchQuery]);

  // Handle Add Item
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setAddError('Reception PIN authentication required');
      return;
    }

    if (!addForm.name.trim()) {
      setAddError('Item name cannot be empty');
      return;
    }

    if (!addForm.price || addForm.price <= 0) {
      setAddError('Price must be greater than ₹0');
      return;
    }

    try {
      setIsSaving(true);
      setAddError(null);
      await addMenuItem(addForm, token);
      setIsAddModalOpen(false);
      setAddForm({ name: '', category: 'Drinks', price: 0 });
      setSuccessMessage(`Item "${addForm.name}" created successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchItems();
    } catch (err: any) {
      setAddError(err.message || 'Failed to create item');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      category: item.category,
      price: item.price,
      is_active: item.is_active
    });
    setEditError(null);
  };

  // Handle Update Item
  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingItem) {
      setEditError('Reception PIN authentication required');
      return;
    }

    if (!editForm.name?.trim()) {
      setEditError('Item name cannot be empty');
      return;
    }

    if (editForm.price === undefined || editForm.price <= 0) {
      setEditError('Price must be greater than ₹0');
      return;
    }

    try {
      setIsSaving(true);
      setEditError(null);
      await updateMenuItem(editingItem.id, editForm, token);
      setEditingItem(null);
      setSuccessMessage(`Item "${editForm.name}" updated successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchItems();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update item');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Soft-Delete / Archive
  const handleArchiveItem = async () => {
    if (!token || !itemToArchive) return;

    try {
      setIsSaving(true);
      await deleteMenuItem(itemToArchive.id, token);
      setSuccessMessage(`Item "${itemToArchive.name}" archived`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setItemToArchive(null);
      await fetchItems();
    } catch (err: any) {
      setError(err.message || 'Failed to archive item');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Restore / Un-archive
  const handleRestoreItem = async (item: MenuItem) => {
    if (!token) return;

    try {
      setIsSaving(true);
      await updateMenuItem(item.id, { is_active: 1 }, token);
      setSuccessMessage(`Item "${item.name}" restored to active menu`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchItems();
    } catch (err: any) {
      setError(err.message || 'Failed to restore item');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8E7] text-[#3E2723] flex flex-col items-center overflow-x-hidden font-sans">
      {/* Top Header */}
      <header className="w-full max-w-md bg-[#3E2723] text-[#FFF8E7] px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-lg hover:bg-[#4E342E] active:scale-95 transition-transform"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-[#FFF8E7]" />
            </button>
          )}
          <div>
            <h1 className="font-bold text-lg leading-tight flex items-center gap-1.5">
              <span>কথা & Coffee</span>
            </h1>
            <p className="text-xs text-[#8D6E63]">Menu Catalog Management</p>
          </div>
        </div>

        <button
          onClick={fetchItems}
          disabled={loading}
          className="p-2 rounded-lg bg-[#4E342E] text-[#FFF8E7] hover:bg-[#5D4037] active:scale-95 transition-transform"
          aria-label="Refresh menu items"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Main Container - Locked to mobile viewport */}
      <main className="w-full max-w-md px-4 py-4 flex flex-col gap-4 flex-1">
        {/* Success Alert Banner */}
        {successMessage && (
          <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-sm flex items-center gap-2 shadow-sm animate-fade-in">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="p-3 bg-rose-100 border border-rose-300 text-rose-800 rounded-xl text-sm flex items-center gap-2 shadow-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* PIN Unlock Prompt if not authenticated */}
        {!token && (
          <div className="p-4 bg-white rounded-2xl shadow-sm border border-[#8D6E63]/20 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[#3E2723]">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-sm">Reception PIN Required to Edit</span>
            </div>
            <p className="text-xs text-stone-600">
              Enter your reception PIN to add, update prices, or archive menu items.
            </p>
            <form onSubmit={handlePinSubmit} className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter PIN (e.g. 1234)"
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#4E342E]"
              />
              <button
                type="submit"
                disabled={isVerifyingPin || !pinInput}
                className="px-4 py-2 bg-[#3E2723] text-white rounded-xl text-sm font-medium hover:bg-[#4E342E] disabled:opacity-50 active:scale-95 transition-all"
              >
                {isVerifyingPin ? '...' : 'Unlock'}
              </button>
            </form>
            {pinError && <span className="text-xs text-rose-600">{pinError}</span>}
          </div>
        )}

        {/* Action Bar: Add Item & Search */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white rounded-xl border border-[#8D6E63]/30 focus:outline-none focus:ring-2 focus:ring-[#3E2723]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setAddError(null);
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#3E2723] text-[#FFF8E7] rounded-xl text-sm font-semibold hover:bg-[#4E342E] active:scale-95 transition-transform shadow-sm whitespace-nowrap min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>Add Item</span>
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
            <button
              onClick={() => setSelectedCategory('All')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] flex items-center ${
                selectedCategory === 'All'
                  ? 'bg-[#3E2723] text-[#FFF8E7]'
                  : 'bg-stone-200/80 text-stone-700 hover:bg-stone-300'
              }`}
            >
              All ({items.filter(i => showArchived || i.is_active === 1).length})
            </button>
            {CATEGORIES.map((cat) => {
              const count = items.filter(
                (i) => i.category === cat && (showArchived || i.is_active === 1)
              ).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] flex items-center ${
                    selectedCategory === cat
                      ? 'bg-[#3E2723] text-[#FFF8E7]'
                      : 'bg-stone-200/80 text-stone-700 hover:bg-stone-300'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Archive View Toggle */}
          <div className="flex items-center justify-between px-1 text-xs text-stone-600">
            <span>
              Showing {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-1 font-medium text-[#4E342E] hover:underline min-h-[32px]"
            >
              {showArchived ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hide Archived</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>Show Archived</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Item Cards List */}
        {loading && items.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-500">
            <RefreshCw className="w-6 h-6 animate-spin text-[#4E342E]" />
            <p className="text-sm">Loading catalog items...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 px-4 text-center bg-white/70 rounded-2xl border border-dashed border-stone-300 flex flex-col items-center gap-2">
            <UtensilsCrossed className="w-8 h-8 text-stone-400" />
            <p className="font-semibold text-stone-700 text-sm">No menu items found</p>
            <p className="text-xs text-stone-500">
              {searchQuery ? 'Try adjusting your search query' : 'No items match the selected filter'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pb-8">
            {filteredItems.map((item) => {
              const isInactive = item.is_active === 0;
              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isInactive
                      ? 'bg-stone-100 border-stone-300 opacity-60'
                      : 'bg-white border-[#8D6E63]/25 shadow-sm'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#3E2723] truncate">
                        {item.name}
                      </span>
                      {isInactive && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-stone-300 text-stone-700 font-semibold">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs px-2 py-0.5 rounded-md bg-[#FAF3E0] text-[#4E342E] font-medium">
                        {item.category}
                      </span>
                      <span className="font-bold text-sm text-[#8D493A]">
                        ₹{item.price}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openEditModal(item)}
                      className="p-2 rounded-xl bg-stone-100 text-[#3E2723] hover:bg-stone-200 active:scale-95 transition-transform min-w-[40px] min-h-[40px] flex items-center justify-center"
                      title="Edit item name or price"
                      aria-label={`Edit ${item.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {isInactive ? (
                      <button
                        onClick={() => handleRestoreItem(item)}
                        disabled={isSaving}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-transform text-xs font-semibold min-h-[40px]"
                        title="Restore item to active menu"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        onClick={() => setItemToArchive(item)}
                        className="p-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-95 transition-transform min-w-[40px] min-h-[40px] flex items-center justify-center"
                        title="Archive (soft-delete) item"
                        aria-label={`Archive ${item.name}`}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="font-bold text-base text-[#3E2723] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#4E342E]" />
                <span>Add New Menu Item</span>
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleCreateItem} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Masala Chai"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3E2723]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Category *
                </label>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3E2723]"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Price (₹ INR) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-bold text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    placeholder="e.g. 50"
                    value={addForm.price || ''}
                    onChange={(e) =>
                      setAddForm({ ...addForm, price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#3E2723]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-xl text-sm font-semibold hover:bg-stone-200 min-h-[48px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 bg-[#3E2723] text-white rounded-xl text-sm font-semibold hover:bg-[#4E342E] disabled:opacity-50 min-h-[48px]"
                >
                  {isSaving ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="font-bold text-base text-[#3E2723] flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[#4E342E]" />
                <span>Edit Item & Price</span>
              </h2>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              <span className="font-semibold">Price Immutability:</span> Updating this price will
              only apply to future orders. Past orders retain their original historical prices.
            </div>

            <form onSubmit={handleUpdateItem} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3E2723]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Category *
                </label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3E2723]"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Price (₹ INR) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-bold text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={editForm.price || ''}
                    onChange={(e) =>
                      setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#3E2723]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-stone-200">
                <span className="text-xs font-semibold text-stone-700">Active on POS</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditForm({
                      ...editForm,
                      is_active: editForm.is_active === 1 ? 0 : 1
                    })
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    editForm.is_active === 1
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-300 text-stone-700'
                  }`}
                >
                  {editForm.is_active === 1 ? 'Active' : 'Archived'}
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-xl text-sm font-semibold hover:bg-stone-200 min-h-[48px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 bg-[#3E2723] text-white rounded-xl text-sm font-semibold hover:bg-[#4E342E] disabled:opacity-50 min-h-[48px]"
                >
                  {isSaving ? 'Updating...' : 'Update Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {itemToArchive && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-rose-100 text-rose-700">
                <Archive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#3E2723]">Archive Menu Item?</h3>
                <p className="text-xs text-stone-600">{itemToArchive.name}</p>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Archiving removes this item from the active POS menu. Existing order records and past
              analytics will NOT be affected. You can unarchive it anytime.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setItemToArchive(null)}
                className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-xl text-xs font-semibold hover:bg-stone-200 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchiveItem}
                disabled={isSaving}
                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 disabled:opacity-50 min-h-[44px]"
              >
                {isSaving ? 'Archiving...' : 'Yes, Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuAdmin;
