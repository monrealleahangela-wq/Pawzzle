import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { petService, getImageUrl } from '../../services/apiService';
import { Heart, Package, Plus, Minus, Trash2, ShoppingBag, CheckSquare, AlertCircle, MapPin, Store } from 'lucide-react';

const Cart = () => {
  const { items, removeFromCart, updateQuantity, getTotalPrice, clearCart, toggleItemSelection, selectAllItems, deselectAllItems, getSelectedItems } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [petAvailability, setPetAvailability] = useState({});
  const [loading, setLoading] = useState(false);

  // Check pet availability when cart loads
  useEffect(() => {
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
        <h2 className="text-4xl font-black text-slate-900 mb-4 uppercase tracking-tight">Your Cart is Empty</h2>
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
    <div className="min-h-screen bg-[#F8FAFC] pb-36 lg:pb-12">
      {/* Warning for sold pets - Tightened */}
      {hasSoldItems() && (
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5 mb-2 mx-2 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
            <p className="text-[9px] font-black text-rose-800 uppercase tracking-tight">
              Decommissioned assets detected. Purge required.
            </p>
          </div>
        </div>
      )}

      {/* Header - Optimized for Compactness */}
      <div className="max-w-7xl mx-auto px-2 sm:px-8 py-4 sm:py-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-3 mb-2 px-2">
        <div className="space-y-0.5">
          <h1 className="text-2xl sm:text-6xl font-black text-slate-900 tracking-tighter uppercase leading-[0.9]">
            Your Shopping <br />
            <span className="text-primary-600 italic">Cart</span>
          </h1>
          <p className="text-[9px] sm:text-lg text-slate-400 font-bold uppercase tracking-tight opacity-70">Review items before checkout</p>
        </div>
        <div className="flex gap-1.5 w-full md:w-auto">
          <button onClick={handleSelectAll} className="flex-1 md:flex-none px-4 py-2.5 bg-white border border-slate-100 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm transition-all active:scale-95">
            Select All
          </button>
          <button onClick={clearCart} className="flex-1 md:flex-none px-4 py-2.5 bg-rose-50 rounded-xl text-[9px] font-black uppercase tracking-widest text-rose-600 transition-all active:scale-95">
            Clear Cart
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 md:px-8 grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-10">
        {/* Cart Items - High Density 'Thin' Rows */}
        <div className="lg:col-span-2 space-y-1.5 sm:space-y-3">
          {items.map((item, idx) => (
            <div key={`${item.itemType}-${item.itemId}`} className="group bg-white rounded-xl sm:rounded-[2rem] p-2 sm:p-5 border border-white shadow-xl shadow-slate-200/40 transition-all hover:shadow-2xl animate-slide-up" style={{ animationDelay: `${idx * 0.03}s` }}>
              <div className="flex items-center gap-2 sm:gap-6">
                <input
                  type="checkbox"
                  checked={item.selected || false}
                  onChange={() => toggleItemSelection(item.itemId, item.itemType)}
                  className="w-4 h-4 sm:w-6 sm:h-6 text-primary-600 rounded-lg border-slate-200 cursor-pointer"
                />

                <div className="w-12 h-12 sm:w-24 sm:h-24 bg-slate-50 rounded-lg sm:rounded-[1.5rem] border border-slate-100 flex-shrink-0 overflow-hidden relative">
                  {item.image ? (
                    <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {item.itemType === 'pet' ? <Heart className="h-4 w-4 sm:h-8 sm:w-8 text-primary-200" /> : <Package className="h-4 w-4 sm:h-8 sm:w-8 text-secondary-200" />}
                    </div>
                  )}
                  {isPetSold(item) && <div className="absolute inset-0 bg-white/60 flex items-center justify-center font-black text-[7px] text-rose-600 uppercase">OFF</div>}
                </div>

                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h3 className={`text-[11px] sm:text-xl font-black uppercase tracking-tight truncate ${isPetSold(item) ? 'text-rose-300 line-through' : 'text-slate-900'}`}>
                        {item.name}
                      </h3>
                      <span className={`px-1 rounded text-[6px] sm:text-[9px] font-black uppercase ${item.itemType === 'pet' ? 'bg-primary-50 text-primary-600' : 'bg-secondary-50 text-secondary-600'}`}>
                        {item.itemType}
                      </span>
                    </div>
                    <p className="text-[8px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest opacity-60">
                      ₱{item.price?.toLocaleString()} • @{item.storeName}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-10">
                    <div className="flex items-center bg-slate-50 rounded-lg sm:rounded-xl border border-slate-100 p-0.5 shadow-inner">
                      <button onClick={() => handleQuantityChange(item.itemId, item.itemType, item.quantity - 1)} className="w-5 h-5 sm:w-8 sm:h-8 rounded-md hover:bg-white flex items-center justify-center transition-all disabled:opacity-20"><Minus className="h-2 w-2 sm:h-3 sm:w-3" /></button>
                      <span className="w-6 sm:w-10 text-center text-[10px] sm:text-xs font-black text-slate-900">{item.quantity}</span>
                      <button onClick={() => handleQuantityChange(item.itemId, item.itemType, item.quantity + 1)} className="w-5 h-5 sm:w-8 sm:h-8 rounded-md hover:bg-white flex items-center justify-center transition-all"><Plus className="h-2 w-2 sm:h-3 sm:w-3" /></button>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-6">
                      <span className="text-[11px] sm:text-2xl font-black text-slate-900 tracking-tighter">₱{(item.price * item.quantity).toLocaleString()}</span>
                      <button onClick={() => removeFromCart(item.itemId, item.itemType)} className="text-slate-300 hover:text-rose-600 p-1.5 sm:p-2.5 transition-all"><Trash2 className="h-3 w-3 sm:h-5 sm:w-5" /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar - Final Tally Desktop */}
        <div className="hidden lg:block">
          <div className="bg-slate-900 rounded-[3rem] p-10 sticky top-10 shadow-2xl relative overflow-hidden text-white">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-10 italic border-b border-white/10 pb-4 relative z-10">Order Summary</h2>
            <div className="space-y-6 mb-12 relative z-10">
              <div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payload Value</span><span className="text-xl font-black text-white">₱{totalPrice.toLocaleString()}</span></div>
              <div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Assets</span><span className="text-xl font-black text-primary-400">{selectedItems.length} UNITS</span></div>
              <div className="border-t border-white/10 pt-8">
                <div className="flex justify-between items-end"><span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Net Total</span><span className="text-4xl font-black text-primary-500 tracking-tighter shadow-primary-900">₱{totalPrice.toLocaleString()}</span></div>
              </div>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full py-5 bg-white text-slate-900 rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] block text-center shadow-2xl hover:bg-primary-50 transition-all active:scale-95 relative z-10"
            >
              Checkout Now
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Checkout Bar - Adjusted for Bottom Nav HUD */}
      <div className="lg:hidden fixed bottom-[96px] left-1/2 -translate-x-1/2 w-[94%] max-w-lg z-50 bg-white/95 backdrop-blur-2xl border border-white/20 px-4 py-3.5 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
          <div className="pl-1">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Net Payload</p>
            <p className="text-[17px] font-black text-slate-900 tracking-tighter leading-none">₱{totalPrice.toLocaleString()}</p>
          </div>
          <button
            onClick={handleCheckout}
            className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-xl text-center active:scale-95 transition-all"
          >
            Checkout ({selectedItems.length})
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
