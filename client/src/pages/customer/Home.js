import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { publicService, getImageUrl } from '../../services/apiService';
import { 
  Heart, 
  Package, 
  Star, 
  ArrowRight, 
  Sparkles, 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  Shield, 
  Zap, 
  MapPin, 
  Crown, 
  ChevronRight, 
  Clock, 
  Building,
  ShieldCheck,
  Search,
  CheckCircle2,
  ThumbsUp,
  Brain,
  Stethoscope,
  Scissors,
  Dumbbell,
  Activity
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { toast } from 'react-toastify';

// ═══════════════════════════════════════════════════════════════
// ANIMATED COUNTER COMPONENT
// ═══════════════════════════════════════════════════════════════

const Counter = ({ target, label, icon: Icon, suffix = '+' }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0;
        const duration = 2000;
        const stepTime = 20;
        const totalSteps = duration / stepTime;
        const stepIncrement = target / totalSteps;

        const timer = setInterval(() => {
          start += stepIncrement;
          if (start >= target) {
            setCount(target);
            clearInterval(timer);
          } else {
            setCount(Math.floor(start));
          }
        }, stepTime);
        observer.disconnect();
      }
    }, { threshold: 0.5 });

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref} className="flex flex-col items-center p-8 bg-white/50 backdrop-blur-md rounded-[2.5rem] border border-white shadow-soft group hover:shadow-premium transition-all duration-500">
      <div className="w-14 h-14 bg-primary/5 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-all text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h4 className="text-4xl font-black text-neutral-900 tracking-tighter mb-2">
        {count.toLocaleString()}{suffix}
      </h4>
      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.3em]">{label}</p>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN HOME COMPONENT
// ═══════════════════════════════════════════════════════════════

