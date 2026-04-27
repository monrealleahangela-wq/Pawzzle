import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Heart, 
  Package, 
  Calendar, 
  ArrowRight, 
  Sparkles, 
  Users, 
  Star, 
  Store, 
  ShieldCheck, 
  Search,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  MapPin,
  Clock,
  Shield
} from 'lucide-react';
import { publicService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { PageLoader } from '../../components/ui/LoadingSpinner';

const Landing = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({
    pets: [],
    products: [],
    services: [],
    experts: [],
    stats: { stores: 0, experts: 0, products: 0, services: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLandingData = useCallback(async () => {
    try {
      const response = await publicService.getLandingData();
      setData(response.data);
    } catch (err) {
      console.error('Landing fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLandingData();
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchLandingData]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  if (loading) return <PageLoader message="Initializing Brand Ecosystem..." />;

  const { pets, products, services, experts, stats } = data;

  return (
    <div className="min-h-screen bg-white selection:bg-primary-500 selection:text-white overflow-x-hidden text-slate-900 font-inter">
      {/* ── STABLE BRAND NAVIGATION ── */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${isScrolled ? 'py-3 bg-white/95 backdrop-blur-xl border-b border-primary-100/50 block shadow-sm' : 'py-6 bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2 group transition-transform active:scale-95">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center p-2 shadow-lg shadow-primary-200">
               <img src="/images/logo.png" alt="P" className="w-full h-full object-contain brightness-0 invert" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900 uppercase">Pawzzle</span>
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {['Pets', 'Products', 'Services', 'Experts'].map((item) => (
              <Link 
                key={item} 
                to={`/${item.toLowerCase()}`} 
                className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-primary-600 transition-colors"
              >
                {item}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <Link to="/seller-join" className="hidden sm:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary-600 hover:bg-primary-50 px-4 py-2 rounded-full transition-all">
              <Store className="h-3.5 w-3.5" />
              Be a Seller
            </Link>
            {!isAuthenticated ? (
              <div className="flex items-center gap-2 sm:gap-4">
                <Link to="/login" className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-primary-600 transition-colors px-2">Sign In</Link>
                <Link to="/register" className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-200 transition-all active:scale-95">Join Platform</Link>
              </div>
            ) : (
              <Link to="/home" className="bg-slate-900 hover:bg-black text-white px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200 transition-all active:scale-95">My Workspace</Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO SECTION ── */}
      <section className="relative pt-32 pb-4 sm:pt-48 sm:pb-12 bg-white overflow-hidden">
        {/* Dynamic Background */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-primary-50/30 rounded-bl-[10rem] -z-10 animate-fade-in" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-12 sm:gap-20 items-center">
            <div className="space-y-6 sm:space-y-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-50/50 border border-primary-100 rounded-full">
                <Sparkles className="h-3 w-3 text-primary-600" />
                <span className="text-[9px] font-black text-primary-700 uppercase tracking-[0.2em]">Verified Pet Ecosystem</span>
              </div>

              <h1 className="text-4xl sm:text-7xl font-black tracking-tighter text-slate-900 leading-[1] uppercase">
                Redefining <br/>
                <span className="italic text-primary-600">The Joy</span> <br/>
                Of Adoption
              </h1>

              <p className="text-sm sm:text-lg text-slate-500 max-w-lg font-medium leading-relaxed">
                Platform-wide integration for pet lovers. Discover verified pets, premium supplies, and professional veterinary services in one unified minimalist environment.
              </p>

              {/* Quick Search */}
              <form onSubmit={handleSearch} className="relative max-w-md group pr-4 sm:pr-0">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find breeds, specialists, or supplies..." 
                  className="w-full bg-white border-2 border-slate-100 rounded-2xl py-4 sm:py-5 pl-14 pr-6 text-xs sm:text-sm font-bold focus:outline-none focus:border-primary-600 transition-all shadow-sm group-hover:shadow-xl group-hover:shadow-primary-100/20"
                />
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300 group-hover:text-primary-600 transition-colors" />
                <button type="submit" className="absolute right-6 top-1/2 -translate-y-1/2 h-8 w-8 bg-primary-600 text-white rounded-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-90 shadow-md">
                   <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="flex flex-wrap gap-4 pt-4">
                 {[
                   { label: 'Shop Pets', icon: Heart, to: '/pets' },
                   { label: 'Get Supplies', icon: Package, to: '/products' },
                   { label: 'Book Experts', icon: Users, to: '/services' }
                 ].map(cta => (
                   <Link key={cta.label} to={cta.to} className="flex items-center gap-2 group">
                      <div className="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-primary-600 transition-all flex items-center justify-center">
                        <cta.icon className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-900 transition-colors">{cta.label}</span>
                   </Link>
                 ))}
              </div>
            </div>

            {/* Hero Image Block */}
            <div className="relative animate-slide-up pl-4 sm:pl-0">
               <div className="relative z-10 rounded-[3rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(139,69,19,0.2)] bg-slate-100 aspect-[4/5] sm:aspect-square">
                  <img src="/images/landing_hero.png" alt="Lifestyle" className="w-full h-full object-cover transition-transform duration-1000 hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-950/20 via-transparent to-transparent" />
               </div>
               
               {/* Floating Data Card */}
               <div className="absolute -bottom-6 -left-6 sm:-bottom-10 sm:-left-10 bg-white p-4 sm:p-6 rounded-3xl shadow-2xl z-20 border border-slate-50 flex items-center gap-4 animate-float">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-black text-xs">
                     <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Verified Professionals</p>
                    <p className="text-[10px] font-bold text-slate-400">100% Identity Protected</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MODULE BENTO GRID ── */}
      <section className="py-20 sm:py-32 bg-slate-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
           <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-24 px-4">
              <h2 className="text-2xl sm:text-5xl font-black text-slate-900 tracking-tight uppercase mb-4 sm:mb-6 leading-none">Modular Care <br/> For Every Need</h2>
              <div className="w-12 h-1 bg-primary-600 mx-auto rounded-full mb-4 sm:mb-8" />
              <p className="text-xs sm:text-base text-slate-500 font-medium">Our enterprise-grade platform adapts to your pet's journey, from finding a companion to lifetime medical support.</p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-10">
              {[
                { title: 'The Fleet', subtitle: 'Live Pet Adoption', icon: Heart, count: stats.stores + '+ Sources', desc: 'Secure adoption workflow with verified breeders and shelters in Cavite and beyond.', color: 'bg-primary-600' },
                { title: 'Supply Chain', subtitle: 'Global Logistics', icon: Package, count: stats.products + '+ Items', desc: 'Real-time inventory management for foods, medical supplies, and toys.', color: 'bg-slate-900' },
                { title: 'The Experts', subtitle: 'Certified Support', icon: Users, count: stats.experts + '+ Pros', desc: 'Access to verified veterinarians, professional groomers, and behavioral trainers.', color: 'bg-primary-500' }
              ].map((module, i) => (
                <div key={i} className="group p-8 sm:p-12 bg-white rounded-[3rem] border border-slate-100 hover:border-primary-100 transition-all duration-500 shadow-sm hover:shadow-2xl hover:shadow-primary-100/20">
                   <div className={`${module.color} w-16 h-16 rounded-2xl flex items-center justify-center mb-10 shadow-xl shadow-slate-200 transition-transform group-hover:rotate-6`}>
                      <module.icon className="h-8 w-8 text-white" />
                   </div>
                   <p className="text-[10px] font-black text-primary-600 uppercase tracking-[0.3em] mb-2">{module.subtitle}</p>
                   <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter mb-4">{module.title}</h3>
                   <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed mb-10 opacity-70">{module.desc}</p>
                   <div className="flex items-center justify-between pt-8 border-t border-slate-50">
                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{module.count}</span>
                      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-primary-600 transition-colors">
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors" />
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* ── FEATURED PETS ── */}
      <section className="py-20 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
           <div className="flex flex-col sm:flex-row justify-between items-end mb-12 sm:mb-20 px-2 sm:px-0">
              <div className="space-y-2 sm:space-y-4">
                 <h2 className="text-2xl sm:text-5xl font-black text-slate-900 tracking-tight uppercase leading-none">New <br/> Guardians</h2>
                 <p className="text-[10px] sm:text-sm font-black text-slate-400 uppercase tracking-widest">Latest pets ready for a home</p>
              </div>
              <Link to="/pets" className="group flex items-center gap-2 font-black text-[10px] sm:text-xs uppercase tracking-widest text-primary-600 pt-4 sm:pt-0">
                 Explore Catalog
                 <ArrowRight className="h-4 w-4 group-hover:translate-x-2 transition-transform" />
              </Link>
           </div>

           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-10">
              {pets.map((pet, index) => (
                <Link to={`/pets/${pet._id}`} key={pet._id} className="group animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="relative aspect-[3/4] rounded-[2.5rem] sm:rounded-[3.5rem] overflow-hidden mb-4 sm:mb-8 bg-slate-100 shadow-sm transition-all group-hover:shadow-2xl group-hover:shadow-primary-100">
                    <img 
                      src={getImageUrl(pet.images?.[0]) || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=1000&auto=format&fit=crop'} 
                      alt={pet.name} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-4 left-4 right-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all">
                       <div className="bg-white/90 backdrop-blur-md p-3 sm:p-4 rounded-2xl flex items-center justify-between border border-white/20">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-900">View Data</span>
                          <Sparkles className="h-3 w-3 text-primary-600" />
                       </div>
                    </div>
                  </div>
                  <div className="space-y-1 sm:space-y-2 px-2 sm:px-6">
                    <div className="flex justify-between items-center">
                       <h3 className="text-xs sm:text-xl font-black text-slate-900 truncate uppercase tracking-tight">{pet.name}</h3>
                       <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${pet.gender?.toLowerCase() === 'male' ? 'bg-blue-400' : 'bg-rose-400'}`} title={pet.gender} />
                    </div>
                    <div className="flex justify-between items-center opacity-60">
                       <p className="text-[8px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest truncate">{pet.breed}</p>
                       <p className="text-[9px] sm:text-sm font-black text-slate-900 tracking-tighter">₱{pet.price?.toLocaleString()}</p>
                    </div>
                  </div>
                </Link>
              ))}
           </div>
        </div>
      </section>

      {/* ── VERIFIED EXPERTS ── */}
      <section className="py-20 sm:py-32 bg-slate-900 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(139,69,19,0.1),transparent)]" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10">
           <div className="grid lg:grid-cols-2 gap-16 sm:gap-24 items-center">
              <div className="space-y-6 sm:space-y-10">
                 <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
                   <ShieldCheck className="h-3 w-3 text-primary-400" />
                   <span className="text-[9px] font-black text-primary-400 uppercase tracking-[0.2em]">Medical Transparency</span>
                 </div>
                 <h2 className="text-3xl sm:text-6xl font-black text-white uppercase tracking-tight leading-[1] mb-6 sm:mb-0">Certified <br/> Pet <br/> Specialists</h2>
                 <p className="text-sm sm:text-lg text-slate-400 max-w-lg font-medium leading-relaxed opacity-80">
                   Access verified service professionals with documented certifications. Our platform ensures that every veterinarian, groomer, and trainer is identity-verified and credential-checked.
                 </p>
                 
                 <div className="grid grid-cols-2 gap-4 sm:gap-8 pt-4 sm:pt-8 pr-4 sm:pr-0">
                    {[
                      { icon: Shield, label: 'Identity Verified', desc: 'Secure credential check' },
                      { icon: Star, label: 'Peer Rated', desc: 'Real customer reviews' },
                      { icon: MapPin, label: 'Nearby Access', desc: 'Localized expertise' },
                      { icon: Clock, label: '24/7 Support', desc: 'Availability status' }
                    ].map(card => (
                      <div key={card.label} className="p-4 sm:p-6 bg-white/5 rounded-3xl border border-white/5">
                        <card.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary-500 mb-2 sm:mb-4" />
                        <h4 className="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest mb-1">{card.label}</h4>
                        <p className="text-[8px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-tight opacity-60">{card.desc}</p>
                      </div>
                    ))}
                 </div>

                 <Link to="/services" className="inline-flex px-10 py-4 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs hover:bg-primary-500 transition-all shadow-2xl shadow-primary-900/50 active:scale-95 group">
                    View Verified Experts
                    <ChevronRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                 </Link>
              </div>

              {/* Experts Listing */}
              <div className="space-y-4 sm:space-y-6">
                 {experts.length > 0 ? experts.map((expert, i) => (
                   <div key={i} className="group p-4 sm:p-8 bg-white/5 rounded-[2.5rem] border border-white/5 hover:border-primary-500/30 transition-all hover:bg-white/[0.07] animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                      <div className="flex items-center gap-4 sm:gap-8">
                         <div className="relative shrink-0">
                            {expert.avatar ? (
                              <img src={getImageUrl(expert.avatar)} alt={expert.firstName} className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-white/10" />
                            ) : (
                              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 flex items-center justify-center text-white/30 text-xl font-black uppercase tracking-widest">
                                {expert.firstName[0]}{expert.lastName[0]}
                              </div>
                            )}
                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${ (new Date() - new Date(expert.lastSeen)) < 5 * 60 * 1000 ? 'bg-emerald-500' : 'bg-slate-500' }`} />
                         </div>
                         <div className="min-w-0 flex-1">
                            <h4 className="text-sm sm:text-xl font-black text-white uppercase tracking-tight truncate mb-1">{expert.firstName} {expert.lastName}</h4>
                            <p className="text-[9px] sm:text-xs font-black text-primary-500 uppercase tracking-[0.2em] mb-2 sm:mb-4">{expert.staffType?.replace(/_/g, ' ')}</p>
                            <div className="flex items-center gap-3 opacity-60">
                               <div className="flex items-center gap-1">
                                  <Star className="h-3 w-3 text-primary-500 fill-primary-500" />
                                  <span className="text-[10px] font-black text-white">{expert.professionalProfile?.rating || '5.0'}</span>
                               </div>
                               <div className="flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                                  <span className="text-[10px] font-black text-white">{expert.professionalProfile?.experienceYears || 0}Y EXP</span>
                               </div>
                            </div>
                         </div>
                         <div className="hidden sm:block">
                            <span className="px-3 py-1 bg-white/10 text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all group-hover:bg-primary-600">Verified</span>
                         </div>
                      </div>
                   </div>
                 )) : (
                   <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                      <Users className="h-10 w-10 text-white/10 mx-auto mb-4" />
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Expert Network Initializing...</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
      </section>

      {/* ── PLATFORM STATS ── */}
      <section className="py-20 sm:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
           <div className="bg-primary-50/50 rounded-[3rem] p-12 sm:p-24 border border-primary-50">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12 text-center">
                 {[
                   { label: 'Active Stores', value: stats.stores, unit: 'Stores' },
                   { label: 'Supply Nodes', value: stats.products, unit: 'Items' },
                   { label: 'Health Experts', value: stats.experts, unit: 'Verified' },
                   { label: 'Success Rate', value: '99', unit: '%' }
                 ].map((stat, i) => (
                   <div key={i} className="space-y-2 sm:space-y-4">
                      <p className="text-3xl sm:text-6xl font-black text-slate-900 tracking-tighter tabular-nums leading-none">
                        {stat.value}{stat.value > 1000 ? '+' : ''}
                      </p>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.2em]">{stat.label}</span>
                        <span className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">{stat.unit} Active</span>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </section>

      {/* ── CTA & FOOTER ── */}
      <section className="py-20 sm:py-32 relative z-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="relative bg-slate-900 rounded-[3rem] sm:rounded-[5rem] p-12 sm:p-32 text-center overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary-600/10 rounded-full blur-[120px] -mr-48 -mt-48" />
            
            <div className="relative z-10 max-w-2xl mx-auto space-y-6 sm:space-y-10">
              <h2 className="text-3xl sm:text-6xl font-black text-white tracking-tighter uppercase leading-none">
                Start Your <br/> Branded Journey
              </h2>
              <p className="text-sm sm:text-lg text-slate-400 font-medium leading-relaxed opacity-80 px-4 sm:px-0">
                Join thousands of pet owners who trust Pawzzle for verified adoptions and professional medical care. Your pet deserved a premium ecosystem.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center">
                {!isAuthenticated ? (
                  <>
                    <Link to="/register" className="bg-primary-600 hover:bg-primary-500 text-white px-10 py-5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-primary-900/50 transition-all active:scale-95">Establish Account</Link>
                    <Link to="/pets" className="border-2 border-white/10 hover:border-white/30 text-white px-10 py-5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all">Explore Platform</Link>
                  </>
                ) : (
                  <Link to="/home" className="bg-white text-slate-900 hover:bg-slate-50 px-10 py-5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95">Return to Dashboard</Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 sm:py-24 border-t border-slate-50 text-center px-4">
        <div className="max-w-7xl mx-auto space-y-8">
           <div className="flex justify-center items-center gap-3">
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center p-1.5 shadow-lg">
                <img src="/images/logo.png" alt="P" className="w-full h-full object-contain brightness-0 invert" />
              </div>
              <span className="text-sm font-black tracking-[0.3em] text-slate-900">PAWZZLE</span>
           </div>
           <div className="flex flex-wrap justify-center gap-6 sm:gap-12 border-y border-slate-50 py-8">
              {['Privacy Protocol', 'Medical Terms', 'Seller Standards', 'PayMongo Secure', 'Refund Policy'].map(link => (
                <Link key={link} to="#" className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors uppercase">{link}</Link>
              ))}
           </div>
           <div className="pt-8 space-y-2">
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">© 2026 PAWZZLE ENTERPRISE PLATFORM</p>
              <p className="text-[9px] text-slate-400 font-medium uppercase tracking-[0.2em]">Cavite, Philippines • Secured by PayMongo</p>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
