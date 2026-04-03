import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Package, Calendar, ArrowRight, LogIn, Sparkles, Users, TrendingUp, Star, Store, ChevronRight, MapPin } from 'lucide-react';
import { petService, productService, serviceService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';

const Landing = () => {
  const { isAuthenticated, user } = useAuth();
  const [pets, setPets] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [revealPets, setRevealPets] = useState(false);

  // Intersection Observer for scroll animations
  const sectionRef = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealPets(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) observer.unobserve(sectionRef.current);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [petsRes, productsRes, servicesRes] = await Promise.allSettled([
          petService.getAllPets({ limit: 4 }),
          productService.getAllProducts({ limit: 4 }),
          serviceService.getAllServices({ limit: 4 })
        ]);
        if (petsRes.status === 'fulfilled') setPets(petsRes.value.data.pets || petsRes.value.data || []);
        if (productsRes.status === 'fulfilled') setProducts(productsRes.value.data.products || productsRes.value.data || []);
        if (servicesRes.status === 'fulfilled') setServices(servicesRes.value.data.services || servicesRes.value.data || []);
      } catch (err) {
        console.error('Landing fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <PageLoader message="Loading amazing pets and products..." />;
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] selection:bg-[#5D4037] selection:text-white overflow-hidden text-[#5D4037] font-['Outfit']">
      {/* Premium Ambiance Layer - Immersive Glows */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden opacity-40">
        <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-amber-200/30 rounded-full blur-[150px] animate-spin-slow" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] bg-[#5D4037]/10 rounded-full blur-[150px] animate-blob-move" />
        <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] bg-amber-100/20 rounded-full blur-[120px] animate-pulse" />
      </div>

      {/* Modern High-Stability Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-700 px-4 md:px-8 ${isScrolled ? 'py-4 translate-y-2' : 'py-8'}`}>
        <div className={`container-custom max-w-7xl mx-auto flex justify-between items-center transition-all duration-500 ${isScrolled ? 'bg-white/80 backdrop-blur-2xl rounded-[2.5rem] px-8 py-3 shadow-[0_20px_50px_rgba(93,64,55,0.12)] border border-white/50' : ''}`}>
          <Link to="/" className="flex items-center gap-4 group">
            <div className={`relative p-1.5 rounded-xl transition-all duration-500 ${isScrolled ? 'bg-primary-600 shadow-lg' : ''}`}>
              <img src="/images/logo.png" alt="Logo" className={`h-10 md:h-12 w-auto object-contain transition-transform group-hover:scale-110 drop-shadow-2xl ${isScrolled ? 'brightness-0 invert' : ''}`} />
            </div>
            <span className={`text-2xl font-black tracking-[-0.05em] transition-colors duration-500 ${isScrolled ? 'text-[#5D4037]' : 'text-[#5D4037]'}`}>PAWZZLE<span className="text-amber-500">.</span></span>
          </Link>
          
          <div className="flex items-center gap-4 md:gap-8">
            {!isAuthenticated ? (
              <>
                <Link to="/login" className="text-[12px] font-black uppercase tracking-[0.2em] text-[#5D4037]/60 hover:text-amber-600 transition-colors hidden sm:block">LOGIN</Link>
                <Link
                  to="/register?seller=true"
                  className="hidden md:flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] px-6 py-3 rounded-2xl bg-white border border-[#5D4037]/5 text-amber-600 hover:text-amber-700 hover:border-amber-100 transition-all shadow-[0_10px_30px_rgba(0,0,0,0.04)]"
                >
                  <Store className="h-4 w-4" />
                  PARTNER
                </Link>
                <Link to="/register" className="px-8 py-3.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_15px_35px_rgba(184,137,90,0.4)] hover:shadow-amber-600/50 hover:translate-y-[-2px] transition-all active:scale-95">JOIN</Link>
              </>
            ) : (
              <>
                <Link to="/home" className="px-10 py-4 bg-[#5D4037] text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-black transition-all active:scale-95">DASHBOARD</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section - High-Fidelity Entrance */}
      <section className="relative pt-48 pb-32 lg:pt-64 lg:pb-48 overflow-hidden z-10">
        <div className="container-custom relative">
          <div className="max-w-5xl mx-auto text-center space-y-12">
            <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-white border border-amber-100 rounded-full shadow-[0_10px_30px_rgba(184,137,90,0.08)] animate-fade-in">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[10px] font-black text-amber-700 uppercase tracking-[0.3em]">THE FUTURE OF COMPANIONSHIP</span>
            </div>

            <h1 className="text-6xl md:text-8xl lg:text-[10rem] font-black tracking-[-0.05em] text-[#5D4037] leading-[0.85] animate-slide-up uppercase">
              Beyond <br />
              <span className="italic text-transparent bg-clip-text bg-gradient-to-b from-amber-400 to-amber-700 block mt-2">Love .</span>
            </h1>

            <p className="text-lg md:text-2xl text-[#5D4037]/60 max-w-3xl mx-auto font-medium leading-relaxed animate-slide-up" style={{ animationDelay: '0.2s' }}>
              Access elite pet care, secure world-class companions, and explore a curated hardware ecosystem for your best friend.
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-8 animate-slide-up" style={{ animationDelay: '0.4s' }}>
              <Link to="/pets" className="group relative px-12 py-6 bg-gradient-to-br from-[#3D2B23] to-[#211510] text-white rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] shadow-[0_25px_60px_rgba(0,0,0,0.2)] hover:shadow-amber-900/30 hover:scale-105 active:scale-95 transition-all overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative flex items-center gap-3">
                  INITIATE ADOPTION
                  <ChevronRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </span>
              </Link>
              
              <Link to="/products" className="group px-12 py-6 bg-white border-2 border-[#5D4037]/10 text-[#5D4037] rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] shadow-[0_15px_40px_rgba(0,0,0,0.05)] hover:border-amber-500 transition-all backdrop-blur-xl">
                 EXPLORE ECOSYSTEM
              </Link>
            </div>
          </div>
        </div>

        {/* Abstract 3D Glass Orbs */}
        <div className="absolute -top-20 -right-20 w-[600px] h-[600px] bg-gradient-to-br from-amber-500/5 to-transparent rounded-full border border-amber-500/5 backdrop-blur-3xl p-20 opacity-50 hidden xl:block animate-spin-slow">
           <div className="w-full h-full rounded-full border border-amber-500/10" />
        </div>
      </section>

      {/* Feature Bento Section - Modern Sophistication */}
      <section className="py-32 relative z-10 bg-white border-y border-[#5D4037]/5">
        <div className="container-custom max-w-7xl mx-auto">
           <div className="flex flex-col items-center text-center mb-24 space-y-6">
              <span className="text-[11px] font-black text-amber-500 uppercase tracking-[0.4em]">SYSTEM CORE</span>
              <h2 className="text-4xl md:text-6xl font-black text-[#5D4037] tracking-tight uppercase">Curated <span className="text-amber-600 italic">Ecosystem</span></h2>
           </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { icon: Heart, color: 'bg-rose-50', iconColor: 'text-rose-500', title: 'Biological Unity', desc: 'Secure high-pedigree companions through our verified ethical breeding network.' },
              { icon: Package, color: 'bg-amber-50', iconColor: 'text-amber-600', title: 'Hardware Hub', desc: 'From smart nutritional dispensers to high-luxury living habitats.' },
              { icon: Calendar, color: 'bg-blue-50', iconColor: 'text-blue-500', title: 'Expert Logistics', desc: 'Schedule precision healthcare and tactical grooming services with elite pros.' }
            ].map((feature, i) => (
              <div key={i} className="group p-10 bg-[#FAF9F6] rounded-[3rem] border border-[#5D4037]/5 hover:bg-white hover:shadow-[0_40px_80px_rgba(93,64,55,0.12)] hover:-translate-y-3 transition-all duration-500">
                <div className={`w-20 h-20 ${feature.color} rounded-[1.5rem] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`h-10 w-10 ${feature.iconColor}`} />
                </div>
                <h3 className="text-2xl font-black text-[#5D4037] mb-4 uppercase tracking-tighter">{feature.title}</h3>
                <p className="text-[#5D4037]/50 font-medium leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Merchant Program - High Contrast Callout */}
      <section className="py-32 relative z-10 overflow-hidden">
        <div className="container-custom max-w-7xl mx-auto">
          <div className="relative rounded-[4rem] overflow-hidden bg-gradient-to-br from-[#1a1a1a] via-[#2d1e16] to-[#1a1a1a] p-12 lg:p-24 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] group">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-amber-500/10 blur-[150px] group-hover:animate-pulse" />
            
            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
              <div className="flex-1 text-center lg:text-left space-y-8">
                <div className="inline-flex items-center gap-3 px-5 py-2 bg-amber-400/10 border border-amber-400/20 rounded-full">
                  <Store className="h-4 w-4 text-amber-400" />
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em]">MERCHANT PROGRAM</span>
                </div>
                <h2 className="text-4xl md:text-6xl font-black text-white tracking-[-0.03em] uppercase leading-none">
                  Establish Your <br />
                  <span className="text-amber-500 italic">Digital Flagship .</span>
                </h2>
                <p className="text-white/40 text-lg md:text-xl leading-relaxed max-w-2xl font-medium">
                  Integrate your breeding program or product lineup into the Pawzzle network. Reach elite clientele and grow with our intelligent scaling tools.
                </p>

                <div className="flex flex-wrap gap-8 justify-center lg:justify-start pt-4">
                  {['Intelligent Analytics', 'Secure Escrow', 'Global Reach'].map((benefit) => (
                    <div key={benefit} className="flex items-center gap-3 text-white/70 text-sm font-black uppercase tracking-widest">
                       <ShieldCheck className="h-5 w-5 text-amber-500" />
                       {benefit}
                    </div>
                  ))}
                </div>
              </div>

              <div className="shrink-0 relative group/cta">
                <Link
                  to={isAuthenticated ? '/account-upgrade' : '/register?seller=true'}
                  className="relative z-10 inline-flex items-center gap-4 px-12 py-7 rounded-[2rem] bg-gradient-to-r from-amber-500 to-amber-600 text-white font-black text-sm uppercase tracking-[0.3em] shadow-[0_25px_50px_rgba(184,137,90,0.4)] hover:shadow-amber-500/60 hover:scale-105 active:scale-95 transition-all"
                >
                  UPGRADE ROLE
                  <ArrowRight className="h-5 w-5 group-hover/cta:translate-x-2 transition-transform" />
                </Link>
                <div className="absolute -inset-4 bg-amber-500/20 blur-2xl rounded-full opacity-0 group-hover/cta:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Fleet Grid - Biological Units Section */}
      <section ref={sectionRef} className="py-32 relative z-10">
        <div className="container-custom max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-24 gap-8">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-amber-50 border border-amber-100 rounded-full">
                <HeartIcon className="h-4 w-4 text-amber-600" />
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-[0.3em]">NEW ARRIVALS</span>
              </div>
              <h2 className="text-4xl md:text-7xl font-black text-[#5D4037] tracking-[-0.03em] uppercase leading-none">
                Biological <br />
                <span className="italic text-amber-600">Companions .</span>
              </h2>
              <p className="text-lg md:text-xl text-[#5D4037]/40 max-w-xl font-medium tracking-tight">Our latest elite fleet of companions are ready for secure integration into your home base.</p>
            </div>
            <Link to="/pets" className="group flex items-center gap-4 font-black text-[12px] uppercase tracking-[0.3em] text-[#5D4037] hover:text-amber-600 transition-all border-b-2 border-transparent hover:border-amber-600 pb-2">
              BROWSE FLEET
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center group-hover:translate-x-2 transition-all">
                <ChevronRight className="h-5 w-5 text-amber-600" />
              </div>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
            {pets.map((pet, index) => (
              <div 
                key={pet._id} 
                className={`group relative flex flex-col transition-all duration-1000 ${revealPets ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-32'}`} 
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-[3rem] shadow-2xl group-hover:shadow-amber-500/20 transition-all duration-700">
                   <img
                    src={pet.images?.[0] || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=1000&auto=format&fit=crop'}
                    alt={pet.name}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                  />
                  {/* Glass Info Overlay - Appears on Mobile/Persistent */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#211510]/95 via-transparent to-transparent opacity-100 lg:opacity-0 group-hover:opacity-100 transition-all duration-500 p-8 flex flex-col justify-end">
                     <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-2">{pet.breed || 'ELITE UNIT'}</p>
                     <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">{pet.name}</h3>
                     <div className="flex justify-between items-center">
                        <span className="text-xl font-bold font-sans text-white">₱{pet.price?.toLocaleString()}</span>
                        <Link to={`/pets/${pet._id}`} className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-xl hover:scale-110 active:scale-90 transition-transform">
                          <ArrowRight className="h-6 w-6" />
                        </Link>
                     </div>
                  </div>
                </div>
                
                {/* Desktop Labels - Hidden in Overlay */}
                <div className="pt-8 space-y-2 lg:block hidden">
                   <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-amber-600 uppercase tracking-[0.2em]">{pet.type}</span>
                      <div className="flex items-center gap-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                         <span className="text-[10px] font-black text-[#5D4037]/30 uppercase tracking-[0.2em]">AVAILABLE</span>
                      </div>
                   </div>
                   <h4 className="text-2xl font-black text-[#5D4037] uppercase tracking-tight group-hover:text-amber-600 transition-colors">{pet.name}</h4>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Global Mission - High Depth Glass Banner */}
      <section className="py-32 relative z-10 px-4 md:px-8">
        <div className="container-custom max-w-6xl mx-auto">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#3D2B23] via-[#211510] to-[#3D2B23] rounded-[4rem] p-16 lg:p-32 text-center text-white shadow-[0_60px_120px_-30px_rgba(0,0,0,0.6)]">
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-40" />
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-400/5 rounded-full blur-[100px] -mr-32 -mt-32" />
            
            <div className="relative z-10 max-w-4xl mx-auto space-y-12">
              <h2 className="text-5xl md:text-8xl font-black tracking-[-0.05em] uppercase leading-none">
                {isAuthenticated ? `Welcome Home, ${user?.firstName} .` : 'Join the Network .'}
              </h2>
              <p className="text-xl md:text-2xl text-white/50 leading-relaxed font-medium">
                {isAuthenticated
                  ? 'Your biological companions are secured. Explore new tactical supplies or upgrade your merchant status for priority placement.'
                  : 'Establish your legacy in the Pawzzle ecosystem. Securecompanions, master healthcare, and upgrade your life.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-8 justify-center pt-8">
                {!isAuthenticated ? (
                  <>
                    <Link to="/register" className="px-12 py-6 bg-amber-500 text-white text-sm font-black uppercase tracking-[0.3em] rounded-[2rem] hover:bg-amber-600 shadow-[0_20px_50px_rgba(184,137,90,0.4)] transition-all hover:scale-105 active:scale-95">AUTHENTICATE</Link>
                    <Link to="/pets" className="px-12 py-6 bg-white/5 backdrop-blur-xl border border-white/10 text-white text-sm font-black uppercase tracking-[0.3em] rounded-[2rem] hover:bg-white/10 transition-all">SURVEY FLEET</Link>
                  </>
                ) : (
                  <>
                    <Link to="/home" className="px-12 py-6 bg-amber-500 text-white text-sm font-black uppercase tracking-[0.3em] rounded-[2rem] shadow-[0_20px_50px_rgba(184,137,90,0.4)] transition-all hover:scale-105">MY MODULE</Link>
                    <Link to="/pets" className="px-12 py-6 bg-white/5 backdrop-blur-xl border border-white/10 text-white text-sm font-black uppercase tracking-[0.3em] rounded-[2rem] transition-all">FLEET STATUS</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Branded Footer - Minimalist Luxury */}
      <footer className="py-24 border-t border-[#5D4037]/5 px-4">
        <div className="container-custom max-w-7xl mx-auto flex flex-col items-center gap-12">
             <div className="flex flex-col items-center gap-6 group">
                <div className="p-4 bg-[#5D4037] rounded-3xl group-hover:rotate-[360deg] transition-transform duration-1000 shadow-2xl">
                   <img src="/images/logo.png" alt="Pawzzle Logo" className="h-10 w-auto brightness-0 invert" />
                </div>
                <div className="text-center">
                   <p className="text-2xl font-black tracking-[-0.05em] text-[#5D4037]">PAWZZLE<span className="text-amber-500">.</span></p>
                   <p className="text-[10px] font-black text-[#5D4037]/40 uppercase tracking-[0.5em] mt-2">GLOBAL COMPANION NETWORK</p>
                </div>
             </div>
             
             <div className="flex gap-12 flex-wrap justify-center">
                {['Legal Protocol', 'Safety Escrow', 'Merchant Terms', 'API Connectivity'].map((link) => (
                   <a key={link} href="#" className="text-[11px] font-black uppercase tracking-widest text-[#5D4037]/30 hover:text-amber-600 transition-colors">{link}</a>
                ))}
             </div>

             <div className="text-center space-y-2">
                <p className="text-[#5D4037]/40 text-[11px] font-black tracking-[0.3em] uppercase">&copy; 2026 PAWZZLE PROTOCOL. ALL RIGHTS RESERVED.</p>
                <div className="flex items-center justify-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[9px] font-black text-emerald-600/60 uppercase tracking-widest">SYSTEM STATUS: OPTIMAL</span>
                </div>
             </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
