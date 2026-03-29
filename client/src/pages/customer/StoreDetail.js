import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { storeService, getImageUrl, socialService } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { chatService } from '../../services/chatService';
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Package,
  Scissors,
  ChevronLeft,
  ShoppingBag,
  Heart,
  Plus,
  Star,
  ExternalLink,
  MessageCircle,
  Calendar,
  Building,
  Globe,
  Download,
  ShoppingCart,
  Zap,
  Shield,
  Check,
  Users,
  AlertTriangle
} from 'lucide-react';
import GoogleMap from '../../components/GoogleMap';
import ReviewSection from '../../components/ReviewSection';
import UserReportModal from '../../components/UserReportModal';

const StoreDetail = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { addToCart, buyNow } = useCart();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [pets, setPets] = useState([]);
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
        toast.error('Please log in to follow this partner');
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
        toast.error('Failed to update follow status');
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
      toast.info('Removed from favorites');
    } else {
      favorites.push(storeId);
      localStorage.setItem('favoriteStores', JSON.stringify(favorites));
      toast.success('Added to favorites! ❤️');
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
        toast.success('Chat opened! Check your messages.');
        // Trigger the floating chat manager to open
        localStorage.setItem('newConversation', Date.now().toString());
        window.dispatchEvent(new StorageEvent('storage', { key: 'newConversation' }));
      }
    } catch (error) {
      console.error('Error starting chat:', error);
      toast.error('Failed to start chat. Please try again.');
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
    toast.success('Store contact card downloaded!');
  };

  const handleAddToCart = (product) => {
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
      const response = await storeService.getStoreDetails(storeId);
      setStore(response.data.store);
      setFollowerCount(response.data.followerCount || 0);
      setProducts(response.data.products || []);
      setServices(response.data.services || []);
      setPets(response.data.pets || []);
    } catch (error) {
      console.error('Error fetching store details:', error);
      toast.error('Failed to load store details');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchStoreDetails();
  }, [fetchStoreDetails]);

  const isStoreOpen = () => {
    if (!store?.businessHours) return false;

    // Use consistent day detection matching the sidebar
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const hours = store.businessHours[dayName];

    if (!hours || hours.closed) return false;
    if (!hours.open || !hours.close) return false;

    try {
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

      const parseToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        // Handle HH:mm or HH:mm:ss
        const parts = timeStr.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) || 0;
        return h * 60 + m;
      };

      const openMinutes = parseToMinutes(hours.open);
      const closeMinutes = parseToMinutes(hours.close);

      // Handle overnight hours (e.g., 22:00 - 02:00)
      if (closeMinutes < openMinutes) {
        return currentTimeInMinutes >= openMinutes || currentTimeInMinutes <= closeMinutes;
      }

      return currentTimeInMinutes >= openMinutes && currentTimeInMinutes <= closeMinutes;
    } catch (error) {
      console.error('Error calculating open status:', error);
      return false;
    }
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
    <div className="min-h-screen bg-[#F8FAFC] pb-12">
      {/* Dynamic Hero Section - Optimized for Compact Mobile */}
      <div className="relative h-[30vh] sm:h-[60vh] w-full overflow-hidden">
        {store.coverImage ? (
          <img src={getImageUrl(store.coverImage)} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-primary-900 to-primary-950"></div>
        )}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"></div>
        <div className="absolute bottom-0 left-0 right-0 h-32 sm:h-96 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/40 to-transparent"></div>

        {/* Navigation - Ultra Compact */}
        <div className="absolute top-3 sm:top-8 left-3 sm:left-8 z-30">
          <button onClick={() => window.history.back()} className="p-2 sm:p-4 bg-white/20 backdrop-blur-xl border border-white/30 text-white rounded-lg sm:rounded-2xl hover:bg-white hover:text-slate-900 transition-all active:scale-95">
            <ChevronLeft className="h-4 w-4 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="absolute bottom-4 sm:bottom-16 left-0 right-0 px-3 md:px-8 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center md:items-end gap-3 sm:gap-10">
            <div className="relative shrink-0">
              {store.logo ? (
                <img src={getImageUrl(store.logo)} alt="Logo" className="w-20 h-20 sm:w-40 sm:h-40 rounded-2xl sm:rounded-[2.5rem] ring-2 sm:ring-8 ring-white/20 shadow-2xl relative z-10 object-cover" />
              ) : (
                <div className="w-20 h-20 sm:w-40 sm:h-40 rounded-2xl sm:rounded-[2.5rem] bg-white flex items-center justify-center ring-2 sm:ring-8 ring-white/20 shadow-2xl relative z-10">
                  <Building className="h-8 w-8 sm:h-20 sm:w-20 text-slate-200" />
                </div>
              )}
            </div>

            <div className="flex-1 space-y-1 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5">
                {store.verificationStatus === 'verified' && (
                  <span className="px-2 py-0.5 bg-primary-600 text-white rounded-full text-[7px] sm:text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1">
                    <Shield className="h-2 w-2 sm:h-3 sm:w-3 fill-white/20" /> Official
                  </span>
                )}
                {store.verificationStatus === 'pending' && (
                  <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-[7px] sm:text-[10px] font-black uppercase tracking-widest shadow-lg">
                    Pending
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-[7px] sm:text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg transition-all ${isStoreOpen() ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                  <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white ${isStoreOpen() ? 'animate-pulse' : ''}`} />
                  {isStoreOpen() ? 'Online' : 'Offline'}
                </span>
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-[7px] sm:text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1">
                  <Users className="h-2 w-2 sm:h-3 sm:w-3 fill-white/20" /> {followerCount.toLocaleString()} {followerCount === 1 ? 'Follower' : 'Followers'}
                </span>
              </div>
              <h1 className="text-xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tighter leading-tight uppercase truncate max-w-full flex items-center gap-3">
                {store.name}
                {isAuthenticated && (
                  <button 
                    onClick={() => setIsReportModalOpen(true)}
                    className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all"
                    title="Report Shop"
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                )}
              </h1>
              {store.ratings && store.ratings.count > 0 && (
                <div className="flex items-center gap-1.5 mt-2 bg-amber-50/80 backdrop-blur-md rounded-xl px-3 py-1.5 w-fit border border-amber-100 mb-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span className="text-xs font-black text-amber-700 tracking-wider">
                    {store.ratings.average.toFixed(1)} <span className="font-bold opacity-70">({store.ratings.count})</span>
                  </span>
                </div>
              )}
              <p className="text-slate-500 font-bold text-[9px] sm:text-lg max-w-xl italic line-clamp-1 opacity-80 uppercase tracking-tight">
                {store.description}
              </p>
            </div>

            <div className="flex gap-1.5 shrink-0 sm:pb-2">
              <button
                onClick={handleToggleFollow}
                disabled={isTogglingFollow}
                className={`flex items-center gap-2 px-6 sm:px-10 py-3 sm:py-5 rounded-xl sm:rounded-3xl font-black uppercase tracking-tighter text-[10px] sm:text-sm transition-all shadow-xl active:scale-95 ${
                    isFollowing 
                    ? 'bg-primary-50 text-primary-600 border-2 border-primary-200' 
                    : 'bg-slate-900 text-white hover:bg-black'
                }`}
              >
                {isFollowing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {isFollowing ? 'Following' : 'Follow'}
              </button>
              <button
                onClick={handleStartChat}
                disabled={chatLoading}
                className="p-3 sm:p-5 bg-white text-slate-900 border-2 border-slate-100 rounded-xl sm:rounded-3xl shadow-lg transition-all disabled:opacity-50 active:scale-95 hover:border-slate-200"
              >
                {chatLoading ? <div className="h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : <MessageCircle className="h-4 w-4 sm:h-6 sm:w-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 md:px-8 -mt-2 sm:-mt-8 relative z-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-10">

          {/* Main Catalog View */}
          <div className="lg:col-span-8 space-y-4 sm:space-y-12">
            {/* Catalog Tabs - High Density Navigation */}
            <div className="bg-white/90 backdrop-blur-xl p-1 sm:p-3 rounded-2xl sm:rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/40 flex gap-1 sm:gap-2">
              {[
                { id: 'products', label: 'Gear', icon: Package, count: products.length },
                { id: 'services', label: 'Ops', icon: Scissors, count: services.length },
                { id: 'pets', label: 'Fleet', icon: Heart, count: pets.length }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-1 sm:px-8 py-2.5 sm:py-5 rounded-xl sm:rounded-[2rem] font-black uppercase tracking-tighter text-[8px] sm:text-xs transition-all ${activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-lg'
                    : 'text-slate-400 hover:bg-slate-50'
                    }`}
                >
                  <tab.icon className={`h-3 w-3 sm:h-4 sm:w-4 ${activeTab === tab.id ? 'text-primary-400' : 'text-slate-300'}`} />
                  <span>{tab.label}</span>
                  <span className={`px-1 rounded-full text-[7px] ${activeTab === tab.id ? 'bg-primary-600' : 'bg-slate-100 text-slate-400'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Grid Views - Maximum Density */}
            <div className="min-h-[300px]">
              {activeTab === 'products' && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-8 animate-fade-in px-1">
                  {products.length > 0 ? products.map(product => (
                    <div key={product._id} className="group bg-white rounded-xl sm:rounded-[2.5rem] p-2 sm:p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col h-full">
                      <Link to={`/products/${product._id}`} className="block flex-1">
                        <div className="relative aspect-square rounded-lg sm:rounded-[2rem] overflow-hidden mb-2 sm:mb-6 bg-slate-50">
                          {product.images?.[0] ? (
                            <img src={getImageUrl(product.images[0])} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Package className="h-6 w-6 text-slate-200" /></div>
                          )}
                        </div>
                        <div className="space-y-0.5 sm:space-y-4 mb-2 sm:mb-6 px-1">
                          <p className="text-[6px] sm:text-[10px] font-black text-primary-600 uppercase tracking-widest">{product.category}</p>
                          <h3 className="text-[10px] sm:text-lg font-black text-slate-900 truncate uppercase leading-tight">{product.name}</h3>
                          <p className="text-[11px] sm:text-xl font-black text-slate-900 tracking-tighter">₱{product.price?.toLocaleString()}</p>
                        </div>
                      </Link>
                      <div className="flex gap-1.5 mt-auto">
                        <button
                          onClick={() => handleAddToCart(product)}
                          className="p-2 sm:p-4 bg-slate-100 text-slate-600 rounded-lg sm:rounded-2xl hover:bg-slate-200 transition-all active:scale-95"
                          title="Add to Cart"
                        >
                          <ShoppingCart className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                        </button>
                        <button
                          onClick={() => handleBuyNow(product)}
                          className="flex-1 py-2 sm:py-4 bg-slate-900 text-white rounded-lg sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 sm:gap-2 active:scale-95 transition-all shadow-lg hover:bg-primary-600"
                        >
                          <Zap className="h-3 w-3 sm:h-4 sm:w-4" />
                          Buy Now
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-full py-12 text-center text-slate-300">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-10" />
                      <p className="font-black text-[10px] uppercase tracking-widest opacity-40">No Gear Available</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'services' && (
                <div className="grid grid-cols-1 gap-2 sm:gap-6 animate-fade-in px-1">
                  {services.length > 0 ? services.map(service => (
                    <div key={service._id} className="group p-3 sm:p-8 bg-white rounded-xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-3 sm:gap-10 hover:shadow-xl transition-all">
                      <div className="w-12 h-12 sm:w-32 sm:h-32 shrink-0 bg-primary-50 rounded-lg sm:rounded-[2rem] flex items-center justify-center text-primary-600 overflow-hidden relative border border-slate-100">
                        {service.images?.[0] ? (
                          <img src={getImageUrl(service.images[0])} alt={service.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <Scissors className="h-5 w-5 sm:h-12 sm:w-12" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[11px] sm:text-2xl font-black text-slate-900 uppercase truncate leading-tight">{service.name}</h4>
                        <p className="text-[8px] sm:text-base text-slate-500 font-bold uppercase tracking-tight opacity-70 line-clamp-1">{service.description}</p>
                        <span className="text-[7px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{service.duration} MIN</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] sm:text-3xl font-black text-slate-900 tracking-tighter mb-1 sm:mb-2">₱{service.price?.toLocaleString()}</p>
                        <Link to={`/bookings?service=${service._id}`} className="inline-block px-3 sm:px-8 py-1.5 sm:py-4 bg-slate-900 text-white rounded-lg sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest active:scale-95">
                          Book
                        </Link>
                      </div>
                    </div>
                  )) : (
                    <div className="py-12 text-center text-slate-300">
                      <Scissors className="h-10 w-10 mx-auto mb-2 opacity-10" />
                      <p className="font-black text-[10px] uppercase tracking-widest opacity-40">Zero Ops Found</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pets' && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-8 animate-fade-in px-1">
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
                        <h3 className="text-[10px] sm:text-lg font-black text-slate-900 uppercase truncate leading-tight">{pet.name}</h3>
                        <p className="text-[7px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest truncate opacity-80">{pet.breed}</p>
                        <p className="text-[11px] sm:text-2xl font-black text-primary-600 tracking-tighter pt-1 sm:pt-4 border-t border-slate-50">₱{pet.price?.toLocaleString()}</p>
                      </div>
                    </Link>
                  )) : (
                    <div className="col-span-full py-12 text-center text-slate-300">
                      <Heart className="h-10 w-10 mx-auto mb-2 opacity-10" />
                      <p className="font-black text-[10px] uppercase tracking-widest opacity-40">Fleet Offline</p>
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

          {/* Sidebar - Tight Performance Layout */}
          <div className="lg:col-span-4 space-y-3 sm:space-y-8 pb-12">
            <div className="bg-slate-900 rounded-2xl sm:rounded-[3rem] p-5 sm:p-10 text-white relative overflow-hidden shadow-2xl">
              <div className="relative z-10 space-y-4 sm:space-y-8">
                <h4 className="text-sm sm:text-2xl font-black tracking-tighter uppercase border-b border-white/10 pb-3">Base Intel</h4>
                <div className="space-y-3 sm:space-y-6">
                  {[
                    { icon: Phone, text: store.contactInfo?.phone, href: `tel:${store.contactInfo?.phone}` },
                    { icon: Mail, text: store.contactInfo?.email, href: `mailto:${store.contactInfo?.email}` }
                  ].map((link, i) => (
                    <a key={i} href={link.href} className="flex items-center gap-3 sm:gap-4 text-slate-400 hover:text-white transition-colors group">
                      <div className="w-8 h-8 sm:w-12 sm:h-12 bg-white/10 rounded-lg sm:rounded-xl flex items-center justify-center text-white ring-1 ring-white/5 group-hover:bg-primary-600 transition-all"><link.icon className="h-3 w-3 sm:h-5 sm:w-5" /></div>
                      <p className="text-[8px] sm:text-sm font-bold truncate tracking-widest uppercase flex-1">{link.text}</p>
                    </a>
                  ))}
                  <div className="pt-4 sm:pt-6">
                    <GoogleMap 
                      address={`${store.contactInfo?.address?.street}, ${store.contactInfo?.address?.city}, ${store.contactInfo?.address?.state}`}
                      storeName={store.name}
                      className="w-full"
                    />
                  </div>
                </div>
                <button onClick={handleDownloadStoreCard} className="w-full py-3 sm:py-5 bg-white text-slate-900 rounded-lg sm:rounded-[2rem] font-black uppercase tracking-widest text-[8px] sm:text-xs active:scale-95 transition-transform shadow-xl">
                  Extract vCard
                </button>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-[3rem] p-5 sm:p-10 border border-white shadow-xl">
              <h4 className="text-[10px] sm:text-xl font-black text-slate-900 tracking-tight uppercase mb-4 sm:mb-8 flex items-center justify-between">
                <span>Timeline</span>
                <Clock className="h-3 w-3 sm:h-5 sm:w-5 text-slate-300" />
              </h4>
              <div className="space-y-1 sm:space-y-3">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                  const isToday = day === today;
                  const hours = store.businessHours?.[day];
                  return (
                    <div key={day} className={`flex justify-between items-center px-2 py-1.5 sm:px-4 sm:py-3 rounded-lg sm:rounded-xl ${isToday ? 'bg-primary-50 ring-1 ring-primary-100' : 'opacity-60'}`}>
                      <span className={`text-[7px] sm:text-[10px] font-black uppercase tracking-widest ${isToday ? 'text-primary-600' : 'text-slate-400'}`}>{day.substring(0, 3)}</span>
                      <span className={`font-black text-[8px] sm:text-xs sm:text-sm ${isToday ? 'text-primary-700' : 'text-slate-900'}`}>
                        {hours && !hours.closed ? `${hours.open}-${hours.close}` : 'OFFLINE'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
