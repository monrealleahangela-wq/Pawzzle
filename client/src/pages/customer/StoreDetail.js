import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { storeService, getImageUrl, socialService } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { chatService } from '../../services/chatService';
import { formatTime12h } from '../../utils/timeFormatters';
import { Clock, Package, Scissors, ChevronLeft, ShoppingBag, Heart, Plus, Star, MessageCircle, Building, ShoppingCart, Zap, Shield, Check, Users, AlertTriangle, MapPin, Download } from 'lucide-react';
import GoogleMap from '../../components/GoogleMap';
import ReviewSection from '../../components/ReviewSection';
import UserReportModal from '../../components/UserReportModal';
import StoreContactIntel from '../../components/profile/StoreContactIntel';
import { formatPeso } from '../../utils/paymentSummary';

const StoreDetail = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { addToCart, buyNow } = useCart();
  const [store, setStore] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [pets, setPets] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('products');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  useEffect(() => {
    if (isAuthenticated && store?.owner?._id) {
        checkFollowStatus();
    }
  }, [store?.owner?._id, isAuthenticated]);

  const checkFollowStatus = async () => {
    try {
        const res = await socialService.checkFollowStatus(store.owner._id);
        setIsFollowing(res.data.isFollowing);
    } catch (error) {
        console.error('Error checking follow status:', error);
    }
  };

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
        toast.error('Please log in to follow this store.');
        navigate('/login');
        return;
    }

    if (store.owner._id === user._id) {
        toast.error('You cannot follow yourself');
        return;
    }

    try {
        setIsTogglingFollow(true);
        if (isFollowing) {
            await socialService.unfollowUser(store.owner._id);
            setIsFollowing(false);
            setFollowerCount(prev => Math.max(0, prev - 1));
            toast.info(`Unfollowed ${store.name}`);
        } else {
            await socialService.followUser(store.owner._id);
            setIsFollowing(true);
            setFollowerCount(prev => prev + 1);
            toast.success(`Following ${store.name}!`);
        }
    } catch (error) {
        toast.error('We could not update this store follow. Please try again.');
    } finally {
        setIsTogglingFollow(false);
    }
  };

  const handleToggleFavorite = () => {
    // Legacy local favorite heart - keeping for UI but can be merged later
    const favorites = JSON.parse(localStorage.getItem('favoriteStores') || '[]');
    const isLocalFav = favorites.includes(storeId);
    if (isLocalFav) {
      const updated = favorites.filter(id => id !== storeId);
      localStorage.setItem('favoriteStores', JSON.stringify(updated));
      toast.info('Removed from favorite stores.');
    } else {
      favorites.push(storeId);
      localStorage.setItem('favoriteStores', JSON.stringify(favorites));
      toast.success('Added to favorite stores.');
    }
    // Update local state if we want to keep showing the heart
    window.dispatchEvent(new Event('storage'));
  };

  const handleStartChat = async () => {
    if (!user) {
      toast.error('Please log in to chat with this store');
      navigate('/login');
      return;
    }
    if (!store?.owner?._id) {
      toast.error('Store owner not available for chat');
      return;
    }
    setChatLoading(true);
    try {
      const response = await chatService.createConversation({
        participantIds: [store.owner._id],
        type: 'general'
      });
      if (response.data?.conversation) {
        toast.success('Store conversation opened. Check your messages.');
        // Trigger the floating chat manager to open
        localStorage.setItem('newConversation', Date.now().toString());
        window.dispatchEvent(new StorageEvent('storage', { key: 'newConversation' }));
      }
    } catch (error) {
      console.error('Error starting chat:', error);
      toast.error('We could not start the chat. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleDownloadStoreCard = () => {
    if (!store) return;
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${store.name}`,
      `ORG:${store.name}`,
      store.contactInfo?.phone ? `TEL:${store.contactInfo.phone}` : '',
      store.contactInfo?.email ? `EMAIL:${store.contactInfo.email}` : '',
      store.contactInfo?.website ? `URL:${store.contactInfo.website}` : '',
      store.contactInfo?.address ? `ADR:;;${store.contactInfo.address.street};${store.contactInfo.address.city};${store.contactInfo.address.state};${store.contactInfo.address.zipCode};${store.contactInfo.address.country}` : '',
      store.description ? `NOTE:${store.description.substring(0, 200)}` : '',
      'END:VCARD'
    ].filter(Boolean).join('\n');

    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${store.name.replace(/\s+/g, '_')}_contact.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Store contact saved.');
  };

  const handleAddToCart = (product) => {
    if (product.productMode === 'variant') {
      navigate(`/products/${product._id}`);
      toast.info('Choose an available product option first.');
      return;
    }
    if (!isAuthenticated || !user) {
      toast.error('Please log in to add items to cart');
      navigate('/login');
      return;
    }

    const userId = user._id || user.id;

    addToCart({
      itemId: product._id,
      name: product.name,
      price: product.price,
      category: product.category,
      image: product.images?.[0] || null,
      quantity: 1,
      itemType: 'product',
      storeName: store.name,
      storeId: store._id,
      storeAddress: store.contactInfo?.address,
      userId: userId
    });
    toast.success(`${product.name} added to cart!`);
  };

  const handleBuyNow = (product) => {
    if (product.productMode === 'variant') {
      navigate(`/products/${product._id}`);
      toast.info('Choose an available product option first.');
      return;
    }
    if (!isAuthenticated || !user) {
      toast.error('Please log in to proceed');
      navigate('/login');
      return;
    }

    const userId = user._id || user.id;

    const item = {
      itemId: product._id,
      name: product.name,
      price: product.price,
      category: product.category,
      image: product.images?.[0] || null,
      quantity: 1,
      itemType: 'product',
      storeName: store.name,
      storeId: store._id,
      storeAddress: store.contactInfo?.address,
      userId: userId,
      selected: true
    };

    // Logic: Atomic buyNow handles deselection and addition
    buyNow(item);

    setTimeout(() => {
      navigate('/checkout');
    }, 100);
  };

  const fetchStoreDetails = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setStore(null);
      const response = await storeService.getStoreDetails(storeId);
      setStore(response.data.store);
      setFollowerCount(response.data.followerCount || 0);
      setProducts(response.data.products || []);
      setServices(response.data.services || []);
      setPets(response.data.pets || []);
      setStaff(response.data.staff || []);
    } catch (error) {
      console.error('Error fetching store details:', error);
      const notFound = error.response?.status === 404;
      setLoadError(notFound ? 'not_found' : 'failed');
      toast.error(notFound ? 'Store not found.' : 'We could not load this store. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchStoreDetails();
  }, [fetchStoreDetails]);

  const isStoreOpen = () => {
    if (!store?.businessHours) return false;

    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const hours = store.businessHours[dayName];

    if (!hours || hours.closed) return false;
    if (!hours.open || !hours.close) return false;

    try {
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
      const parseToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) || 0;
        return h * 60 + m;
      };

      const openMinutes = parseToMinutes(hours.open);
      const closeMinutes = parseToMinutes(hours.close);

      if (closeMinutes < openMinutes) {
        return currentTimeInMinutes >= openMinutes || currentTimeInMinutes <= closeMinutes;
      }
      return currentTimeInMinutes >= openMinutes && currentTimeInMinutes <= closeMinutes;
    } catch (error) {
      console.error('Error calculating open status:', error);
      return false;
    }
  };

  const isOnline = () => {
    if (!store?.owner?.lastSeen) return false;
    const lastSeen = new Date(store.owner.lastSeen);
    const now = new Date();
    // Online if active in the last 5 minutes
    return (now - lastSeen) < 5 * 60 * 1000;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 border-4 border-primary-200 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
          <Building className="absolute inset-0 m-auto h-8 w-8 text-primary-600 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!store && loadError === 'failed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 text-center max-w-lg">
          <div className="w-20 h-20 bg-amber-50 rounded-[1.5rem] flex items-center justify-center text-amber-600 mx-auto mb-8">
            <AlertTriangle className="h-10 w-10" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Unable to Load Store</h2>
          <p className="text-slate-500 font-medium mb-10 leading-relaxed">This store could not be loaded right now. Please retry the request.</p>
          <button type="button" onClick={fetchStoreDetails} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-black transition-all">Try Again</button>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 text-center max-w-lg">
          <div className="w-20 h-20 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-slate-300 mx-auto mb-8">
            <ShoppingBag className="h-10 w-10" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Store Not Found</h2>
          <p className="text-slate-500 font-medium mb-10 leading-relaxed">
            The store you're looking for doesn't exist or has been removed. Check out our other pet partners!
          </p>
          <Link to="/products" className="w-full inline-block py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-black transition-all">
            Browse Market
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] pb-36 sm:pb-12">
      <section className="mx-auto max-w-7xl px-2 pt-3 sm:px-5 sm:pt-5 lg:px-8" data-testid="store-profile-hero">
        <div className="overflow-hidden rounded-[1.75rem] border border-primary-100 bg-white shadow-[0_18px_55px_rgba(76,38,13,0.10)] sm:rounded-[2rem]">
          <div className="relative h-36 overflow-hidden sm:h-44 lg:h-52">
            {store.coverImage ? (
              <img src={getImageUrl(store.coverImage)} alt={`${store.name} cover`} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-primary-900 to-primary-950" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/10 to-slate-950/25" />
            <button
              type="button"
              onClick={() => window.history.back()}
              className="absolute left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-slate-950/35 text-white shadow-lg backdrop-blur-md transition hover:bg-white hover:text-slate-900 sm:left-4 sm:top-4"
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-1.5 sm:bottom-4 sm:right-4">
              {store.verificationStatus === 'verified' && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-primary-700/95 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-lg backdrop-blur">
                  <Shield className="h-3 w-3" /> Verified store
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-lg backdrop-blur ${isStoreOpen() ? 'bg-emerald-700/95' : 'bg-slate-700/95'}`}>
                <Clock className="h-3 w-3" /> {isStoreOpen() ? 'Open now' : 'Closed now'}
              </span>
            </div>
          </div>

          <div className="relative px-4 pb-4 sm:px-6 sm:pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="-mt-10 shrink-0 sm:-mt-12">
                {store.logo ? (
                  <img src={getImageUrl(store.logo)} alt={`${store.name} logo`} className="h-20 w-20 rounded-2xl border-4 border-white bg-white object-cover shadow-xl sm:h-24 sm:w-24" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-slate-50 text-slate-300 shadow-xl sm:h-24 sm:w-24">
                    <Building className="h-9 w-9" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 sm:pb-0.5">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h1 className="break-words text-2xl font-black uppercase leading-none tracking-[-0.035em] text-slate-950 sm:text-3xl">{store.name}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500 sm:text-xs">
                      {store.ratings && store.ratings.count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-primary-800"><Star className="h-3.5 w-3.5 fill-primary-600 text-primary-600" /> {store.ratings.average.toFixed(1)} from {store.ratings.count} {store.ratings.count === 1 ? 'review' : 'reviews'}</span>
                      ) : (
                        <span>No reviews yet</span>
                      )}
                      {user?.role !== 'super_admin' && <span>{followerCount.toLocaleString()} {followerCount === 1 ? 'follower' : 'followers'}</span>}
                      <span className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${isOnline() ? 'bg-emerald-500' : 'bg-slate-300'}`} /> Seller {isOnline() ? 'online' : 'offline'}</span>
                    </div>
                  </div>
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => setIsReportModalOpen(true)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-500 transition hover:bg-rose-100"
                      title="Report this store"
                      aria-label="Report this store"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="mt-2 max-w-2xl text-xs font-medium leading-relaxed text-slate-600 line-clamp-2 break-words sm:text-sm">
                  {store.description || 'Browse this store’s available products, pet services, and listings.'}
                </p>
              </div>

              <div className="flex shrink-0 gap-2 sm:pb-0.5">
                {user?.role !== 'super_admin' && (
                  <button
                    type="button"
                    onClick={handleToggleFollow}
                    disabled={isTogglingFollow}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-[10px] font-black uppercase tracking-wider transition active:scale-95 disabled:opacity-60 sm:flex-none ${isFollowing
                      ? 'border-primary-200 bg-primary-50 text-primary-700'
                      : 'border-slate-900 bg-slate-900 text-white hover:bg-primary-700'
                    }`}
                  >
                    {isFollowing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {isFollowing ? 'Following' : 'Follow store'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleStartChat}
                  disabled={chatLoading}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary-200 bg-white px-4 text-[10px] font-black uppercase tracking-wider text-primary-800 transition hover:bg-primary-50 active:scale-95 disabled:opacity-60 sm:flex-none"
                >
                  {chatLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-700 border-t-transparent" /> : <MessageCircle className="h-4 w-4" />}
                  Message store
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-20 mx-auto mt-4 max-w-7xl px-2 sm:px-5 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-10">

          {/* Main Catalog View */}
          <div className="space-y-4 lg:col-span-8 sm:space-y-6">
            <div className="content-scroll-row gap-1 rounded-2xl border border-primary-100 bg-white p-1.5 shadow-sm sm:gap-1.5 sm:p-2" aria-label="Store sections">
              {[
                { id: 'products', label: 'Products', icon: Package, count: products.length },
                { id: 'services', label: 'Services', icon: Scissors, count: services.length },
                { id: 'pets', label: 'Pets', icon: Heart, count: pets.length },
                ...(staff.length > 0 ? [{ id: 'experts', label: 'Store team', icon: Users, count: staff.length }] : [])
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-h-10 min-w-[7rem] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-all sm:min-w-0 sm:flex-1 ${activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-500 hover:bg-primary-50 hover:text-primary-800'
                    }`}
                  aria-pressed={activeTab === tab.id}
                >
                  <tab.icon className={`h-3.5 w-3.5 ${activeTab === tab.id ? 'text-primary-300' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[7px] ${activeTab === tab.id ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Grid Views - Maximum Density */}
            <div className="min-h-[300px]">
              {activeTab === 'products' && (
                <div className="responsive-card-grid [--card-min:14rem] [--card-gap:0.875rem] animate-fade-in px-1 sm:[--card-min:15rem] sm:[--card-gap:1rem]">
                  {products.length > 0 ? products.map(product => (
                    <div key={product._id} className="group flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-3">
                      <Link to={`/products/${product._id}`} className="block flex-1">
                        <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-slate-50">
                          {product.images?.[0] ? (
                            <img src={getImageUrl(product.images[0])} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Package className="h-6 w-6 text-slate-200" /></div>
                          )}
                        </div>
                        <div className="mb-3 space-y-1 px-1">
                          <p className="break-words text-[8px] font-black uppercase leading-tight tracking-wider text-primary-600">{product.category}</p>
                          <h3 className="min-h-[2.25rem] text-sm font-black uppercase leading-tight text-slate-900 line-clamp-2 break-words">{product.name}</h3>
                          <p className="text-base font-black tracking-tight text-primary-800">{formatPeso(product.price)}</p>
                        </div>
                      </Link>
                      <div className="mt-auto grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAddToCart(product)}
                          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-primary-50 px-2 text-[8px] font-black uppercase tracking-wide text-primary-800 transition hover:bg-primary-100 active:scale-95"
                          title={product.productMode === 'variant' ? 'View product options' : 'Add to cart'}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          {product.productMode === 'variant' ? 'Options' : 'Add cart'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBuyNow(product)}
                          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 text-[8px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-primary-700 active:scale-95"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {product.productMode === 'variant' ? 'Choose' : 'Buy now'}
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-full py-12 text-center text-slate-300">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-10" />
                      <p className="font-black text-[10px] uppercase tracking-widest opacity-50">No products available yet</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'services' && (
                <div className="grid grid-cols-1 gap-2 sm:gap-6 animate-fade-in px-1">
                  {services.length > 0 ? services.map(service => (
                    <div key={service._id} className="group flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition-all hover:shadow-xl sm:flex-row sm:items-center sm:gap-6 sm:rounded-[2.5rem] sm:p-6">
                      <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-primary-50 text-primary-600 sm:h-28 sm:w-28 sm:rounded-[2rem]">
                        {service.images?.[0] ? (
                          <img src={getImageUrl(service.images[0])} alt={service.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <Scissors className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 sm:h-10 sm:w-10" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-black uppercase leading-tight text-slate-900 line-clamp-2 break-words sm:text-xl">{service.name}</h4>
                        <p className="text-xs font-bold leading-relaxed text-slate-500 opacity-70 line-clamp-2 break-words sm:text-sm">{service.description}</p>
                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400 sm:text-xs">{service.duration} MIN</span>
                      </div>
                      <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end sm:text-right">
                        <p className="mb-1 text-[11px] font-black tracking-tighter text-slate-900 sm:mb-2 sm:text-2xl">{formatPeso(service.price)}</p>
                        <Link to={`/bookings?service=${service._id}`} className="inline-block px-3 sm:px-8 py-1.5 sm:py-4 bg-slate-900 text-white rounded-lg sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest active:scale-95">
                          Book
                        </Link>
                      </div>
                    </div>
                  )) : (
                    <div className="py-12 text-center text-slate-300">
                      <Scissors className="h-10 w-10 mx-auto mb-2 opacity-10" />
                      <p className="font-black text-[10px] uppercase tracking-widest opacity-50">No services available yet</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pets' && (
                <div className="responsive-card-grid [--card-min:17rem] sm:[--card-min:18rem] sm:[--card-gap:1.5rem] animate-fade-in px-1">
                  {pets.length > 0 ? pets.map(pet => (
                    <Link to={`/pets/${pet._id}`} key={pet._id} className="group bg-white rounded-xl sm:rounded-[2.5rem] p-2 sm:p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col h-full">
                      <div className="relative aspect-[4/3] rounded-lg sm:rounded-[2rem] overflow-hidden mb-2 sm:mb-6 bg-slate-50">
                        {pet.images?.[0] ? (
                          <img src={getImageUrl(pet.images[0])} alt={pet.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-200"><Heart className="h-6 w-6" /></div>
                        )}
                        <div className="absolute top-1 right-1">
                          <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-md text-white rounded-full text-[6px] font-black uppercase tracking-widest uppercase">{pet.gender}</span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-0.5 sm:space-y-4 px-1">
                        <h3 className="min-h-[2.5rem] text-sm font-black uppercase leading-tight text-slate-900 line-clamp-2 break-words sm:text-lg">{pet.name}</h3>
                        <p className="text-[7px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest truncate opacity-80">{pet.breed}</p>
                        <p className="border-t border-slate-50 pt-1 text-[11px] font-black tracking-tighter text-primary-600 sm:pt-4 sm:text-xl">{formatPeso(pet.price)}</p>
                      </div>
                    </Link>
                  )) : (
                    <div className="col-span-full py-12 text-center text-slate-300">
                      <Heart className="h-10 w-10 mx-auto mb-2 opacity-10" />
                      <p className="font-black text-[10px] uppercase tracking-widest opacity-50">No pets available yet</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'experts' && (
                <div className="responsive-card-grid [--card-min:18rem] sm:[--card-gap:2rem] animate-fade-in px-1">
                  {staff.length > 0 ? staff.map(member => (
                    <div key={member._id} className="group bg-white rounded-xl sm:rounded-[2.5rem] p-4 sm:p-8 border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                      <div className="flex items-center gap-4 sm:gap-6 mb-6">
                        <div className="relative">
                          {member.avatar ? (
                            <img src={getImageUrl(member.avatar)} alt={member.firstName} className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[2rem] object-cover ring-4 ring-slate-50" />
                          ) : (
                            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[2rem] bg-slate-100 flex items-center justify-center text-slate-300 ring-4 ring-slate-50 font-black text-xl">
                              {member.firstName?.[0]}{member.lastName?.[0]}
                            </div>
                          )}
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-white flex items-center justify-center shadow-lg ${ member.lastSeen && (new Date() - new Date(member.lastSeen)) < 5 * 60 * 1000 ? 'bg-emerald-500' : 'bg-slate-300' }`} title={ member.lastSeen && (new Date() - new Date(member.lastSeen)) < 5 * 60 * 1000 ? 'Active' : 'Offline' }>
                             {member.lastSeen && (new Date() - new Date(member.lastSeen)) < 5 * 60 * 1000 && <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse" />}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm sm:text-lg font-black text-slate-900 truncate uppercase tracking-tight">{member.firstName} {member.lastName}</h3>
                            <Shield className="h-3 w-3 sm:h-4 sm:w-4 text-primary-600" />
                          </div>
                          <p className="text-[9px] sm:text-xs font-black text-primary-600 uppercase tracking-widest mb-2">{member.staffType?.replace(/_/g, ' ')}</p>
                          <div className="flex items-center gap-1.5">
                            <Star className={`h-3 w-3 text-secondary-500 ${member.professionalProfile?.reviewCount > 0 ? 'fill-secondary-500' : ''}`} />
                            <span className="text-[10px] sm:text-sm font-black text-slate-900">
                              {member.professionalProfile?.reviewCount > 0
                                ? `${Number(member.professionalProfile.rating).toFixed(1)} · ${member.professionalProfile.reviewCount}`
                                : 'No ratings yet'}
                            </span>
                            <span className="text-slate-300">/</span>
                            <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">{member.professionalProfile?.experienceYears || 0}Y EXP</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="p-3 sm:p-5 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[10px] sm:text-sm text-slate-600 font-medium italic line-clamp-2 leading-relaxed">
                            "{member.professionalProfile?.bio || 'Professional staff dedicated to providing the best care for your pets.'}"
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {member.professionalProfile?.specializations?.slice(0, 3).map((spec, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-white border border-slate-100 text-slate-500 rounded-lg text-[7px] sm:text-[9px] font-black uppercase tracking-widest shadow-sm">
                              {spec}
                            </span>
                          ))}
                          {(member.professionalProfile?.specializations?.length > 3) && (
                            <span className="px-1.5 py-0.5 bg-slate-900 text-white rounded-lg text-[7px] sm:text-[9px] font-black uppercase tracking-widest">
                              +{member.professionalProfile.specializations.length - 3} More
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-full py-12 text-center text-slate-300">
                      <Users className="h-10 w-10 mx-auto mb-2 opacity-10" />
                      <p className="font-black text-[10px] uppercase tracking-widest opacity-50">No team members listed yet</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Reviews Section */}
            <div className="pt-8 sm:pt-16 border-t border-slate-100">
              <ReviewSection targetType="Store" targetId={storeId} />
            </div>
          </div>

          <aside className="space-y-4 pb-12 lg:col-span-4">
            <div className="relative overflow-hidden rounded-[1.75rem] bg-slate-900 p-5 text-white shadow-xl sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary-700/30 blur-3xl" />
              <div className="relative z-10 space-y-4">
                <div>
                  <h4 className="text-base font-black uppercase tracking-tight">Store contact</h4>
                  <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-400">Call, email, or open the store location.</p>
                </div>
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <StoreContactIntel contactInfo={store.contactInfo} />
                  <div
                    className="group cursor-pointer"
                    onClick={() => navigate(`/find-shops?store=${store._id}`)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/find-shops?store=${store._id}`); }}
                    role="button"
                    tabIndex={0}
                    aria-label="View store location and directions"
                  >
                    <div className="relative overflow-hidden rounded-2xl">
                      <GoogleMap
                        address={`${store.contactInfo?.address?.street}, ${store.contactInfo?.address?.city}, ${store.contactInfo?.address?.state}`}
                        storeName={store.name}
                        coordinates={store.contactInfo?.address?.coordinates}
                        className="pointer-events-none w-full [&>div:first-child]:!min-h-[10rem] [&>div:last-child]:hidden [&_iframe]:!min-h-[10rem]"
                        onDirectionsClick={() => navigate(`/find-shops?store=${store._id}`)}
                        onViewOnMapClick={() => navigate(`/find-shops?store=${store._id}`)}
                      />
                      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 rounded-xl bg-slate-950/85 px-3 py-2 text-white shadow-lg backdrop-blur-md">
                        <span className="inline-flex min-w-0 items-center gap-2 text-[9px] font-black uppercase tracking-wider"><MapPin className="h-3.5 w-3.5 shrink-0 text-primary-300" /> View location</span>
                        <span className="text-[8px] font-bold text-slate-300">Directions</span>
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={handleDownloadStoreCard} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-900 shadow-lg transition hover:bg-primary-50 active:scale-95">
                  <Download className="h-3.5 w-3.5" /> Save store contact
                </button>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-sm sm:p-6">
              <h4 className="mb-3 flex items-center justify-between text-sm font-black uppercase tracking-tight text-slate-900">
                <span>Business hours</span>
                <Clock className="h-4 w-4 text-primary-500" />
              </h4>
              <div className="space-y-1">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                  const isToday = day === today;
                  const hours = store.businessHours?.[day];
                  return (
                    <div key={day} className={`flex items-center justify-between rounded-lg px-2.5 py-2 ${isToday ? 'bg-primary-50 ring-1 ring-primary-100' : ''}`}>
                      <span className={`text-[9px] font-black uppercase tracking-wider ${isToday ? 'text-primary-700' : 'text-slate-500'}`}>{isToday ? 'Today' : day.substring(0, 3)}</span>
                      <span className={`text-[9px] font-bold ${isToday ? 'text-primary-800' : 'text-slate-700'}`}>
                        {hours && !hours.closed ? `${formatTime12h(hours.open)} – ${formatTime12h(hours.close)}` : 'Closed'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
      <UserReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        reportedUser={store.owner}
      />
    </div>
  );
};

export default StoreDetail;
