import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { orderService, userService, paymentService, storeService, voucherService, getImageUrl } from '../../services/apiService';
import { Heart, Package, CreditCard, Truck, Edit2, ShoppingBag, Store, CheckCircle, AlertCircle, MapPin, Tag, Ticket, X, ChevronRight } from 'lucide-react';
import { getCitiesByProvince, getBarangaysByCity } from '../../constants/locationConstants';
import MapPicker from '../../components/MapPicker';
import { Info } from 'lucide-react';

const Checkout = () => {
  const { items, removeFromCart, updateQuantity, getTotalPrice, clearCart, clearSelectedItems, toggleItemSelection, selectAllItems, deselectAllItems, getSelectedItems } = useCart();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('payment') === 'cancelled') {
      toast.warn('Payment was cancelled. You can try another payment method.');
    }
  }, [location.search]);

  // Use only selected items for checkout
  const selectedCartItems = getSelectedItems();
  const checkoutItems = selectedCartItems.length > 0 ? selectedCartItems : [];

  // Calculate total price for selected items only
  const checkoutTotalPrice = checkoutItems.reduce((total, item) => total + (item.price * item.quantity), 0);

  // All hooks must be called before any conditional returns
  const [isLoading, setIsLoading] = useState(false);
  const [editAddress, setEditAddress] = useState(false);
  const [addressInputType, setAddressInputType] = useState('map'); // 'map' or 'manual'
  const [adminSettings, setAdminSettings] = useState({
    freeShipping: true,
    shippingFee: 0,
    freeShippingThreshold: 0
  });

  // Auto-populate address from user profile (restricted to Cavite, Philippines)
  const [shippingAddress, setShippingAddress] = useState({
    street: user?.address?.street || '',
    city: user?.address?.city || '',
    province: 'cavite', // Automatically set to Cavite
    barangay: user?.address?.barangay || '',
    zipCode: user?.address?.zipCode || '',
    country: 'PH' // Automatically set to Philippines
  });

  const [phoneNumber, setPhoneNumber] = useState(user?.phone || '');
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [isVerifyingVoucher, setIsVerifyingVoucher] = useState(false);
  const [myVouchers, setMyVouchers] = useState([]);
  const [showVoucherModal, setShowVoucherModal] = useState(false);

  // Payment options based on delivery method
  const getPaymentOptions = () => {
    const onlinePayments = [
      { value: 'credit_card', label: 'Credit Card' },
      { value: 'debit_card', label: 'Debit Card' },
      { value: 'paypal', label: 'PayPal' },
      { value: 'gcash', label: 'GCash' },
      { value: 'maya', label: 'Maya' },
      { value: 'dob', label: 'Online Banking' }
    ];

    if (deliveryMethod === 'delivery') {
      return [
        ...onlinePayments,
        { value: 'cash_on_delivery', label: 'Cash on Delivery' }
      ];
    } else {
      // Pickup options - no cash on delivery
      return [
        ...onlinePayments,
        { value: 'cash_on_pickup', label: 'Cash on Pickup' }
      ];
    }
  };
  const [deliveryMethod, setDeliveryMethod] = useState('delivery'); // 'delivery' or 'pickup'
  const [notes, setNotes] = useState('');
  const [addressApplied, setAddressApplied] = useState(false);

  // Initialize cities and barangays for Cavite province
  useEffect(() => {
    // Always initialize cities for Cavite since platform is restricted to Cavite
    setCities(getCitiesByProvince('cavite'));
    if (user?.address?.city) {
      setBarangays(getBarangaysByCity(user.address.city));
    }
    setEditAddress(false);
  }, [user]);

  // Reset payment method when delivery method changes
  useEffect(() => {
    setPaymentMethod('credit_card'); // Reset to default when delivery method changes
  }, [deliveryMethod]);

  const [storeAddresses, setStoreAddresses] = useState({});

  // Use default settings instead of API call since endpoint doesn't exist yet
  useEffect(() => {
    // Default store settings
    const defaultSettings = {
      freeShipping: true,
      shippingFee: 0,
      freeShippingThreshold: 0
    };
    setAdminSettings(defaultSettings);
  }, []);

  // Fetch claimed vouchers
  useEffect(() => {
    const fetchVouchers = async () => {
      try {
        const response = await voucherService.getMyVouchers();
        setMyVouchers(response.data.vouchers);
      } catch (error) {
        console.error('Error fetching vouchers:', error);
      }
    };
    if (isAuthenticated) fetchVouchers();
  }, [isAuthenticated]);

  // Fetch missing store addresses
  useEffect(() => {
    const fetchMissingAddresses = async () => {
      // 1. Items with storeId
      const storesToFetchById = checkoutItems
        .filter(item => !item.storeAddress && item.storeId)
        .map(item => item.storeId);

      const uniqueStoreIds = [...new Set(storesToFetchById)];
      for (const storeId of uniqueStoreIds) {
        if (!storeAddresses[storeId]) {
          try {
            const response = await storeService.getStoreById(storeId);
            const store = response.data.store || response.data;
            if (store?.contactInfo?.address) {
              setStoreAddresses(prev => ({
                ...prev,
                [storeId]: store.contactInfo.address,
                [store.name]: store.contactInfo.address // Map by name too for fallback
              }));
            }
          } catch (error) {
            console.error('Error fetching store address by ID:', error);
          }
        }
      }

      // 2. Items missing storeId but have storeName (for old cart items)
      const storesToFetchByName = checkoutItems
        .filter(item => !item.storeAddress && !item.storeId && item.storeName)
        .map(item => item.storeName);

      const uniqueStoreNames = [...new Set(storesToFetchByName)];
      for (const name of uniqueStoreNames) {
        if (!storeAddresses[name]) {
          try {
            // Search for store by name
            const response = await storeService.getAllStores({ search: name });
            const stores = response.data.stores || response.data || [];
            const matchingStore = stores.find(s => s.name === name);
            if (matchingStore?.contactInfo?.address) {
              setStoreAddresses(prev => ({
                ...prev,
                [name]: matchingStore.contactInfo.address
              }));
            }
          } catch (error) {
            console.error('Error fetching store address by name:', error);
          }
        }
      }
    };

    if (deliveryMethod === 'pickup' && checkoutItems.length > 0) {
      fetchMissingAddresses();
    }
  }, [deliveryMethod, checkoutItems]);

  // Early return if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 p-6">
        <div className="text-center py-12">
          <ShoppingBag className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Please Log In</h2>
          <p className="text-gray-600 mb-6">You need to log in to proceed with checkout</p>
          <div className="flex gap-4 justify-center">
            <button onClick={() => navigate('/login')} className="btn btn-primary">
              Log In
            </button>
            <button onClick={() => navigate('/register')} className="btn btn-outline">
              Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Function to reset address to user profile data (restricted to Cavite, Philippines)
  const resetToProfileAddress = () => {
    const profileAddress = {
      street: user?.address?.street || '',
      city: user?.address?.city || '',
      province: 'cavite', // Always Cavite
      barangay: user?.address?.barangay || '',
      zipCode: user?.address?.zipCode || '',
      country: 'PH' // Always Philippines
    };
    setShippingAddress(profileAddress);
    setPhoneNumber(user?.phone || '');

    // Re-initialize cities and barangays for Cavite
    setCities(getCitiesByProvince('cavite'));
    if (user?.address?.city) {
      setBarangays(getBarangaysByCity(user.address.city));
    }
    setEditAddress(false);

    // Show visual feedback
    setAddressApplied(true);
    setTimeout(() => setAddressApplied(false), 2000);

    toast.success('Address applied successfully!');
  };

  const getPaymentIcon = (value) => {
    switch (value) {
      case 'credit_card':
      case 'debit_card': return <CreditCard className="h-6 w-6" />;
      case 'paypal': return <ShoppingBag className="h-6 w-6" />;
      case 'gcash':
      case 'maya':
      case 'dob': return <CreditCard className="h-6 w-6" />; // Using CreditCard as fallback icon
      case 'cash_on_delivery':
      case 'cash_on_pickup': return <Truck className="h-6 w-6" />;
      default: return <Package className="h-6 w-6" />;
    }
  };

  const handleAddressChange = (field, value) => {
    setShippingAddress(prev => ({ ...prev, [field]: value }));

    // Handle cascading dropdowns
    if (field === 'province') {
      setCities(getCitiesByProvince(value));
      setBarangays([]);
      // Reset city and barangay when province changes
      setShippingAddress(prev => ({
        ...prev,
        city: '',
        barangay: ''
      }));
    } else if (field === 'city') {
      setBarangays(getBarangaysByCity(value));
      // Reset barangay when city changes
      setShippingAddress(prev => ({
        ...prev,
        barangay: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // Check if cart has selected items
    const selectedItems = getSelectedItems();
    if (!selectedItems || selectedItems.length === 0) {
      toast.error('Please select at least one item to checkout');
      setIsLoading(false);
      return;
    }

    if (!items || items.length === 0) {
      toast.error('Your cart is empty');
      setIsLoading(false);
      return;
    }

    try {
      const orderData = {
        items: selectedItems.map(item => ({
          itemType: item.itemType,
          itemId: item.itemId,
          quantity: item.quantity
        })),
        deliveryMethod,
        shippingAddress: deliveryMethod === 'delivery' ? shippingAddress : {},
        phoneNumber,
        paymentMethod,
        notes: notes.trim(),
        voucherCode: appliedVoucher ? voucherCode : null
      };

      // Calculate shipping fee based on admin settings and delivery method
      let shippingFee = 0;
      if (deliveryMethod === 'delivery' && !adminSettings.freeShipping && adminSettings.shippingFee > 0) {
        const orderTotal = selectedItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        if (orderTotal < adminSettings.freeShippingThreshold) {
          shippingFee = adminSettings.shippingFee;
        }
      }

      const response = await orderService.createOrder({
        ...orderData,
        shippingFee
      });

      if (response.data && response.data.order) {
        const orderId = response.data.order._id;

        // Handle PayMongo redirection for online payments
        const onlinePaymentMethods = ['credit_card', 'debit_card', 'gcash', 'maya', 'paypal', 'dob'];
        if (onlinePaymentMethods.includes(paymentMethod)) {
          try {
            toast.info(`Redirecting to ${paymentMethod.toUpperCase()}...`);
            const paymentResponse = await paymentService.createCheckoutSession(orderId);
            if (paymentResponse.data && paymentResponse.data.checkoutUrl) {
              // Clear items and redirect
              clearSelectedItems();
              window.location.href = paymentResponse.data.checkoutUrl;
              return;
            } else {
              throw new Error('Payment gateway unavailable');
            }
          } catch (paymentError) {
            console.error('Payment Error:', paymentError);
            toast.error('Order secured, but payment initialization failed. You can try again from your dashboard.');
            navigate(`/orders/${orderId}`);
            return;
          }
        }

        toast.success('Order placed successfully! Awaiting store confirmation.');
        clearSelectedItems();
        navigate('/orders');
      } else {
        toast.error('Failed to place order. Please try again.');
      }
    } catch (error) {
      console.error('Error creating order:', error);
      if (error.response?.data?.errors) {
        // Handle validation errors
        const validationErrors = error.response.data.errors;
        const firstError = validationErrors[0];
        const errorMsg = typeof firstError === 'string'
          ? firstError
          : (firstError.msg || firstError.message || 'Validation error');
        toast.error(errorMsg);
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to place order. Please check your information and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyVoucher = async (codeOverride) => {
    const codeToUse = typeof codeOverride === 'string' ? codeOverride : voucherCode;
    if (!codeToUse || !codeToUse.trim()) {
      toast.error('Please enter a voucher code');
      return;
    }

    setIsVerifyingVoucher(true);
    try {
      // For now, we take the storeId of the first item if multiple stores exist
      // In a real multi-vendor setup, we'd need to handle store-specific vouchers better
      const storeId = checkoutItems[0]?.storeId;

      const response = await voucherService.verifyVoucher({
        code: codeToUse.toUpperCase(),
        storeId: storeId,
        purchaseAmount: checkoutTotalPrice
      });

      setAppliedVoucher(response.data.voucher);
      setVoucherCode(codeToUse.toUpperCase());
      toast.success('Voucher applied!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Invalid voucher code');
      setAppliedVoucher(null);
    } finally {
      setIsVerifyingVoucher(false);
    }
  };

  const checkVoucherValidity = (mv) => {
    if (!mv || !mv.voucher) return { isValid: false, reason: 'Invalid voucher' };
    
    const voucher = mv.voucher;
    const now = new Date();
    const currentStoreId = checkoutItems[0]?.storeId;
    
    // Check shop applicability
    // Handle both object and string ID comparison
    const voucherStoreId = (typeof voucher.store === 'object' && voucher.store?._id) 
        ? voucher.store._id 
        : voucher.store;
        
    if (currentStoreId && voucherStoreId && voucherStoreId.toString() !== currentStoreId.toString()) {
      return { isValid: false, reason: 'Wrong Shop' };
    }
    
    // Check minimum purchase
    if (checkoutTotalPrice < voucher.minPurchase) {
      return { isValid: false, reason: `Min. ₱${voucher.minPurchase.toLocaleString()}` };
    }
    
    // Check date
    const endDate = new Date(voucher.endDate);
    if (now > endDate) {
      return { isValid: false, reason: 'Expired' };
    }
    
    // Check usage
    if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) {
      return { isValid: false, reason: 'Fully Used' };
    }

    if (!voucher.isActive) {
        return { isValid: false, reason: 'Inactive' };
    }
    
    return { isValid: true, reason: 'Applicable' };
  };

  const calculateFinalTotal = () => {
    let total = checkoutTotalPrice;

    // Add shipping
    if (deliveryMethod === 'delivery' && !adminSettings.freeShipping) {
      if (total < adminSettings.freeShippingThreshold) {
        total += adminSettings.shippingFee;
      }
    }

    // Subtract discount
    if (appliedVoucher) {
      total -= appliedVoucher.discountAmount;
    }

    return Math.max(0, total);
  };

  if (checkoutItems.length === 0) {
    const hasItemsInCart = items && items.length > 0;

    return (
      <div className="text-center py-32 animate-fade-in">
        <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
          <ShoppingBag className="h-10 w-10 text-slate-200" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tight">
          {hasItemsInCart ? 'No Assets Selected' : 'Manifest Empty'}
        </h2>
        <p className="text-slate-500 mb-10 max-w-sm mx-auto font-medium">
          {hasItemsInCart
            ? 'Return to your manifest to select the assets you wish to deploy for checkout.'
            : 'Your mission manifest is currently empty. Initialize procurement to proceed.'}
        </p>
        <button
          onClick={() => navigate('/cart')}
          className="btn btn-primary px-10 py-4 text-xs font-black uppercase tracking-widest shadow-xl shadow-primary-100"
        >
          Return to Manifest
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Checkout</h1>
        <p className="text-gray-600">Review your order and complete your purchase</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Order Items */}
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Items</h2>
            <div className="space-y-4">
              {!checkoutItems || checkoutItems.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Your cart is empty</p>
              ) : (
                checkoutItems.map((item) => (
                  <div key={`${item.itemType}-${item.itemId}`} className="flex items-center gap-4 pb-4 border-b last:border-b-0">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {item.image ? (
                        <img
                          src={getImageUrl(item.image)}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = item.itemType === 'pet' ? '/images/placeholder-pet.png' : '/images/placeholder-product.png';
                          }}
                        />
                      ) : (
                        item.itemType === 'pet' ? (
                          <Heart className="h-6 w-6 text-slate-200" />
                        ) : (
                          <Package className="h-6 w-6 text-slate-200" />
                        )
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{item.name}</h4>
                      <p className="text-sm text-gray-500">{item.itemType === 'pet' ? 'Pet' : 'Product'}</p>
                      <p className="text-sm font-medium text-gray-900">₱{item.price} x {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">₱{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Delivery Method */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              <Truck className="inline h-5 w-5 mr-2" />
              Delivery Method
            </h2>
            <div className="space-y-3">
              <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-primary-300 transition-colors">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="delivery"
                  checked={deliveryMethod === 'delivery'}
                  onChange={(e) => setDeliveryMethod(e.target.value)}
                  className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                />
                <div className="ml-3 flex-1">
                  <div className="flex items-center">
                    <Truck className="h-5 w-5 text-primary-600 mr-2" />
                    <span className="font-medium text-gray-900">Home Delivery</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">We'll deliver your order to your address</p>
                </div>
              </label>

              <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-primary-300 transition-colors">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="pickup"
                  checked={deliveryMethod === 'pickup'}
                  onChange={(e) => setDeliveryMethod(e.target.value)}
                  className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                />
                <div className="ml-3 flex-1">
                  <div className="flex items-center">
                    <Store className="h-5 w-5 text-primary-600 mr-2" />
                    <span className="font-medium text-gray-900">Store Delivery (Pickup)</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Pick up your order at our store (Free)</p>
                </div>
              </label>
            </div>

            {deliveryMethod === 'pickup' && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Pickup Locations</p>
                {Array.from(new Set(checkoutItems.map(item => item.storeName))).map(storeName => {
                  const itemWithAddress = checkoutItems.find(item => item.storeName === storeName && item.storeAddress);
                  const firstItemOfStore = checkoutItems.find(item => item.storeName === storeName);
                  const address = itemWithAddress?.storeAddress ||
                    (firstItemOfStore?.storeId ? storeAddresses[firstItemOfStore.storeId] : null) ||
                    storeAddresses[storeName];

                  return (
                    <div key={storeName} className="p-4 bg-white rounded-2xl border border-slate-100 transition-all hover:border-primary-200 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                          <Store className="h-4 w-4 text-primary-600" />
                        </div>
                        <span className="font-black text-slate-900 uppercase text-[10px] tracking-[0.1em]">{storeName}</span>
                      </div>

                      {address ? (
                        <div className="space-y-3">
                          <div className="flex items-start gap-2 ml-1">
                            <MapPin className="h-3.5 w-3.5 text-primary-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-slate-600 font-bold leading-relaxed">
                              {address.street}, {address.barangay}, {address.city}
                            </p>
                          </div>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              `${address.street}, ${address.barangay}, ${address.city}, Cavite, Philippines`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-[9px] font-black text-white bg-primary-600 px-4 py-2 rounded-lg uppercase tracking-widest hover:bg-primary-700 transition-colors ml-1 shadow-md shadow-primary-100"
                          >
                            Get Directions
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 ml-1 p-3 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                          <div className="animate-pulse w-3 h-3 rounded-full bg-primary-200" />
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                            Fetching actual address...
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              className="input"
              placeholder="Enter your phone number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">We'll use this to contact you about your order.</p>
          </div>

          {deliveryMethod === 'delivery' && (
            <div className="card p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  <Truck className="inline h-5 w-5 mr-2" />
                  Delivery Address
                </h2>
                <button
                  type="button"
                  onClick={() => setEditAddress(!editAddress)}
                  className="text-sm text-primary-600 hover:text-primary-500 flex items-center gap-1"
                >
                  <Edit2 className="h-4 w-4" />
                  {editAddress ? 'Use Profile Address' : 'Change Address'}
                </button>
              </div>

              {!editAddress ? (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-600">
                          <strong>Current Address:</strong> {shippingAddress.street || 'No street'}, {shippingAddress.city || 'No city'}, {shippingAddress.barangay || 'No barangay'}, {shippingAddress.zipCode || 'No ZIP'}, Cavite, Philippines
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <button
                          type="button"
                          onClick={resetToProfileAddress}
                          className={`w-full py-2.5 px-5 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${addressApplied
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'btn btn-outline'
                            }`}
                        >
                          {addressApplied ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Address Applied!
                            </>
                          ) : (
                            <>
                              <Edit2 className="h-4 w-4" />
                              Use This Address
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 bg-slate-50 p-2 rounded-2xl mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Input Mode</p>
                    <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner">
                      <button
                        type="button"
                        onClick={() => setAddressInputType('map')}
                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${addressInputType === 'map' ? 'bg-white text-primary-600 shadow-sm scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        MAP GPS
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddressInputType('manual')}
                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${addressInputType === 'manual' ? 'bg-white text-primary-600 shadow-sm scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        MANUAL
                      </button>
                    </div>
                  </div>

                  {addressInputType === 'map' ? (
                    <div className="animate-fade-in">
                      <MapPicker 
                        onLocationSelected={(location) => {
                          setShippingAddress(prev => ({
                            ...prev,
                            street: location.street || location.full,
                            city: location.city.toLowerCase().replace(/\s+/g, '_').replace('municipality_of_', ''),
                            barangay: location.barangay.toLowerCase().replace(/\s+/g, '_'),
                            zipCode: location.zipCode || prev.zipCode
                          }));
                        }}
                        initialAddress={shippingAddress.street}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in px-1">
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Street Address</label>
                        <input
                          type="text"
                          required
                          className="w-full px-5 py-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-primary-500 outline-none font-bold text-sm transition-all shadow-sm"
                          value={shippingAddress.street}
                          onChange={(e) => handleAddressChange('street', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">City</label>
                        <select
                          className="w-full px-5 py-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-primary-500 outline-none font-bold text-sm transition-all shadow-sm appearance-none cursor-pointer"
                          value={shippingAddress.city}
                          onChange={(e) => handleAddressChange('city', e.target.value)}
                          required
                        >
                          <option value="">Select City</option>
                          {cities.map(city => (
                            <option key={city.value} value={city.value}>
                              {city.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Barangay</label>
                        <select
                          className="w-full px-5 py-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-primary-500 outline-none font-bold text-sm transition-all shadow-sm appearance-none cursor-pointer disabled:opacity-50"
                          value={shippingAddress.barangay}
                          onChange={(e) => handleAddressChange('barangay', e.target.value)}
                          disabled={!shippingAddress.city}
                          required
                        >
                          <option value="">Select Barangay</option>
                          {barangays.map(barangay => (
                            <option key={barangay.value} value={barangay.value}>
                              {barangay.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">ZIP Code</label>
                        <input
                          type="text"
                          required
                          className="w-full px-5 py-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-primary-500 outline-none font-bold text-sm transition-all shadow-sm"
                          value={shippingAddress.zipCode}
                          onChange={(e) => handleAddressChange('zipCode', e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
                      <div className="input bg-gray-100 text-gray-700 font-medium">
                        Cavite
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                      <div className="input bg-gray-100 text-gray-700 font-medium">
                        Philippines
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.barangay) {
                          toast.error('Please complete all required address fields');
                          return;
                        }
                        setEditAddress(false);
                        setAddressApplied(true);
                        setTimeout(() => setAddressApplied(false), 2000);
                        toast.success('Delivery address confirmed and applied!');
                      }}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 group"
                    >
                      <CheckCircle className="h-4 w-4 group-hover:scale-110 transition-transform" />
                      Confirm & Apply Delivery Address
                    </button>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter text-center mt-3 italic opacity-60">
                      * This address will only be used for this specific order
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Payment & Order Summary */}
        <div className="space-y-6">
          {/* Payment Method */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              <CreditCard className="inline h-5 w-5 mr-2" />
              Payment Method
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {getPaymentOptions().map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setPaymentMethod(method.value)}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${paymentMethod === method.value
                    ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-md'
                    : 'border-slate-100 hover:border-slate-200 text-slate-500 bg-white'
                    }`}
                >
                  <div className={`p-2 rounded-lg ${paymentMethod === method.value ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
                    {getPaymentIcon(method.value)}
                  </div>
                  <span className="text-sm font-bold leading-tight">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Vouchers */}
          <div className="card p-6 border-2 border-primary-50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                <Ticket className="inline h-6 w-6 mr-3 text-primary-600 animate-pulse" />
                Voucher Selection
              </h2>
              {appliedVoucher && (
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest animate-bounce">
                  Discount Active
                </span>
              )}
            </div>

            <div className="space-y-6">
              {/* Manual Input HUD */}
              <div className="flex gap-3 relative">
                <div className="relative flex-1 group">
                  <Tag className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${appliedVoucher ? 'text-emerald-500' : 'text-slate-400 group-focus-within:text-primary-500'}`} />
                  <input
                    type="text"
                    placeholder="ENTER SECRET CODE..."
                    className={`w-full !pl-16 pr-4 py-4 bg-slate-50 border-2 rounded-2xl outline-none transition-all font-black text-xs uppercase tracking-[0.2em] ${appliedVoucher 
                      ? 'border-emerald-200 bg-emerald-50/30 text-emerald-700' 
                      : 'border-transparent focus:border-primary-500 focus:bg-white text-slate-900 placeholder:text-slate-400'
                    }`}
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                    disabled={appliedVoucher || isVerifyingVoucher}
                  />
                </div>
                <button
                  type="button"
                  onClick={appliedVoucher ? () => { setAppliedVoucher(null); setVoucherCode(''); } : handleApplyVoucher}
                  disabled={isVerifyingVoucher}
                  className={`px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${appliedVoucher
                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white shadow-rose-100'
                    : 'bg-slate-900 text-white hover:bg-primary-600 shadow-slate-200'
                    }`}
                >
                  {isVerifyingVoucher ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Wait
                    </div>
                  ) : appliedVoucher ? 'Eject' : 'Deploy'}
                </button>
              </div>

              {/* Quick Selection HUD - Only show if not applied and have vouchers */}
              {!appliedVoucher && myVouchers.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Claimed Vouchers</p>
                    <button 
                      onClick={() => setShowVoucherModal(true)}
                      className="text-[9px] font-black text-primary-600 uppercase tracking-widest hover:underline"
                    >
                      View All ({myVouchers.length})
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {myVouchers.slice(0, 4).map((mv) => {
                      const { isValid, reason } = checkVoucherValidity(mv);
                      return (
                        <button
                          key={mv._id}
                          onClick={() => isValid && handleApplyVoucher(mv.voucher.code)}
                          disabled={!isValid}
                          className={`group flex items-center justify-between p-4 bg-white border-2 rounded-2xl transition-all text-left ${
                            isValid 
                              ? 'border-slate-100 hover:border-primary-500 hover:shadow-xl hover:shadow-primary-100' 
                              : 'border-slate-50 opacity-60 grayscale cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-inner ${
                                isValid ? 'bg-primary-50 text-primary-600 group-hover:bg-primary-600 group-hover:text-white' : 'bg-slate-100 text-slate-400'
                            }`}>
                              <Tag size={16} />
                            </div>
                            <div>
                              <p className={`text-[10px] font-black uppercase tracking-tighter mb-0.5 ${isValid ? 'text-slate-900' : 'text-slate-400'}`}>{mv.voucher.code}</p>
                              <p className={`text-[9px] font-bold uppercase tracking-widest ${isValid ? 'text-primary-600' : 'text-slate-400'}`}>
                                {isValid ? (mv.voucher.discountType === 'percentage' ? `${mv.voucher.discountValue}% OFF` : `₱${mv.voucher.discountValue} OFF`) : reason}
                              </p>
                            </div>
                          </div>
                          {isValid && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight size={14} className="text-primary-600" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {appliedVoucher && (
                <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-[2rem] animate-slide-up relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:rotate-12 transition-transform">
                    <CheckCircle className="w-24 h-24 text-emerald-600" />
                  </div>
                  <div className="flex items-center gap-5 relative z-10">
                    <div className="w-16 h-16 bg-white rounded-[1.5rem] text-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-200">
                      <Tag size={28} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.3em]">Authorized Discount</span>
                      </div>
                      <h4 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter leading-none">{appliedVoucher.code}</h4>
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-1">
                        Success: Deducted ₱{appliedVoucher.discountAmount.toLocaleString()} from total manifest
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Order Notes */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Note to Store (Optional)</h2>
            <textarea
              className="input"
              rows={3}
              placeholder="Any special instructions for your order..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Order Summary */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({checkoutItems.length} items)</span>
                <span>₱{checkoutTotalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Delivery Method</span>
                <span className="capitalize">{deliveryMethod === 'delivery' ? 'Home Delivery' : 'Store Pickup'}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>{deliveryMethod === 'pickup' ? 'Free' : adminSettings.freeShipping ? 'Free' : `₱${adminSettings.shippingFee}`}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax</span>
                <span>₱0.00</span>
              </div>
              {appliedVoucher && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Discount ({appliedVoucher.code})</span>
                  <span>-₱{appliedVoucher.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t pt-3">
                <div className="flex justify-between text-lg font-semibold text-gray-900">
                  <span>Total</span>
                  <span>₱{calculateFinalTotal().toFixed(2)}</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6">
              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary w-full flex items-center justify-center gap-3 py-5 text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl shadow-primary-200 hover:-translate-y-0.5 transition-all active:scale-95"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></div>
                    Executing...
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-4 w-4" />
                    {['cash_on_delivery', 'cash_on_pickup'].includes(paymentMethod) 
                      ? 'Confirm Order' 
                      : `Pay via ${paymentMethod.replace('_', ' ')}`
                    }
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
      {/* Voucher Selection Modal */}
      {showVoucherModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in text-slate-900">
          <div className="bg-white rounded-[3rem] max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Your <span className="text-primary-600 italic">Vouchers</span></h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select a claimed discount</p>
              </div>
              <button onClick={() => setShowVoucherModal(false)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto no-scrollbar">
              {myVouchers.length > 0 ? (
                myVouchers.map((mv) => {
                  const { isValid, reason } = checkVoucherValidity(mv);
                  return (
                    <button
                      key={mv._id}
                      onClick={() => {
                        if (isValid) {
                          handleApplyVoucher(mv.voucher.code);
                          setShowVoucherModal(false);
                        }
                      }}
                      disabled={!isValid}
                      className={`w-full text-left p-6 rounded-3xl border-2 transition-all group relative overflow-hidden ${
                        isValid 
                          ? 'border-slate-100 hover:border-primary-200 bg-slate-50 hover:bg-primary-50' 
                          : 'border-slate-50 opacity-60 grayscale cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-4 relative z-10">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all ${
                            isValid ? 'bg-white text-primary-600 group-hover:bg-primary-600 group-hover:text-white' : 'bg-slate-200 text-slate-400'
                        }`}>
                          <Tag size={20} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <h4 className={`font-black uppercase tracking-tighter ${isValid ? 'text-slate-900' : 'text-slate-400'}`}>{mv.voucher.code}</h4>
                            {!isValid && (
                                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[8px] font-black uppercase tracking-widest rounded-full">
                                    {reason}
                                </span>
                            )}
                          </div>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${isValid ? 'text-primary-600' : 'text-slate-400'}`}>
                              {mv.voucher.discountType === 'percentage' ? `${mv.voucher.discountValue}% OFF` : `₱${mv.voucher.discountValue} OFF`}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Min. Purchase: ₱{mv.voucher.minPurchase.toLocaleString()}</p>
                            {isValid && (
                              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">Available</p>
                            )}
                          </div>
                        </div>
                      </div>
                      {isValid && (
                        <div className="absolute top-1/2 right-6 -translate-y-1/2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight size={16} className="text-primary-600" />
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <Ticket className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">No claimed vouchers found</p>
                </div>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100">
                <button 
                    onClick={() => navigate('/vouchers')}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-primary-600 transition-all"
                >
                    Explore More Discounts
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Checkout;
