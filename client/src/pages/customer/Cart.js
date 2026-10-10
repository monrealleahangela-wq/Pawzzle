import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { petService, getImageUrl } from '../../services/apiService';
import { Heart, Package, Plus, Minus, Trash2, ShoppingBag, AlertCircle } from 'lucide-react';
import { formatPeso } from '../../utils/paymentSummary';

const Cart = () => {
  const { items, removeFromCart, updateQuantity, getTotalPrice, clearCart, toggleItemSelection, selectAllItems, deselectAllItems, getSelectedItems } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [petAvailability, setPetAvailability] = useState({});
  const [loading, setLoading] = useState(false);

  // Check pet availability when cart loads
  useEffect(() => {
    items
      .filter(item => item.itemType === 'pet' && Number(item.quantity) !== 1)
      .forEach(item => updateQuantity(item.itemId, item.itemType, 1));
    checkPetAvailability();
  }, [items]);

  const checkPetAvailability = async () => {
    const petItems = items.filter(item => item.itemType === 'pet');
    if (petItems.length === 0) return;

    setLoading(true);
    try {
      const availabilityMap = {};

      for (const item of petItems) {
        try {
          const response = await petService.getPetById(item.itemId);
          availabilityMap[item.itemId] = response.data.pet?.isAvailable !== false;
        } catch (error) {
          // If pet not found or error, mark as unavailable
          availabilityMap[item.itemId] = false;
        }
      }

      setPetAvailability(availabilityMap);
    } catch (error) {
      console.error('Error checking pet availability:', error);
    } finally {
      setLoading(false);
    }
  };

  const isPetSold = (item) => {
    if (item.itemType !== 'pet') return false;
    return petAvailability[item.itemId] === false;
  };

  const hasSoldItems = () => {
    return items.some(item => isPetSold(item));
  };

  const handleQuantityChange = (itemId, itemType, newQuantity) => {
    if (newQuantity < 1) {
      removeFromCart(itemId, itemType);
    } else {
      updateQuantity(itemId, itemType, newQuantity);
    }
  };

  const totalPrice = getTotalPrice();
  const selectedItems = getSelectedItems();

  const handleSelectAll = () => {
    selectAllItems();
  };

  const handleDeselectAll = () => {
    deselectAllItems();
  };

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      toast.error('Please select at least one item to checkout');
      return;
    }
    navigate('/checkout');
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <ShoppingBag className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Please Log In</h2>
        <p className="text-gray-600 mb-6">You need to log in to view your cart</p>
        <div className="flex gap-4 justify-center">
          <Link to="/login" className="btn btn-primary">
            Log In
          </Link>
          <Link to="/register" className="btn btn-outline">
            Sign Up
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-32 text-center animate-fade-in group">
        <div className="w-32 h-32 bg-slate-50 rounded-[40px] flex items-center justify-center mb-8 group-hover:rotate-12 transition-transform duration-700">
          <ShoppingBag className="h-14 w-14 text-slate-200" />
        </div>
        <h2 className="mb-3 text-2xl font-black uppercase tracking-tight text-slate-900">Your Cart is Empty</h2>
        <p className="text-slate-500 mb-12 max-w-sm font-medium italic">Find the perfect companions and the best supplies for your pets.</p>
        <div className="flex flex-col sm:flex-row gap-6">
          <Link to="/pets" className="btn btn-primary px-12 py-5 text-sm font-black uppercase tracking-widest shadow-2xl shadow-primary-200">
            Discover Pets
          </Link>
          <Link to="/products" className="btn btn-outline px-12 py-5 text-sm font-black uppercase tracking-widest border-slate-200">
            Browse Shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-8 lg:pb-10" data-testid="customer-cart-page">
      {/* Warning for sold pets - Tightened */}
      {hasSoldItems() && (
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5 mb-2 mx-2 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
            <p className="text-[9px] font-black text-rose-800 uppercase tracking-tight">
              Some items are no longer available. Please remove them.
            </p>
          </div>
        </div>
      )}

      {/* Header - Optimized for Compactness */}
      <div className="mx-auto mb-3 flex max-w-7xl flex-col items-start justify-between gap-3 px-3 py-4 sm:px-6 sm:py-5 md:flex-row md:items-end lg:px-8">
        <div className="space-y-1">
          <h1 className="!text-2xl font-black leading-tight tracking-tight text-slate-900 sm:!text-3xl">
            Shopping <span className="text-primary-600">Cart</span>
          </h1>
          <p className="text-sm font-medium leading-relaxed text-slate-500">Review your selected items before checkout.</p>
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <button onClick={handleSelectAll} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600 shadow-sm transition hover:border-primary-200 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-95 md:flex-none">
            Select All
          </button>
          <button onClick={clearCart} className="min-h-11 flex-1 rounded-xl bg-rose-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-rose-600 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 active:scale-95 md:flex-none">
            Clear Cart
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-4 px-3 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:gap-6 lg:px-8" data-testid="cart-layout">
        {/* Cart Items - High Density 'Thin' Rows */}
        <div className="min-w-0 space-y-3" data-testid="cart-items-list">
          {items.map((item, idx) => (
            <article key={`${item.itemType}-${item.itemId}`} className="group rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-primary-100 hover:shadow-md sm:p-4 animate-slide-up" style={{ animationDelay: `${idx * 0.03}s` }} data-testid={`cart-item-${item.itemType}`}>
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
                <label className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-primary-500 sm:w-10">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.name}`}
                    checked={item.selected || false}
                    onChange={() => toggleItemSelection(item.itemId, item.itemType)}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-primary-600 focus:ring-primary-500 sm:h-5 sm:w-5"
                  />
                </label>

                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:h-20 sm:w-20">
                  {item.image ? (
                    <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {item.itemType === 'pet' ? <Heart className="h-6 w-6 text-primary-200" /> : <Package className="h-6 w-6 text-secondary-200" />}
                    </div>
                  )}
                  {isPetSold(item) && <div className="absolute inset-0 bg-white/60 flex items-center justify-center font-black text-[7px] text-rose-600 uppercase">OFF</div>}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex min-w-0 items-center gap-2">
                      <h3 className={`truncate !text-sm font-black leading-tight tracking-tight sm:!text-base ${isPetSold(item) ? 'text-rose-300 line-through' : 'text-slate-900'}`}>
                        {item.name}
                      </h3>
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${item.itemType === 'pet' ? 'bg-primary-50 text-primary-700' : 'bg-secondary-50 text-secondary-700'}`}>
                        {item.itemType}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold leading-relaxed text-slate-500">
                      <span>{formatPeso(item.price)}</span>
                      <span aria-hidden="true">•</span>
                      {item.storeId && item.storeName ? (
                        <Link
                          to={`/stores/${item.storeId}`}
                          className="truncate transition-colors hover:text-primary-600 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                          aria-label={`View ${item.storeName} store`}
                        >
                          {item.storeName}
                        </Link>
                      ) : (
                        <span>{item.storeName || 'Store unavailable'}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:shrink-0 sm:justify-end sm:gap-4">
                    {item.itemType === 'pet' ? (
                      <span className="rounded-lg border border-primary-100 bg-primary-50 px-2.5 py-1.5 text-[9px] font-black uppercase text-primary-700">1 individual pet</span>
                    ) : (
                      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-inner" aria-label={`Quantity for ${item.name}`}>
                        <button aria-label={`Decrease ${item.name} quantity`} onClick={() => handleQuantityChange(item.itemId, item.itemType, item.quantity - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-20"><Minus className="h-3.5 w-3.5" /></button>
                        <span className="w-8 text-center text-xs font-black text-slate-900" aria-label={`${item.quantity} items`}>{item.quantity}</span>
                        <button aria-label={`Increase ${item.name} quantity`} onClick={() => handleQuantityChange(item.itemId, item.itemType, item.quantity + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                      <span className="text-sm font-black tracking-tight text-slate-900 sm:text-base">{formatPeso(item.price * item.quantity)}</span>
                      <button aria-label={`Remove ${item.name} from cart`} onClick={() => removeFromCart(item.itemId, item.itemType)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Content-driven summary stacks below items on mobile. */}
        <aside className="min-w-0 lg:sticky lg:top-24" data-testid="order-summary">
          <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-5 text-white shadow-xl sm:p-6">
            <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary-600/15 blur-3xl" />
            <h2 className="relative z-10 mb-4 border-b border-white/10 pb-3 !text-xl font-black tracking-tight">Order Summary</h2>
            <div className="relative z-10 mb-5 space-y-3">
              <div className="flex items-center justify-between gap-4"><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Items subtotal</span><span className="text-sm font-black text-white">{formatPeso(totalPrice)}</span></div>
              <div className="flex items-center justify-between gap-4"><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Selected items</span><span className="text-sm font-black text-primary-300">{selectedItems.length} items</span></div>
              <div className="border-t border-white/10 pt-4">
                <div className="flex items-end justify-between gap-4"><span className="text-[10px] font-black uppercase tracking-wide text-white">Total</span><span className="text-2xl font-black tracking-tight text-primary-400">{formatPeso(totalPrice)}</span></div>
                <p className="mt-2 text-[10px] font-medium leading-relaxed text-slate-400">VAT, delivery fees, and eligible discounts are calculated from current store data during checkout.</p>
              </div>
            </div>
            <button
              onClick={handleCheckout}
              className="relative z-10 min-h-12 w-full rounded-xl bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-900 shadow-lg transition hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 active:scale-[0.98]"
            >
              Checkout ({selectedItems.length})
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Cart;