const Home = () => {
  const { isAuthenticated, user } = useAuth();
  const { addToCart } = useCart();
  const [data, setData] = useState({
    pets: [],
    products: [],
    services: [],
    experts: [],
    stats: {
      stores: 0,
      experts: 0,
      products: 0,
      services: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await publicService.getLandingData();
        setData(res.data);
      } catch (err) {
        console.error('Core sync failure:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAddToCart = (product) => {
    addToCart({
      itemId: product._id,
      itemType: 'product',
      name: product.name,
      price: product.price,
      image: product.images?.[0],
      store: product.store
    });
    toast.success(`Added ${product.name} to cart!`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-pulse">
        <div className="w-24 h-24 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.4em]">Synchronizing Platform Data</p>
      </div>
    );
  }

  return (
    <div className="space-y-24 sm:space-y-32 pb-48 animate-fade-in">
      
      {/* ── 1. LUXE HERO SECTION ── */}
      <section className="relative px-2">
        <div className="relative h-[600px] sm:h-[800px] rounded-[4rem] sm:rounded-[6rem] overflow-hidden group shadow-premium ring-1 ring-white/20">
          {/* Background Image / Pattern */}
          <div className="absolute inset-0 bg-neutral-900">
            <img 
              src="/images/hero-premium.png" // Placeholder for an actual dynamic banner if available
              alt="Hero" 
              className="w-full h-full object-cover opacity-60 scale-105 group-hover:scale-100 transition-transform duration-[20s] ease-linear"
              onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?q=80&w=2686'; }}
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />
          
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-10 space-y-12 max-w-6xl mx-auto">
            <div className="inline-flex items-center gap-4 px-6 py-2.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20 animate-fade-down">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] sm:text-[11px] font-black text-white/80 uppercase tracking-[0.5em]">Global Pet Ecosystem Active</span>
            </div>
            
            <h1 className="text-5xl sm:text-9xl font-black text-white uppercase tracking-tighter leading-[0.85] animate-scale-in">
              The World's <br />
              <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-600">Premium .</span> <br />
              <span className="text-white">Pet Network .</span>
            </h1>
            
            <p className="text-sm sm:text-xl text-white/50 max-w-2xl font-medium leading-relaxed animate-fade-up">
              Connect with verified experts, shop elite supplies, and find your perfect companion in our secure, enterprise-grade marketplace.
            </p>

            <div className="w-full max-w-3xl flex flex-col sm:flex-row gap-6 animate-fade-up" style={{ animationDelay: '0.4s' }}>
              <div className="flex-1 relative group/search">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400 group-hover/search:text-primary transition-colors" />
                <input 
                  type="text"
                  placeholder="Search pets, supplies, or services..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-16 sm:h-20 bg-white rounded-3xl pl-16 pr-8 text-neutral-900 font-bold placeholder:text-neutral-400 focus:ring-4 focus:ring-primary/20 transition-all shadow-2xl"
                />
              </div>
              <Link to="/pets" className="h-16 sm:h-20 px-12 bg-primary text-white rounded-3xl flex items-center justify-center gap-4 text-xs font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-2xl shadow-primary/30">
                Explore Now <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. REAL-TIME PLATFORM DATA ── */}
      <section className="max-w-7xl mx-auto px-6 grid grid-cols-2 lg:grid-cols-4 gap-8">
        <Counter target={data.stats.products || 0} label="Elite Products" icon={Package} />
        <Counter target={data.stats.experts || 0} label="Verified Experts" icon={ShieldCheck} />
        <Counter target={data.stats.services || 0} label="Active Services" icon={Sparkles} />
        <Counter target={data.stats.stores || 0} label="Global Ventures" icon={Building} />
      </section>

      {/* ── 3. FEATURED ECOSYSTEM CATEGORIES ── */}
      <section className="max-w-[1400px] mx-auto px-6 space-y-16">
        <div className="flex flex-col md:flex-row items-end justify-between gap-8">
          <div className="space-y-4">
            <h2 className="text-4xl sm:text-7xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
              Explore Our <br />
              <span className="text-primary italic">Ecosystem .</span>
            </h2>
            <p className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.4em]">Integrated Marketplace and Service protocols</p>
          </div>
          <div className="flex gap-4">
             <Link to="/pets" className="px-8 py-4 bg-neutral-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all">Pets</Link>
             <Link to="/products" className="px-8 py-4 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-50 transition-all">Products</Link>
             <Link to="/services" className="px-8 py-4 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-50 transition-all">Services</Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Pets Card */}
          <Link to="/pets" className="group relative h-[600px] rounded-[4rem] overflow-hidden shadow-strong hover:shadow-premium transition-all duration-700">
            <img src="https://images.unsplash.com/photo-1543466835-00a7907e9de1" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/20 to-transparent" />
            <div className="absolute bottom-10 left-10 p-2 space-y-4">
               <h3 className="text-5xl font-black text-white uppercase tracking-tighter">Healthy <br /> Pets .</h3>
               <p className="text-xs text-white/60 font-medium uppercase tracking-[0.2em]">Verified Breeders & Health Records</p>
               <div className="inline-flex items-center gap-4 px-6 py-3 bg-white text-neutral-900 rounded-2xl text-[10px] font-black uppercase tracking-widest group-hover:bg-primary group-hover:text-white transition-all">
                  Browse Available <ArrowRight size={16} />
               </div>
            </div>
          </Link>
          
          {/* Products Card */}
          <Link to="/products" className="group relative h-[600px] rounded-[4rem] overflow-hidden shadow-strong hover:shadow-premium transition-all duration-700">
            <img src="https://images.unsplash.com/photo-1583511655857-d19b40a7a54e" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" />
            <div className="absolute inset-0 bg-gradient-to-t from-primary-950 via-primary-950/20 to-transparent" />
            <div className="absolute bottom-10 left-10 p-2 space-y-4">
               <h3 className="text-5xl font-black text-white uppercase tracking-tighter">Premium <br /> Supplies .</h3>
               <p className="text-xs text-white/60 font-medium uppercase tracking-[0.2em]">Curated Foods & Elite Accessories</p>
               <div className="inline-flex items-center gap-4 px-6 py-3 bg-white text-neutral-900 rounded-2xl text-[10px] font-black uppercase tracking-widest group-hover:bg-primary group-hover:text-white transition-all">
                  Shop Marketplace <ArrowRight size={16} />
               </div>
            </div>
          </Link>

          {/* Services Card */}
          <Link to="/services" className="group relative h-[600px] rounded-[4rem] overflow-hidden shadow-strong hover:shadow-premium transition-all duration-700">
            <img src="https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-transparent" />
            <div className="absolute bottom-10 left-10 p-2 space-y-4">
               <h3 className="text-5xl font-black text-white uppercase tracking-tighter">Expert <br /> Care .</h3>
               <p className="text-xs text-white/60 font-medium uppercase tracking-[0.2em]">Vets, Groomers & Master Trainers</p>
               <div className="inline-flex items-center gap-4 px-6 py-3 bg-white text-neutral-900 rounded-2xl text-[10px] font-black uppercase tracking-widest group-hover:bg-primary group-hover:text-white transition-all">
                  Book Professional <ArrowRight size={16} />
               </div>
            </div>
          </Link>
        </div>
      </section>

      {/* ── 4. VERIFIED PROFESSIONALS (Experts) ── */}
      {data.experts.length > 0 && (
        <section className="bg-neutral-900 py-32 sm:py-48 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
           <div className="max-w-7xl mx-auto px-6 relative z-10 space-y-20">
              <div className="text-center space-y-6">
                 <div className="inline-flex items-center gap-4 px-6 py-2 bg-white/5 border border-white/10 rounded-full text-primary">
                    <ShieldCheck size={18} />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em]">Verified Professionals</span>
                 </div>
                 <h2 className="text-5xl sm:text-8xl font-black text-white uppercase tracking-tighter">Meet Our <br /> <span className="italic text-primary">Health Experts .</span></h2>
                 <p className="text-white/40 text-sm sm:text-lg max-w-2xl mx-auto font-medium uppercase tracking-widest leading-relaxed">
                   Consult with the world's most trusted veterinarians, groomers, and behavioral specialists.
                 </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                 {data.experts.map((expert, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/10 rounded-[3rem] p-10 space-y-8 group hover:bg-white/10 transition-all duration-500 hover:-translate-y-4 shadow-2xl">
                       <div className="relative w-24 h-24 mx-auto">
                          <div className="w-full h-full rounded-[2rem] bg-white/10 overflow-hidden shadow-inner flex items-center justify-center">
                             {expert.avatar ? (
                               <img src={getImageUrl(expert.avatar)} alt="" className="w-full h-full object-cover" />
                             ) : <Users className="h-10 w-10 text-white/20" />}
                          </div>
                          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg">
                             <CheckCircle2 size={20} />
                          </div>
                       </div>
                       <div className="text-center space-y-2">
                          <h4 className="text-xl font-black text-white uppercase tracking-tight">{expert.firstName} {expert.lastName}</h4>
                          <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">
                            {expert.staffType?.replace('_', ' ') || 'Licensed Specialist'}
                          </p>
                       </div>
                       <div className="pt-8 border-t border-white/5 flex items-center justify-center gap-6">
                          <div className="flex items-center gap-2">
                             <Star className="h-4 w-4 fill-primary text-primary" />
                             <span className="text-[11px] font-black text-white">{expert.professionalProfile?.reputation || '5.0'}</span>
                          </div>
                          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                          <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Active Now</span>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </section>
      )}

      {/* ── 5. FEATURED BIOLOGICAL LISTINGS (Pets) ── */}
      {data.pets.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 space-y-20">
          <div className="flex flex-col md:flex-row items-end justify-between gap-10">
             <div className="space-y-4">
                <h2 className="text-4xl sm:text-7xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
                  Available <br />
                  <span className="text-primary italic">Companions .</span>
                </h2>
                <p className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.4em]">Biological inventory from verified breeders</p>
             </div>
             <Link to="/pets" className="group text-[12px] font-black text-neutral-400 uppercase tracking-[0.3em] hover:text-primary transition-all flex items-center gap-6">
                Full Catalog <div className="w-14 h-14 rounded-full border border-slate-100 flex items-center justify-center group-hover:bg-neutral-900 group-hover:text-white transition-all">
                   <ChevronRight size={24} />
                </div>
             </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
             {data.pets.map((pet, idx) => (
                <div key={idx} className="bg-white rounded-[3rem] border border-slate-50 p-4 group hover:shadow-premium hover:-translate-y-4 transition-all duration-700 animate-fade-up" style={{ animationDelay: `${idx * 0.1}s` }}>
                   <Link to={`/pets/${pet._id}`} className="block relative aspect-square rounded-[2.5rem] overflow-hidden mb-8 shadow-soft">
                      {pet.images?.[0] ? (
                        <img src={getImageUrl(pet.images[0])} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" />
                      ) : <div className="w-full h-full bg-neutral-50 flex items-center justify-center text-neutral-200"><Heart size={48} /></div>}
                      <div className="absolute top-6 left-6 px-4 py-2 bg-white/90 backdrop-blur-md rounded-xl text-[9px] font-black uppercase tracking-widest text-primary shadow-2xl">
                         Verified Healthy
                      </div>
                   </Link>
                   <div className="px-4 pb-4 space-y-6">
                      <div className="space-y-2">
                         <p className="text-[9px] font-black text-neutral-400 uppercase tracking-[0.4em]">{pet.breed}</p>
                         <h4 className="text-2xl font-black text-neutral-900 uppercase tracking-tighter truncate">{pet.name}</h4>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-50 pt-6">
                         <div className="space-y-1">
                            <p className="text-[9px] font-black text-neutral-300 uppercase tracking-[0.3em]">Price Point</p>
                            <p className="text-2xl font-black text-neutral-950 tracking-tighter">₱{pet.price?.toLocaleString()}</p>
                         </div>
                         <Link to={`/pets/${pet._id}`} className="w-12 h-12 bg-neutral-950 text-white rounded-xl flex items-center justify-center shadow-lg hover:bg-primary transition-all">
                            <ChevronRight size={20} />
                         </Link>
                      </div>
                   </div>
                </div>
             ))}
          </div>
        </section>
      )}

      {/* ── 6. MARKETPLACE HIGHLIGHTS (Products) ── */}
      {data.products.length > 0 && (
        <section className="bg-neutral-50 py-24 sm:py-32 rounded-[4rem] sm:rounded-[6rem] mx-2">
           <div className="max-w-7xl mx-auto px-6 space-y-16">
              <div className="flex items-end justify-between">
                 <div className="space-y-4">
                    <h2 className="text-4xl sm:text-6xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
                      Essential <br />
                      <span className="text-primary italic">Hardware .</span>
                    </h2>
                    <p className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.4em]">Curated elite pet accessories & food</p>
                 </div>
                 <Link to="/products" className="group p-4 bg-white rounded-2xl shadow-soft hover:bg-primary hover:text-white transition-all">
                    <ArrowRight size={24} />
                 </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                 {data.products.map((product, idx) => (
                    <div key={idx} className="bg-white rounded-[2.5rem] border border-transparent hover:border-slate-100 p-4 transition-all duration-500 group">
                       <Link to={`/products/${product._id}`} className="block relative aspect-square rounded-[2rem] overflow-hidden mb-6 bg-neutral-100">
                          {product.images?.[0] ? (
                            <img src={getImageUrl(product.images[0])} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                          ) : <Package size={32} className="m-auto text-neutral-300" />}
                          <button 
                            onClick={(e) => { e.preventDefault(); handleAddToCart(product); }}
                            className="absolute bottom-4 right-4 w-12 h-12 bg-neutral-950 text-white rounded-[1.2rem] flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500 hover:bg-primary"
                          >
                             <ShoppingBag size={20} />
                          </button>
                       </Link>
                       <div className="space-y-4 px-2">
                          <div className="space-y-1">
                             <p className="text-[9px] font-black text-neutral-300 uppercase tracking-widest">{product.category}</p>
                             <h4 className="text-sm font-black text-neutral-900 uppercase tracking-tight truncate">{product.name}</h4>
                          </div>
                          <div className="flex items-center justify-between">
                             <p className="text-lg font-black text-neutral-950 tracking-tighter">₱{product.price?.toLocaleString()}</p>
                             <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{product.stockQuantity > 5 ? 'In Stock' : 'Low Stock'}</div>
                          </div>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </section>
      )}

      {/* ── 7. TRUST & TECHNOLOGY ── */}
      <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
         <div className="space-y-12">
            <div className="space-y-6">
               <h2 className="text-4xl sm:text-7xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
                 The Standard in <br />
                 <span className="text-primary italic">Pet Security .</span>
               </h2>
               <p className="text-sm sm:text-lg text-neutral-400 font-medium uppercase tracking-widest leading-[1.8] max-w-xl">
                 We've built an enterprise-grade platform combining advanced veterinary protocols with secure commerce infrastructure.
               </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
               {[
                 { icon: ShieldCheck, title: 'Secure Checkouts', desc: 'Enterprise encryption with PayMongo integration.' },
                 { icon: Brain, title: 'AI Matching', desc: 'Intelligent companion recommendations based on lifestyle.' },
                 { icon: Activity, title: 'Health Logs', desc: 'Digital medical passports for every pet on the platform.' },
                 { icon: ThumbsUp, title: 'Vetted Stores', desc: 'Rigorous 24-step verification for all vendors.' }
               ].map((feature, i) => (
                 <div key={i} className="flex gap-6">
                    <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center text-primary shrink-0">
                       <feature.icon size={20} />
                    </div>
                    <div className="space-y-2">
                       <h4 className="text-xs font-black text-neutral-900 uppercase tracking-widest">{feature.title}</h4>
                       <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest leading-relaxed">{feature.desc}</p>
                    </div>
                 </div>
               ))}
            </div>
         </div>

         <div className="relative h-[600px] rounded-[5rem] overflow-hidden shadow-premium">
            <img src="https://images.unsplash.com/photo-1594498653385-d5172b53adc7" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px] mix-blend-overlay" />
            <div className="absolute bottom-12 left-12 right-12 bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[3rem] p-10 flex items-center gap-8 shadow-2xl">
               <div className="w-20 h-20 bg-primary text-white rounded-[1.8rem] flex items-center justify-center shadow-lg">
                  <Zap size={32} />
               </div>
               <div>
                  <h4 className="text-2xl font-black text-white uppercase tracking-tighter leading-none mb-2">3k+ Success</h4>
                  <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em]">Monthly Successful Protocols</p>
               </div>
            </div>
         </div>
      </section>

      {/* ── 8. PROFESSIONAL SERVICE PIXELS ── */}
      <section className="max-w-7xl mx-auto px-6 space-y-20">
         <div className="text-center space-y-6">
            <h2 className="text-4xl sm:text-7xl font-black text-neutral-900 uppercase tracking-tighter">Professional <br /><span className="text-primary italic">Service Labs .</span></h2>
            <p className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.5em]">Clinical Grade Pet Wellness & Styling</p>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { icon: Stethoscope, label: 'Medical', title: 'Veterinary Diagnostics', img: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09' },
              { icon: Scissors, label: 'Style', title: 'Elite Grooming Studio', img: 'https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8' },
              { icon: Dumbbell, label: 'Mind', title: 'Behavioral Training', img: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb' }
            ].map((service, i) => (
              <div key={i} className="group relative h-[500px] rounded-[4rem] overflow-hidden shadow-strong hover:shadow-premium transition-all duration-700">
                 <img src={service.img} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" />
                 <div className="absolute inset-0 bg-neutral-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                 <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-transparent" />
                 <div className="absolute bottom-10 left-10 right-10 space-y-4">
                    <div className="flex items-center gap-3">
                       <service.icon size={20} className="text-primary" />
                       <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">{service.label} Protocol</span>
                    </div>
                    <h4 className="text-3xl font-black text-white uppercase tracking-tighter leading-tight">{service.title}</h4>
                    <Link to="/services" className="h-12 w-12 bg-white text-neutral-900 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500 hover:bg-primary hover:text-white">
                       <ChevronRight size={24} />
                    </Link>
                 </div>
              </div>
            ))}
         </div>
      </section>

      {/* ── 9. LUXE CTA TERMINAL ── */}
      <section className="max-w-[1500px] mx-auto px-4">
         <div className="bg-neutral-900 rounded-[5rem] p-16 sm:p-32 relative overflow-hidden text-center group border border-white/5 shadow-2xl">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10 space-y-12">
               <div className="inline-flex items-center gap-4 px-8 py-3 bg-white/5 border border-white/10 rounded-full text-primary">
                  <Zap size={20} className="animate-pulse" />
                  <span className="text-[11px] font-black uppercase tracking-[0.6em]">Initialize Connection</span>
               </div>
               <h2 className="text-5xl sm:text-9xl font-black text-white uppercase tracking-tighter leading-[0.85]">
                 Your Global <br />
                 <span className="italic text-primary">Pet Protocol .</span>
               </h2>
               <p className="text-white/40 text-sm sm:text-xl font-medium uppercase tracking-[0.3em] max-w-2xl mx-auto leading-relaxed">
                 Secure your place in the most advanced pet ecosystem today.
               </p>
               <div className="pt-8 flex flex-col sm:flex-row gap-8 justify-center">
                  {!isAuthenticated ? (
                    <>
                      <Link to="/register" className="h-20 px-16 bg-white text-neutral-900 rounded-3xl flex items-center justify-center gap-4 text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-2xl shadow-white/5 active:scale-95">
                         Sign Up <ArrowRight size={20} />
                      </Link>
                      <Link to="/login" className="h-20 px-16 bg-white/5 border border-white/10 text-white rounded-3xl flex items-center justify-center text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95">
                         Login Access
                      </Link>
                    </>
                  ) : (
                    <Link to="/pets" className="h-20 px-20 bg-primary text-white rounded-3xl flex items-center justify-center gap-4 text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-2xl shadow-primary/30 active:scale-95">
                       Browse Catalog <ArrowRight size={20} />
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
