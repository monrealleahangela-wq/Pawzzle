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
    <div ref={ref} className="stat-card group hover:shadow-strong transition-all duration-500">
      <div className={`w-16 h-16 rounded-3xl bg-${color}-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500`}>
        <Icon className={`h-8 w-8 text-${color}-600`} />
      </div>
      <div>
        <p className="text-4xl font-black text-neutral-900 tracking-tighter leading-none">
          {count.toLocaleString()}{suffix}
        </p>
        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.3em] mt-3">{label}</p>
      </div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[5rem] -translate-y-16 translate-x-16 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-700 pointer-events-none" />
    </div>
  );
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const Home = () => {
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
      toast.error('Location service not available');
      return;
    }
    setNearMeLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(coords);
        try {
          const response = await storeService.getAllStores();
          const allStores = response.data.stores || response.data || [];
          const filtered = allStores
            .filter(s => s.name?.toLowerCase() !== 'admin pet store')
            .map(store => {
              const distance = calculateDistance(
                coords.lat, coords.lng,
                store.contactInfo?.address?.coordinates?.lat,
                store.contactInfo?.address?.coordinates?.lng
              );
              return { ...store, distance };
            })
            .filter(store => store.distance <= 10)
            .sort((a, b) => a.distance - b.distance);
          setNearbyStores(filtered);
          if (filtered.length === 0) toast.info('No facilities found within 10km radius.');
        } catch (error) {
          toast.error('System synchronization error');
        } finally {
          setNearMeLoading(false);
        }
      },
      () => {
        setNearMeLoading(false);
        toast.error('Location access required for radar');
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  if (loading) {
    return (
      <div className="space-y-12 pb-32">
        <div className="h-96 bg-neutral-100 rounded-[3rem] animate-pulse" />
        <div className="grid grid-cols-3 gap-8">
          {[1, 2, 3].map(i => <div key={i} className="h-40 bg-neutral-100 rounded-[2.5rem] animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-96 bg-neutral-100 rounded-[3rem] animate-pulse" />)}
        </div>
      </div>
    );
  }

  const TICKER_ITEMS = [
    'PAWZZLE ECOSYSTEM · PREMIUM PET NETWORK',
    'TIER-1 VETTED BREEDERS ONLY',
    'PROFESSIONAL VET CARE & GROOMING',
    'SECURE TRANSACTIONS & TRANSFERS',
    'AI-DRIVEN PET MATCHING SYSTEM',
  ];

  return (
    <div className="space-y-16 sm:space-y-24 pb-48 animate-fade-up">

      {/* ── Premium High-Impact Hero ── */}
      <section className="relative group">
        <div className="relative z-10 bg-white rounded-[4rem] p-12 sm:p-32 border border-slate-50 shadow-premium overflow-hidden transition-all duration-700 hover:bg-neutral-50/50">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-primary/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:scale-110 transition-transform duration-1000" />
          
          <div className="relative z-10 space-y-12">
            <div className="inline-flex items-center gap-4 px-6 py-3 bg-white border border-slate-100 rounded-full shadow-soft">
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.4em]">Integrated Marketplace v1.0</span>
            </div>

            <div className="space-y-6">
              <h1 className="text-5xl sm:text-9xl font-black tracking-[-0.05em] leading-[0.85] text-neutral-900 uppercase">
                Find Your <br />
                <span className="text-primary italic">Soulmate .</span>
              </h1>
              <p className="text-sm sm:text-xl text-neutral-400 max-w-2xl font-medium leading-relaxed tracking-tight">
                Access Southeast Asia's most sophisticated pet ecosystem. 
                Vetted breeders, premium supplies, and world-class care — all in one unified platform.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 pt-6">
              <Link to="/pets" className="group relative px-16 py-6 bg-primary text-white rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] shadow-[0_25px_50px_rgba(139,69,19,0.3)] hover:scale-105 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-4">
                Explore Pets <ChevronRight className="h-6 w-6 group-hover:translate-x-2 transition-transform" />
              </Link>
              <Link to="/products" className="px-16 py-6 bg-white border-2 border-slate-100 text-neutral-900 rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] hover:bg-neutral-50 active:scale-95 transition-all">
                Shop Supplies
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Enterprise Live Ticker ── */}
      <div className="relative overflow-hidden bg-white border-y border-slate-100 py-8">
        <div className="flex gap-24 animate-ticker whitespace-nowrap">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.4em] flex items-center gap-6">
              {item} <div className="w-2 h-2 rounded-full bg-primary/20" />
            </span>
          ))}
        </div>
      </div>

      {/* ── Real-World Metrics Grid ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-10">
        <StatCard icon={Heart} label="Available Matches" target={542} suffix="+" color="primary" />
        <StatCard icon={Users} label="Verified Owners" target={1820} suffix="+" color="secondary" />
        <StatCard icon={Shield} label="Trust Protocol" target={100} suffix="%" color="neutral" />
      </section>

      {/* ── Proximity Radar Radar ── */}
      <section className="space-y-12">
        <div className="flex items-end justify-between px-4">
          <div className="space-y-4">
            <h2 className="text-4xl sm:text-6xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
              Nearby <br />
              <span className="text-secondary italic">Facilities .</span>
            </h2>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-[0.2em]">Operational infrastructure near you</p>
          </div>
          <button
            onClick={handleNearMe}
            disabled={nearMeLoading}
            className="group px-10 py-5 bg-neutral-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.3em] hover:bg-primary transition-all active:scale-95 shadow-strong flex items-center gap-4"
          >
            <Navigation className={`h-5 w-5 ${nearMeLoading ? 'animate-spin' : ''}`} />
            <span>{nearMeLoading ? 'Scanning...' : 'Activate Radar'}</span>
          </button>
        </div>

        {nearbyStores.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {nearbyStores.map((store) => (
              <Link key={store._id} to={`/stores/${store._id}`}
                className="group bg-white rounded-[3rem] border border-slate-50 p-8 flex gap-8 hover:shadow-premium hover:-translate-y-2 transition-all duration-500">
                <div className="w-28 h-28 bg-neutral-50 rounded-[2rem] overflow-hidden shrink-0 relative group-hover:scale-105 transition-all">
                  {store.logo ? (
                    <img src={getImageUrl(store.logo)} alt={store.name} className="w-full h-full object-cover" />
                  ) : (
                    <Building className="h-10 w-10 text-neutral-200 absolute inset-0 m-auto" />
                  )}
                </div>
                <div className="flex-1 flex flex-col justify-center space-y-4">
                  <h3 className="text-lg font-black text-neutral-900 uppercase tracking-tight truncate group-hover:text-primary transition-colors">{store.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="px-4 py-1.5 bg-neutral-50 text-neutral-500 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                       {store.distance.toFixed(1)} KM
                    </span>
                    <span className="px-4 py-1.5 bg-primary/5 text-primary rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                      <Star className="h-3 w-3 fill-primary" /> {store.ratings?.average || '5.0'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center bg-white rounded-[4rem] border border-dashed border-slate-100">
             <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Navigation className="h-8 w-8 text-neutral-200" />
             </div>
             <p className="text-[11px] font-black text-neutral-300 uppercase tracking-[0.4em]">Radar offline — Run scan to find locations</p>
          </div>
        )}
      </section>

      {/* ── Featured Biological Assets ── */}
      <section className="space-y-12">
        <div className="flex items-end justify-between px-4">
           <h2 className="text-4xl sm:text-6xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
            New <br />
            <span className="text-primary italic">Arrivals .</span>
          </h2>
          <Link to="/pets" className="group text-[10px] font-black text-neutral-400 uppercase tracking-[0.3em] hover:text-primary transition-all flex items-center gap-4">
            View Inventory <div className="w-12 h-12 rounded-full border border-slate-100 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
              <ChevronRight className="h-5 w-5" />
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {featuredPets.map((pet, idx) => (
            <div key={pet._id}
              className="group bg-white rounded-[4rem] border border-slate-50 p-4 flex flex-col hover:shadow-premium hover:-translate-y-4 transition-all duration-700 animate-fade-up"
              style={{ animationDelay: `${idx * 0.1}s` }}>
              <Link to={`/pets/${pet._id}`} className="block aspect-[4/5] bg-neutral-100 rounded-[3.5rem] overflow-hidden relative shadow-inner mb-8">
                {pet.images?.[0] ? (
                  <img src={getImageUrl(pet.images[0])} alt={pet.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                ) : (
                  <Heart className="h-16 w-12 text-neutral-200 absolute inset-0 m-auto" />
                )}
                <div className="absolute top-6 left-6">
                   <span className="px-6 py-2.5 bg-white/90 backdrop-blur-md rounded-2xl text-[9px] font-black uppercase tracking-widest text-neutral-900 shadow-strong">
                      {pet.breed || 'Verified Match'}
                   </span>
                </div>
              </Link>

              <div className="px-6 pb-8 flex-1 flex flex-col space-y-8">
                <div className="flex justify-between items-start">
                   <h3 className="text-3xl font-black text-neutral-900 uppercase tracking-tighter leading-none">{pet.name}</h3>
                   <span className="text-[10px] font-black text-primary uppercase tracking-widest">₱{pet.price?.toLocaleString()}</span>
                </div>
                
                <div className="flex gap-3 flex-wrap">
                   {[pet.age + ' ' + (pet.ageUnit || 'Y'), pet.gender, pet.weight + 'KG'].map((tag, i) => (
                     <span key={i} className="px-5 py-2 bg-neutral-50 rounded-2xl text-[9px] font-black uppercase tracking-widest text-neutral-400">
                        {tag}
                     </span>
                   ))}
                </div>

                <Link to={`/pets/${pet._id}`} className="w-full py-6 bg-neutral-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-4 hover:bg-primary transition-all active:scale-95 shadow-strong mt-auto">
                   View Dossier <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Supply Chain Spotlight ── */}
      <section className="space-y-12">
        <div className="flex items-end justify-between px-4">
           <h2 className="text-4xl sm:text-6xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
            Elite <br />
            <span className="text-neutral-400 italic">Supplies .</span>
          </h2>
          <Link to="/products" className="group text-[10px] font-black text-neutral-400 uppercase tracking-[0.3em] hover:text-black transition-all flex items-center gap-4">
            Shop Catalog <div className="w-12 h-12 rounded-full border border-slate-100 flex items-center justify-center group-hover:bg-neutral-900 group-hover:text-white transition-all">
              <ChevronRight className="h-5 w-5" />
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {featuredProducts.map((product, idx) => (
            <div key={product._id} className="group bg-white rounded-[3rem] border border-slate-50 p-4 hover:shadow-strong transition-all duration-500">
               <Link to={`/products/${product._id}`} className="block aspect-square bg-neutral-50 rounded-[2.5rem] overflow-hidden mb-6 relative group/img">
                  {product.images?.[0] ? (
                    <img src={getImageUrl(product.images[0])} alt={product.name} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-700" />
                  ) : (
                    <Package className="h-10 w-10 text-neutral-200" />
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      addToCart({ itemId: product._id, itemType: 'product', name: product.name, price: product.price, image: product.images?.[0], quantity: 1, store: product.store });
                      toast.success('Vector added to tray');
                    }}
                    className="absolute bottom-4 right-4 w-14 h-14 bg-white text-neutral-900 rounded-3xl flex items-center justify-center shadow-premium opacity-0 group-hover/img:opacity-100 translate-y-4 group-hover/img:translate-y-0 transition-all duration-500 hover:bg-primary hover:text-white"
                  >
                    <PlusIcon className="h-6 w-6" />
                  </button>
               </Link>
               <div className="px-2 space-y-4">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-neutral-300 uppercase tracking-widest">{product.category}</p>
                    <h3 className="text-sm font-black text-neutral-900 uppercase truncate">{product.name}</h3>
                  </div>
                  <p className="text-lg font-black text-neutral-950 tracking-tighter">₱{product.price?.toLocaleString()}</p>
               </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── System Reliability Blocks ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-10">
        {[
          { icon: Crown, title: 'Heritage Health', desc: 'Medical clearance required for all biological listings.' },
          { icon: Shield, title: 'Safe Protocol', desc: 'Encrypted end-to-end marketplace logistics.' },
          { icon: Zap, title: 'Instant Care', desc: 'Direct-to-expert service booking latency minimization.' },
        ].map(({ icon: Icon, title, desc }, i) => (
          <div key={i} className="bg-white rounded-[3.5rem] border border-slate-50 p-12 transition-all duration-500 hover:shadow-premium hover:-translate-y-2">
            <div className="w-16 h-16 bg-neutral-50 rounded-3xl flex items-center justify-center mb-10">
              <Icon className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-black text-neutral-900 uppercase tracking-tighter mb-4">{title}</h3>
            <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>

      {/* ── Full Experience CTA ── */}
      <section className="px-4">
        <div className="bg-neutral-900 rounded-[5rem] p-16 sm:p-32 relative overflow-hidden text-center text-white border border-white/5 shadow-2xl group">
           <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,rgba(139,69,19,0.2),transparent)]" />
           <div className="relative z-10 space-y-12">
              <h2 className="text-5xl sm:text-9xl font-black tracking-[-0.05em] uppercase leading-[0.85]">
                Start Your <br />
                <span className="text-primary italic">Journey .</span>
              </h2>
              <p className="text-xs sm:text-xl text-white/40 max-w-xl mx-auto font-black uppercase tracking-[0.3em]">
                Join Southeast Asia's fastest growing pet network today.
              </p>
              <Link to={isAuthenticated ? '/pets' : '/register'}
                className="inline-flex px-20 py-8 bg-white text-neutral-900 rounded-[2.5rem] text-sm font-black uppercase tracking-[0.4em] hover:bg-primary hover:text-white transition-all shadow-premium active:scale-95">
                {isAuthenticated ? 'View Ecosystem' : 'Create Account'}
              </Link>
           </div>
        </div>
      </section>
    </div>
  );
};

const PlusIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
  </svg>
);

export default Home;
