import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { petService, productService, storeService, getImageUrl } from '../../services/apiService';
import { Heart, Package, Star, ArrowRight, Sparkles, TrendingUp, Users, ShoppingBag, Shield, Zap, MapPin, Crown, ChevronRight, Clock, Navigation, Building, Store } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { CardLoader } from '../../components/ui/LoadingSpinner';

/* ── Animated counter hook ── */
const useCounter = (target, duration = 1600) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const step = target / (duration / 16);
      const timer = setInterval(() => {
        start = Math.min(start + step, target);
        setCount(Math.floor(start));
        if (start >= target) clearInterval(timer);
      }, 16);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);
  return [count, ref];
};

const StatCard = ({ icon: Icon, label, target, suffix = '', color }) => {
  const [count, ref] = useCounter(target);
  return (
    <div ref={ref} className={`card-interactive bg-white rounded-[2rem] border border-slate-100 p-5 flex flex-col gap-3 relative overflow-hidden`}>
      <div className={`w-10 h-10 rounded-2xl bg-${color}-50 flex items-center justify-center`}>
        <Icon className={`h-5 w-5 text-${color}-600`} />
      </div>
      <div>
        <p className="text-3xl font-black text-slate-900 tracking-tighter leading-none">
          {count.toLocaleString()}{suffix}
        </p>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] mt-1">{label}</p>
      </div>
      <div className={`absolute bottom-0 right-0 w-20 h-20 bg-${color}-50 rounded-tl-[3rem] opacity-60`} />
    </div>
  );
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
};

