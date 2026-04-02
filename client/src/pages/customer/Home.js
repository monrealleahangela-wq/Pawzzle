import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { petService, productService, storeService, getImageUrl } from '../../services/apiService';
import { Heart, Package, Star, ArrowRight, Sparkles, TrendingUp, Users, ShoppingBag, Shield, Zap, MapPin, Crown, ChevronRight, Clock, Navigation, Building } from 'lucide-react';
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
    <div className="space-y-6 sm:space-y-10 pb-24 animate-fade-in">

      {/* ── Ambient blobs ── */}
      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] bg-primary-50 rounded-full blur-[120px] animate-blob opacity-60" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[350px] h-[350px] bg-secondary-50 rounded-full blur-[100px] animate-blob opacity-50" style={{ animationDelay: '-4s' }} />
        <div className="absolute top-[40%] left-[30%] w-[250px] h-[250px] bg-amber-50 rounded-full blur-[80px] animate-blob opacity-30" style={{ animationDelay: '-8s' }} />
      </div>

      {/* ── Hero Section ── */}
      <section className="relative">
        <div className="relative z-10 glass-morphism rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-16 border border-white/50 shadow-2xl shadow-primary-100/20 overflow-hidden">
          {/* decorative corner shape */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary-100/60 to-transparent rounded-bl-[4rem] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-secondary-100/40 to-transparent rounded-tr-[4rem] pointer-events-none" />

          <div className="relative z-10 text-center space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/70 backdrop-blur-md rounded-full border border-primary-100 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[8px] sm:text-[10px] font-black text-primary-900 uppercase tracking-[0.3em]">Live Collection</span>
            </div>

            <h1 className="text-3xl sm:text-7xl font-black tracking-tighter leading-[0.88] uppercase">
              <span className="text-gradient-shimmer">Find Your</span>
              <br />
              <span className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent italic">Best Friend</span>
            </h1>

            <p className="text-[9px] sm:text-base text-slate-500 max-w-sm mx-auto font-bold leading-relaxed uppercase tracking-tight opacity-80">
              Curated excellence in pet adoption.
              <span className="hidden sm:inline"> Verified breeders &amp; world-class service.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center pt-1">
              <Link to="/pets" className="group px-8 py-3.5 bg-slate-900 text-white rounded-2xl text-[9px] sm:text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-primary-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                Find Pets <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/products" className="px-8 py-3.5 bg-white/80 border border-slate-200 text-slate-800 rounded-2xl text-[9px] sm:text-xs font-black uppercase tracking-widest hover:border-slate-900 hover:bg-white active:scale-95 transition-all">
                Shop Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live Ticker ── */}
      <div className="relative overflow-hidden bg-slate-900 rounded-[1.5rem] py-3 border border-white/5 shadow-xl">
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-slate-900 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-900 to-transparent z-10 pointer-events-none" />
        <div className="flex gap-12 animate-ticker whitespace-nowrap select-none">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="text-[9px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.2em] shrink-0">
              {item}&nbsp;&nbsp;<span className="text-primary-700">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Animated Stats Cluster ── */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard icon={Heart} label="Pets Available" target={500} suffix="+" color="primary" />
        <StatCard icon={Users} label="Happy Owners" target={1200} suffix="+" color="secondary" />
        <StatCard icon={Shield} label="Vetted Breeders" target={99} suffix="%" color="emerald" />
      </section>

      {/* ── Quick Nav Pills ── */}
      <section className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { label: 'Pets', to: '/pets', icon: Heart },
          { label: 'Products', to: '/products', icon: Package },
          { label: 'Services', to: '/services', icon: Sparkles },
          { label: 'Stores', to: '/stores', icon: MapPin },
          { label: 'Bookings', to: '/bookings', icon: Clock },
        ].map(({ label, to, icon: Icon }) => (
          <Link key={label} to={to}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-100 rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-700 hover:border-primary-300 hover:text-primary-700 hover:shadow-lg transition-all whitespace-nowrap shrink-0 shadow-sm">
            <Icon className="h-3 w-3" /> {label}
          </Link>
        ))}
      </section>

      {/* ── Nearby Bases Radar section ── */}
      <section className="space-y-4">
        <div className="flex items-end justify-between px-1">
          <div>
            <p className="text-[9px] font-black text-secondary-600 uppercase tracking-[0.35em] mb-1">Nearby Shops</p>
            <h2 className="text-xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">
              Pet Shops <span className="italic text-secondary-600">Near You</span>
            </h2>
          </div>
          <button
            onClick={handleNearMe}
            disabled={nearMeLoading}
            className="group flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-secondary-600 active:scale-95 transition-all shadow-lg"
          >
            <Navigation className={`h-3 w-3 ${nearMeLoading ? 'animate-spin' : ''}`} />
            {nearMeLoading ? 'Finding...' : 'Find Nearby'}
          </button>
        </div>

        {nearbyStores.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {nearbyStores.map((store) => (
              <Link key={store._id} to={`/stores/${store._id}`}
                className="group bg-white rounded-[2rem] border border-slate-100 p-4 flex gap-4 card-interactive animate-card-appear shadow-sm">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-2xl overflow-hidden shrink-0 relative">
                  {store.logo ? (
                    <img
                      src={getImageUrl(store.logo)}
                      alt={store.name}
                      onError={(e) => { e.target.onError = null; e.target.src = "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=200&h=200&fit=crop"; }}
                      className="w-full h-full object-cover" />
                  ) : (
                    <Building className="h-6 w-6 sm:h-8 sm:w-8 text-slate-200 absolute inset-0 m-auto" />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase truncate group-hover:text-secondary-600 transition-colors">{store.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-secondary-50 text-secondary-600 rounded-lg text-[7px] sm:text-[8px] font-black uppercase tracking-wider">
                      <Navigation className="h-2 w-2" />
                      {store.distance.toFixed(1)} km
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-lg text-[7px] sm:text-[8px] font-black uppercase tracking-wider">
                      <Star className="h-2 w-2 fill-amber-500 text-amber-500" />
                      {store.ratings?.average || '0.0'}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1 overflow-hidden">
                    {store.services?.slice(0, 2).map((s, i) => (
                      <span key={i} className="text-[6px] sm:text-[8px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center">
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        ) : !nearMeLoading && userLocation && (
          <div className="py-10 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No bases detected within operational range (5km).</p>
          </div>
        )}
      </section>

      {/* ── Featured Pets ── */}
      <section className="space-y-4">
        <div className="flex items-end justify-between px-1">
          <div>
            <p className="text-[9px] font-black text-primary-600 uppercase tracking-[0.35em] mb-1">New Arrivals</p>
            <h2 className="text-xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">
              Pets for <span className="italic text-primary-600">Adoption</span>
            </h2>
          </div>
          <Link to="/pets" className="group text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-900 transition-colors flex items-center gap-1">
            All <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {featuredPets.map((pet, idx) => (
            <div key={pet._id}
              className="group bg-white rounded-[2.5rem] border border-slate-100 p-2 flex flex-col relative overflow-hidden card-interactive animate-card-appear shadow-sm"
              style={{ animationDelay: `${idx * 0.08}s` }}>
              {/* corner accent */}
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-50 rounded-bl-[3rem] -translate-y-10 translate-x-10 group-hover:bg-primary-50 transition-colors duration-500" />

              <Link to={`/pets/${pet._id}`} className="block relative z-10">
                <div className="h-32 sm:h-52 bg-slate-50 rounded-[2rem] overflow-hidden relative">
                  {pet.images?.[0] ? (
                    <img
                      src={getImageUrl(pet.images[0])}
                      alt={pet.name}
                      onError={(e) => { e.target.onError = null; e.target.src = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&h=400&fit=crop"; }}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  ) : (
                    <Heart className="h-8 w-8 text-slate-200 absolute inset-0 m-auto" />
                  )}
                  {/* status + species badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
                    <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-wider backdrop-blur-md border border-white/20 shadow-sm ${pet.status === 'available' ? 'bg-emerald-500/90 text-white' :
                      pet.status === 'reserved' ? 'bg-amber-500/90 text-white' :
                        'bg-rose-500/90 text-white'
                      }`}>
                      {pet.status === 'available' ? '● LIVE' : pet.status === 'reserved' ? '○ RESERVED' : '○ ADOPTED'}
                    </span>
                  </div>
                  <div className="absolute top-2.5 right-2.5">
                    <span className="px-2 py-0.5 bg-slate-900/80 backdrop-blur-md rounded-lg text-[7px] font-black uppercase tracking-wider text-white border border-white/10">
                      {pet.species || 'Vetted'}
                    </span>
                  </div>
                  {/* price overlay on hover */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                    <span className="text-white text-sm font-black tracking-tighter">₱{pet.price?.toLocaleString()}</span>
                  </div>
                </div>
              </Link>

              <div className="p-3 sm:p-4 flex-1 flex flex-col relative z-10 gap-2">
                <div>
                  <p className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] truncate">{pet.breed || '—'}</p>
                  <h3 className="text-[11px] sm:text-lg font-black text-slate-900 uppercase truncate group-hover:text-primary-600 transition-colors">{pet.name}</h3>
                </div>

                {/* Info pills */}
                <div className="flex gap-1.5 flex-wrap">
                  {pet.age && (
                    <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-lg text-[7px] font-black uppercase tracking-wide text-slate-600">
                      {pet.age} {pet.ageUnit?.[0]}
                    </span>
                  )}
                  {pet.gender && (
                    <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-lg text-[7px] font-black uppercase tracking-wide text-slate-600">
                      {pet.gender}
                    </span>
                  )}
                  {pet.weight && (
                    <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-lg text-[7px] font-black uppercase tracking-wide text-slate-600">
                      {pet.weight}kg
                    </span>
                  )}
                </div>

                <div className="flex justify-between items-center mt-auto pt-2 border-t border-slate-50">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Price:</p>
                      <p className="text-sm sm:text-xl font-black text-slate-900 tracking-tighter leading-none">₱{pet.price?.toLocaleString()}</p>
                    </div>
                    <Link to={`/stores/${pet.store?._id}`} className="flex items-center gap-1 hover:text-primary-600 transition-colors group/store">
                      <div className="w-4 h-4 rounded-full overflow-hidden bg-slate-50 border border-slate-100 shrink-0">
                        {pet.store?.logo ? (
                          <img src={getImageUrl(pet.store.logo)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Store className="h-2 w-2 text-primary-400 m-auto" />
                        )}
                      </div>
                      <span className="text-[7px] font-black uppercase text-slate-400 group-hover/store:text-primary-600 transition-colors">
                        {pet.store?.name}
                      </span>
                    </Link>
                  </div>
                  <Link to={`/pets/${pet._id}`}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-primary-600 active:scale-90 transition-all shadow-lg shadow-slate-200">
                    View
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Featured Products ── */}
      {featuredProducts.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between px-1">
            <div>
              <p className="text-[9px] font-black text-primary-600 uppercase tracking-[0.35em] mb-1">Top Items</p>
              <h2 className="text-xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                Curated <span className="italic text-primary-600">Gear</span>
              </h2>
            </div>
            <Link to="/products" className="group text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-900 transition-colors flex items-center gap-1">
              All <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {featuredProducts.map((product, idx) => (
              <Link key={product._id} to={`/products/${product._id}`}
                className="group bg-white rounded-[2rem] border border-slate-100 p-2 flex flex-col card-interactive shadow-sm animate-card-appear"
                style={{ animationDelay: `${idx * 0.06}s` }}>
                <div className="h-28 sm:h-36 bg-slate-50 rounded-[1.5rem] overflow-hidden mb-3 relative">
                  {product.images?.[0] ? (
                    <img
                      src={getImageUrl(product.images[0])}
                      alt={product.name}
                      onError={(e) => { e.target.onError = null; e.target.src = "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400&h=400&fit=crop"; }}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  ) : (
                    <Package className="h-8 w-8 text-slate-200 absolute inset-0 m-auto" />
                  )}
                  <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-wider backdrop-blur-md border border-white/20 shadow-sm ${product.stockQuantity > 5 ? 'bg-emerald-500/90 text-white' : 'bg-rose-500/90 text-white'}`}>
                    {product.stockQuantity > 5 ? 'In Stock' : 'Low'}
                  </span>
                  
                  {/* Quick Add to Cart Button */}
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
                    className="absolute bottom-2 right-2 p-2 bg-white/90 backdrop-blur-md border border-slate-100 rounded-xl text-slate-800 hover:bg-primary-600 hover:text-white hover:border-primary-600 active:scale-90 transition-all shadow-lg opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300"
                  >
                    <ShoppingBag className="h-3 w-3" />
                  </button>
                </div>
                <div className="px-2 pb-2 flex-1 flex flex-col">
                  <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5 truncate">{product.category}</p>
                  <p className="text-[10px] sm:text-sm font-black text-slate-900 uppercase truncate mb-2 group-hover:text-primary-600 transition-colors">{product.name}</p>
                  
                  <div className="mt-auto flex justify-between items-end pt-2 border-t border-slate-50">
                    <div>
                      <p className="text-sm sm:text-lg font-black text-slate-900 tracking-tighter mb-1 leading-none">₱{product.price?.toLocaleString()}</p>
                      <div className="flex items-center gap-1 group/store">
                        <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-slate-50 border border-slate-100 shrink-0">
                          {product.store?.logo ? (
                            <img src={getImageUrl(product.store.logo)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Store className="h-2 w-2 text-primary-400 m-auto" />
                          )}
                        </div>
                        <span className="text-[7px] font-black uppercase text-slate-400">
                          {product.store?.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Features Bento ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Crown, title: 'Healthy Pets', desc: 'Only verified and health-checked animals enter our platform.', color: 'primary' },
          { icon: Shield, title: '100% Secure', desc: 'Safe transactions and buyer-first policies on every order.', color: 'emerald' },
          { icon: Zap, title: 'Easy Booking', desc: 'Schedule grooming, vet visits, and walks in seconds.', color: 'amber' },
        ].map(({ icon: Icon, title, desc, color }, i) => (
          <div key={i} className={`bg-white rounded-[2.5rem] border border-slate-100 p-6 sm:p-8 relative overflow-hidden card-interactive shadow-sm animate-card-appear`}
            style={{ animationDelay: `${i * 0.12}s` }}>
            <div className={`w-12 h-12 bg-${color}-50 rounded-2xl flex items-center justify-center mb-5`}>
              <Icon className={`h-6 w-6 text-${color}-600`} />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight mb-2">{title}</h3>
            <p className="text-[10px] sm:text-xs text-slate-500 font-bold leading-relaxed">{desc}</p>
            <div className={`absolute bottom-0 right-0 w-24 h-24 bg-${color}-50 rounded-tl-[3rem] opacity-50 pointer-events-none`} />
          </div>
        ))}
      </section>

      {/* ── Dark CTA ── */}
      <section>
        <div className="bg-slate-900 rounded-[2.5rem] p-8 sm:p-16 relative overflow-hidden text-center text-white border border-white/5 shadow-2xl">
          <div className="absolute top-0 right-0 w-40 h-40 sm:w-72 sm:h-72 bg-primary-600/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-40 h-40 sm:w-72 sm:h-72 bg-secondary-600/10 rounded-full blur-[80px] pointer-events-none" />

          {/* rotating ring decoration */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-white/5 rounded-full animate-rotate-slow pointer-events-none hidden sm:block" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border border-white/[0.03] rounded-full animate-rotate-slow pointer-events-none hidden sm:block" style={{ animationDirection: 'reverse' }} />

          <div className="relative z-10 space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/10 rounded-full">
              <TrendingUp className="h-3 w-3 text-primary-400" />
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-primary-400">Growing Community</span>
            </div>
            <h2 className="text-2xl sm:text-6xl font-black tracking-tighter uppercase leading-[0.9]">
              {isAuthenticated ? `Welcome back,` : 'Join the'}
              <br />
              <span className="text-gradient-shimmer italic">
                {isAuthenticated ? user?.firstName || 'Commander' : 'Elite'}
              </span>
            </h2>
            <p className="text-[8px] sm:text-base text-slate-400 max-w-sm mx-auto font-bold uppercase tracking-widest leading-relaxed">
              {isAuthenticated
                ? 'Your premium fleet awaits. Continue your journey.'
                : 'Get exclusive access to the finest pets and top-tier services.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link to={isAuthenticated ? '/pets' : '/register'}
                className="group px-10 py-4 bg-primary-600 text-white rounded-2xl text-[9px] sm:text-xs font-black uppercase tracking-widest hover:bg-primary-500 active:scale-95 transition-all shadow-xl shadow-primary-900/40 flex items-center justify-center gap-2">
                {isAuthenticated ? 'See New Pets' : 'Create Account'}
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </Link>
              {!isAuthenticated && (
                <Link to="/login" className="px-10 py-4 bg-white/5 border border-white/10 text-white rounded-2xl text-[9px] sm:text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