const Home = () => {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { addToCart } = useCart();
  const [featuredPets, setFeaturedPets] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nearbyStores, setNearbyStores] = useState([]);
  const [nearMeLoading, setNearMeLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    const fetchFeaturedItems = async () => {
      try {
        const [petsRes, productsRes] = await Promise.all([
          petService.getAllPets({ limit: 6, page: 1 }),
          productService.getAllProducts({ limit: 4, page: 1 })
        ]);
        setFeaturedPets(petsRes.data.pets || []);
        setFeaturedProducts(productsRes.data.products || []);
      } catch (e) {
        console.error('Error fetching featured items:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchFeaturedItems();
  }, []);

  const handleNearMe = async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setNearMeLoading(true);
    toast.info('Scanning proximity...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(coords);

        try {
          const response = await storeService.getAllStores();
          const allStores = response.data.stores || response.data || [];

          const filtered = allStores
            .filter(s => s.name?.toLowerCase() !== 'admin pet store')
            .map(store => {
              const distance = calculateDistance(
                coords.lat,
                coords.lng,
                store.contactInfo?.address?.coordinates?.lat,
                store.contactInfo?.address?.coordinates?.lng
              );
              return { ...store, distance };
            })
            .filter(store => store.distance <= 5)
            .sort((a, b) => a.distance - b.distance);

          setNearbyStores(filtered);
          if (filtered.length === 0) {
            toast.info('No bases found within 5km radius.');
          } else {
            toast.success(`Found ${filtered.length} bases nearby!`);
          }
        } catch (error) {
          console.error('Error fetching nearby stores:', error);
          toast.error('Failed to retrieve nearby bases');
        } finally {
          setNearMeLoading(false);
        }
      },
      (error) => {
        setNearMeLoading(false);
        if (error.code === 1) {
          toast.error('Location access is required to use the Near Me feature.');
        } else {
          toast.error('Could not get your location');
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-20">
        <div className="h-64 bg-slate-100 rounded-[2.5rem] animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-[2rem] animate-pulse" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <CardLoader key={i} />)}
        </div>
      </div>
    );
  }

  const TICKER_ITEMS = [
    '🐾 Premium pets · vetted breeders',
    '🛒 Curated supplies · top brands',
    '✂️ Expert grooming · elite salons',
    '🏠 Home & walk-in services',
    '❤️ Adoption drives · find your match',
    '🌟 1,200+ happy owners',
  ];

  return (
    <div className="space-y-10 sm:space-y-16 pb-32 animate-fade-in font-['Outfit'] relative z-10">

      {/* Premium Ambiance Layer - Immersive Glows */}
      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-amber-100 rounded-full blur-[120px] animate-spin-slow" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-[#5D4037]/10 rounded-full blur-[100px] animate-blob-move" />
      </div>

      {/* ── Modern Heritage Hero Section ── */}
      <section className="relative group">
        <div className="relative z-10 bg-white/60 backdrop-blur-3xl rounded-[3rem] sm:rounded-[4rem] p-8 sm:p-20 border border-white/80 shadow-[0_40px_100px_-20px_rgba(93,64,55,0.15)] overflow-hidden transition-all duration-700 hover:bg-white/80">
          {/* Layered Decorative Elements */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-amber-100/40 to-transparent rounded-bl-[8rem] pointer-events-none group-hover:scale-110 transition-transform duration-1000" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-[#5D4037]/5 to-transparent rounded-tr-[8rem] pointer-events-none" />

          <div className="relative z-10 text-center space-y-6 sm:space-y-10">
            <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-white border border-[#5D4037]/5 rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.03)] selection:bg-amber-100">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[10px] font-black text-[#503E3B]/40 uppercase tracking-[0.4em]">ELITE ADOPTION NETWORK</span>
            </div>

            <h1 className="text-4xl sm:text-8xl font-black tracking-[-0.05em] leading-[0.88] uppercase text-[#3D2B23]">
              Secure Your <br />
              <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-700">Best Friend .</span>
            </h1>

            <p className="text-[10px] sm:text-lg text-[#5D4037]/50 max-w-xl mx-auto font-medium leading-relaxed uppercase tracking-tight">
              Access curated high-pedigree companions through the world's most <span className="text-amber-600">secure biological network</span>.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center pt-4">
              <Link to="/pets" className="group relative px-12 py-5 bg-gradient-to-br from-[#3D2B23] to-[#211510] text-white rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-[0.3em] shadow-[0_25px_50px_rgba(0,0,0,0.2)] hover:shadow-amber-900/30 active:scale-95 transition-all flex items-center justify-center gap-3">
                VIEW FLEET <ChevronRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
              </Link>
              <Link to="/products" className="px-12 py-5 bg-white border-2 border-[#5D4037]/5 text-[#5D4037] rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-[0.3em] hover:bg-amber-50 hover:border-amber-200 transition-all active:scale-95">
                SHOP NETWORK
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Precision Live Ticker ── */}
      <div className="relative overflow-hidden bg-[#211510] rounded-[2rem] py-4 border border-[#3D2B23] shadow-2xl">
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#211510] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#211510] to-transparent z-10 pointer-events-none" />
        <div className="flex gap-16 animate-ticker whitespace-nowrap select-none">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="text-[10px] sm:text-[11px] font-black text-amber-500/40 uppercase tracking-[0.3em] shrink-0 flex items-center gap-4">
              {item} <div className="w-1.5 h-1.5 rounded-full bg-amber-500/20" />
            </span>
          ))}
        </div>
      </div>

      {/* ── High-Fidelity Stats Cluster ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
        <StatCard icon={Heart} label="Available companions" target={500} suffix="+" color="amber" />
        <StatCard icon={Users} label="Verified Owners" target={1200} suffix="+" color="stone" />
        <StatCard icon={Shield} label="Protocol Integrity" target={99} suffix="%" color="emerald" />
      </section>

      {/* ── Modular Quick Nav ── */}
      <section className="flex gap-4 overflow-x-auto pb-4 scrollbar-none px-1">
        {[
          { label: 'Companions', to: '/pets', icon: Heart },
          { label: 'Hardware', to: '/products', icon: Package },
          { label: 'Logistics', to: '/services', icon: Sparkles },
          { label: 'Hub Centers', to: '/stores', icon: MapPin },
          { label: 'Operations', to: '/bookings', icon: Clock },
        ].map(({ label, to, icon: Icon }) => (
          <Link key={label} to={to}
            className="flex items-center gap-3 px-8 py-4 bg-white/80 backdrop-blur-xl border border-[#5D4037]/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-[#5D4037]/60 hover:border-amber-500/30 hover:text-amber-700 hover:shadow-2xl hover:bg-white transition-all whitespace-nowrap shrink-0 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <Icon className="h-4 w-4 text-amber-600/30" /> {label}
          </Link>
        ))}
      </section>

      {/* ── Proximity Radar Section ── */}
      <section className="space-y-8">
        <div className="flex items-end justify-between px-2">
          <div className="space-y-2">
             <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
                <Navigation className="h-3 w-3 text-amber-600" />
                <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">LOGISTICS GRID</span>
             </div>
            <h2 className="text-3xl sm:text-5xl font-black text-[#5D4037] uppercase tracking-[-0.03em] leading-none">
              Nearby <span className="italic text-amber-600">Stations .</span>
            </h2>
          </div>
          <button
            onClick={handleNearMe}
            disabled={nearMeLoading}
            className="group relative px-6 py-3 bg-[#211510] text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-amber-600 active:scale-95 transition-all shadow-[0_15px_30px_rgba(0,0,0,0.15)] flex items-center gap-3 overflow-hidden"
          >
            <div className={`absolute inset-0 bg-amber-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500`} />
            <Navigation className={`h-4 w-4 relative z-10 ${nearMeLoading ? 'animate-spin' : ''}`} />
            <span className="relative z-10">{nearMeLoading ? 'SCANNING...' : 'SCAN PROXIMITY'}</span>
          </button>
        </div>

        {nearbyStores.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {nearbyStores.map((store) => (
              <Link key={store._id} to={`/stores/${store._id}`}
                className="group bg-white rounded-[3rem] border border-[#5D4037]/5 p-6 flex gap-6 hover:shadow-[0_40px_80px_rgba(93,64,55,0.12)] hover:-translate-y-2 transition-all duration-500 animate-card-appear">
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#FAF9F6] rounded-[1.8rem] overflow-hidden shrink-0 relative p-1 transition-all duration-500 group-hover:scale-105">
                  {store.logo ? (
                    <img
                      src={getImageUrl(store.logo)}
                      alt={store.name}
                      className="w-full h-full object-cover rounded-[1.5rem]" 
                    />
                  ) : (
                    <Building className="h-10 w-10 text-amber-100 absolute inset-0 m-auto" />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center space-y-3">
                  <h3 className="text-sm sm:text-base font-black text-[#5D4037] uppercase tracking-tight truncate group-hover:text-amber-600 transition-colors">{store.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-amber-100/50 flex items-center gap-1.5">
                      <Navigation className="h-3 w-3" /> {store.distance.toFixed(1)} KM
                    </span>
                    <span className="px-3 py-1 bg-[#FAF9F6] text-[#5D4037]/60 rounded-lg text-[8px] font-black uppercase tracking-widest border border-[#5D4037]/5 flex items-center gap-1.5">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {store.ratings?.average || '5.0'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pr-2">
                   <div className="w-10 h-10 rounded-full border border-amber-100 flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all duration-500">
                    <ChevronRight className="h-5 w-5 text-amber-600" />
                   </div>
                </div>
              </Link>
            ))}
          </div>
        ) : !nearMeLoading && userLocation && (
          <div className="py-20 text-center bg-white/40 backdrop-blur-md rounded-[3rem] border border-dashed border-[#5D4037]/10">
            <p className="text-[11px] font-black text-[#5D4037]/30 uppercase tracking-[0.4em]">NO ACTIVE HUBS DETECTED IN OPERATIONAL RADIUS</p>
          </div>
        )}
      </section>

      {/* ── Featured Biological Fleet ── */}
      <section className="space-y-10">
        <div className="flex items-end justify-between px-2">
          <div className="space-y-2">
             <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 border border-rose-100 rounded-full">
                <Heart className="h-3 w-3 text-rose-500" />
                <span className="text-[9px] font-black text-rose-700 uppercase tracking-widest">BIOLOGICAL STATUS: LIVE</span>
             </div>
            <h2 className="text-3xl sm:text-5xl font-black text-[#3D2B23] uppercase tracking-[-0.03em] leading-none">
              Live <span className="italic text-amber-600">Companions .</span>
            </h2>
          </div>
          <Link to="/pets" className="group text-[10px] font-black text-[#5D4037]/40 uppercase tracking-[0.3em] hover:text-amber-600 transition-all flex items-center gap-3">
            VIEW ALL <div className="w-8 h-8 rounded-full border border-amber-500/10 flex items-center justify-center group-hover:bg-amber-50 transition-all">
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-10">
          {featuredPets.map((pet, idx) => (
            <div key={pet._id}
              className="group bg-white rounded-[3.5rem] border border-[#5D4037]/5 p-3 flex flex-col relative overflow-hidden transition-all duration-700 hover:shadow-[0_50px_100px_-20px_rgba(93,64,55,0.15)] hover:-translate-y-3 animate-card-appear"
              style={{ animationDelay: `${idx * 0.08}s` }}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FAF9F6] rounded-bl-[5rem] -translate-y-16 translate-x-16 group-hover:bg-amber-50 transition-colors duration-700" />

              <Link to={`/pets/${pet._id}`} className="block relative z-10">
                <div className="aspect-square bg-[#FAF9F6] rounded-[3rem] overflow-hidden relative shadow-inner">
                  {pet.images?.[0] ? (
                    <img
                      src={getImageUrl(pet.images[0])}
                      alt={pet.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" 
                    />
                  ) : (
                    <Heart className="h-12 w-12 text-amber-500/10 absolute inset-0 m-auto" />
                  )}
                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    <span className={`px-4 py-1.5 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] backdrop-blur-xl border border-white/20 shadow-2xl ${pet.status === 'available' ? 'bg-emerald-500/90 text-white' : 'bg-rose-500/90 text-white'}`}>
                      {pet.status === 'available' ? 'ACTIVE' : 'LOCKED'}
                    </span>
                  </div>
                </div>
              </Link>

              <div className="p-6 sm:p-8 flex-1 flex flex-col relative z-10 space-y-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-amber-600/60 uppercase tracking-[0.4em] truncate">{pet.breed || 'HIGH PEDIGREE'}</p>
                  <h3 className="text-xl sm:text-3xl font-black text-[#3D2B23] uppercase tracking-tighter truncate group-hover:text-amber-600 transition-colors leading-none">{pet.name}</h3>
                </div>

                <div className="flex gap-2 flex-wrap pb-6 border-b border-[#5D4037]/5">
                  {[pet.age + ' ' + (pet.ageUnit?.[0] || 'Y'), pet.gender?.[0], pet.weight + 'KG'].map((label, i) => (
                    label && (
                      <span key={i} className="px-4 py-1.5 bg-[#FAF9F6] border border-[#5D4037]/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#5D4037]/40">
                        {label}
                      </span>
                    )
                  ))}
                </div>

                <div className="flex justify-between items-center mt-auto">
                   <div className="space-y-1">
                      <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-[0.3em]">SECURE ACCESS</p>
                      <p className="text-2xl sm:text-3xl font-black text-[#3D2B23] tracking-tighter leading-none">₱{pet.price?.toLocaleString()}</p>
                   </div>
                   <Link to={`/pets/${pet._id}`} className="w-14 h-14 bg-[#211510] text-white rounded-2xl flex items-center justify-center shadow-xl hover:bg-amber-600 active:scale-90 transition-all">
                      <ArrowRight className="h-6 w-6" />
                   </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Precision Hardware Grid ── */}
      {featuredProducts.length > 0 && (
        <section className="space-y-10">
          <div className="flex items-end justify-between px-2">
            <div className="space-y-2">
               <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
                  <Package className="h-3 w-3 text-amber-600" />
                  <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">HARDWARE ECOSYSTEM</span>
               </div>
              <h2 className="text-3xl sm:text-5xl font-black text-[#3D2B23] uppercase tracking-[-0.03em] leading-none">
                Elite <span className="italic text-amber-600">Supplies .</span>
              </h2>
            </div>
            <Link to="/products" className="group text-[10px] font-black text-[#5D4037]/40 uppercase tracking-[0.3em] hover:text-amber-600 transition-all flex items-center gap-3">
              EXPLORE HUB <div className="w-8 h-8 rounded-full border border-amber-500/10 flex items-center justify-center group-hover:bg-amber-50 transition-all">
                <ChevronRight className="h-4 w-4" />
              </div>
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {featuredProducts.map((product, idx) => (
              <div key={product._id} className="group bg-white rounded-[2.5rem] border border-[#5D4037]/5 p-3 flex flex-col hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-2 transition-all duration-500 animate-card-appear" style={{ animationDelay: `${idx * 0.06}s` }}>
                <Link to={`/products/${product._id}`} className="block h-40 sm:h-56 bg-[#FAF9F6] rounded-[2rem] overflow-hidden mb-5 relative group/img">
                  {product.images?.[0] ? (
                    <img
                      src={getImageUrl(product.images[0])}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-1000" 
                    />
                  ) : (
                    <Package className="h-10 w-10 text-amber-100 absolute inset-0 m-auto" />
                  )}
                   {/* Stock Indicator HUD */}
                   <div className="absolute top-3 right-3 px-3 py-1 bg-white/90 backdrop-blur-md rounded-xl text-[8px] font-black uppercase tracking-widest text-[#5D4037] border border-white/50 shadow-xl opacity-0 group-hover/img:opacity-100 transition-opacity">
                      {product.stockQuantity > 5 ? 'IN STOCK' : 'CRITICAL'}
                   </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      addToCart({
                        itemId: product._id,
                        itemType: 'product',
                        name: product.name,
                        price: product.price,
                        image: product.images?.[0],
                        quantity: 1,
                        store: product.store
                      });
                      toast.success(`${product.name} added to cart!`);
                    }}
                    className="absolute bottom-3 right-3 w-12 h-12 bg-[#211510] text-white rounded-[1.2rem] flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500 hover:bg-amber-600 active:scale-90"
                  >
                    <ShoppingBag className="h-5 w-5" />
                  </button>
                </Link>
                <div className="px-3 pb-3 flex-1 flex flex-col space-y-3">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-amber-600/40 uppercase tracking-[0.3em] truncate">{product.category}</p>
                    <Link to={`/products/${product._id}`} className="text-xs sm:text-sm font-black text-[#5D4037] uppercase tracking-tight truncate block group-hover:text-amber-600 transition-colors">{product.name}</Link>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-[#5D4037]/5 flex justify-between items-end">
                    <p className="text-lg sm:text-xl font-black text-[#3D2B23] tracking-tighter leading-none">₱{product.price?.toLocaleString()}</p>
                    <div className="w-8 h-8 rounded-full border border-amber-500/10 flex items-center justify-center group-hover:bg-amber-50 transition-all">
                       <ChevronRight className="h-4 w-4 text-amber-600" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Operational Integrity Grid ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        {[
          { icon: Crown, title: 'Verified Units', desc: 'Every companion undergoes tactical health screening by our elite vetting core.', color: 'amber' },
          { icon: Shield, title: 'Encrypted Escrow', desc: 'All transactions are secured via high-level protocol validation.', color: 'emerald' },
          { icon: Zap, title: 'Instant Logistics', desc: 'Secure grooming, medical, and behavioral services with one-tap deployment.', color: 'stone' },
        ].map(({ icon: Icon, title, desc, color }, i) => (
          <div key={i} className={`bg-white rounded-[3.5rem] border border-[#5D4037]/5 p-10 relative overflow-hidden transition-all duration-500 hover:shadow-[0_40px_80px_rgba(93,64,55,0.1)] hover:-translate-y-2 animate-card-appear`}
            style={{ animationDelay: `${i * 0.12}s` }}>
            <div className={`w-14 h-14 bg-[#FAF9F6] border border-[#5D4037]/5 rounded-2xl flex items-center justify-center mb-6`}>
              <Icon className={`h-7 w-7 text-amber-600`} />
            </div>
            <h3 className="text-xl font-black text-[#5D4037] uppercase tracking-tight mb-4">{title}</h3>
            <p className="text-[11px] text-[#5D4037]/40 font-bold leading-relaxed uppercase tracking-widest">{desc}</p>
          </div>
        ))}
      </section>

      {/* ── Luxe Terminal CTA ── */}
      <section className="px-2">
        <div className="bg-gradient-to-br from-[#211510] via-[#3D2B23] to-[#211510] rounded-[4rem] p-12 sm:p-24 relative overflow-hidden text-center text-white border border-white/5 shadow-[0_60px_100px_-20px_rgba(0,0,0,0.6)] group">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none group-hover:scale-110 transition-transform duration-1000" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 space-y-10">
            <div className="inline-flex items-center gap-3 px-6 py-2 bg-white/5 border border-white/10 rounded-full">
              <TrendingUp className="h-4 w-4 text-amber-400" />
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] text-amber-400">NETWORK EXPANSION</span>
            </div>
            <h2 className="text-4xl sm:text-8xl font-black tracking-[-0.05em] uppercase leading-[0.85] text-white">
              {isAuthenticated ? `Operational Status` : 'Initiate'}
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600 italic">
                {isAuthenticated ? 'OPTIMAL .' : 'PROTOCOL .'}
              </span>
            </h2>
            <p className="text-[12px] sm:text-lg text-white/40 max-w-lg mx-auto font-black uppercase tracking-[0.2em] leading-relaxed">
              {isAuthenticated
                ? 'Your premium biological fleet is secured. Deployment ready.'
                : 'Authenticate your access to secure elite hardware and companions today.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center pt-4">
              <Link to={isAuthenticated ? '/pets' : '/register'}
                className="group relative px-16 py-6 bg-amber-500 text-white rounded-2xl text-sm font-black uppercase tracking-[0.3em] hover:bg-amber-600 active:scale-95 transition-all shadow-[0_20px_50px_rgba(184,137,90,0.4)] flex items-center justify-center gap-4">
                {isAuthenticated ? 'VIEW NEW FLEET' : 'REGISTER CORE'}
                <ArrowRight className="h-5 w-5 group-hover:translate-x-3 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
