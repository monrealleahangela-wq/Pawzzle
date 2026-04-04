import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Package, Calendar, ArrowRight, Star, Store, ChevronRight, MapPin, Search, Sparkles, ShieldCheck, Play, MousePointer2 } from 'lucide-react';
import { petService, productService, serviceService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';

const FloatingPaws = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className="absolute text-primary-200/20 animate-float"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${10 + Math.random() * 10}s`
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C10.34 2 9 3.34 9 5c0 1.66 1.34 3 3 3s3-1.34 3-3c0-1.66-1.34-3-3-3zM5 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm14 0c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zM12 11c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z" />
          </svg>
        </div>
      ))}
    </div>
  );
};

const Landing = () => {
  const { isAuthenticated, user } = useAuth();
  const [pets, setPets] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
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
    return <PageLoader message="Preparing a world of wagging tails..." />;
  }

  return (
    <div className="min-h-screen bg-[#fafaf7] selection:bg-accent selection:text-primary overflow-hidden">
      
      {/* ── Dynamic Navigation ── */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${isScrolled ? 'py-3 bg-white/90 backdrop-blur-xl border-b border-primary/5 shadow-fun' : 'py-6 bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center text-white shadow-fun group-hover:rotate-12 transition-transform">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C10.34 2 9 3.34 9 5c0 1.66 1.34 3 3 3s3-1.34 3-3c0-1.66-1.34-3-3-3zM5 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm14 0c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm12 11c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z"/></svg>
            </div>
            <span className="text-2xl font-black tracking-tighter text-header italic">Pawzzle</span>
          </Link>
          <div className="flex items-center gap-6">
            {!isAuthenticated ? (
              <>
                <Link to="/login" className="text-[10px] font-black uppercase tracking-[0.2em] text-header/60 hover:text-primary transition-colors">Sign In</Link>
                <Link to="/register" className="btn-fun scale-90 px-6 py-3">Join The Pack</Link>
              </>
            ) : (
              <Link to={user?.role === 'customer' ? '/home' : '/admin-dashboard'} className="btn-fun scale-90 px-6 py-3">My Dashboard</Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── Playful Hero Section ── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <FloatingPaws />
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="relative z-10 space-y-8 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-light rounded-full border border-accent/20">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">New: Intelligence UI Redesign</span>
            </div>
            <h1 className="text-6xl sm:text-8xl font-black text-header tracking-tighter leading-[0.85]">
              Happy Pets, <br/>
              <span className="text-accent italic">Lighter Hearts.</span>
            </h1>
            <p className="text-lg text-primary/70 font-medium max-w-md leading-relaxed">
              Premium care, organic supplies, and professional grooming for your best friends. All in one playful terminal.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/register" className="btn-fun px-10">Start Your Journey</Link>
              <button className="flex items-center gap-3 px-6 py-4 rounded-full border-2 border-primary/10 text-header font-black text-xs uppercase tracking-widest hover:bg-white hover:border-accent/40 transition-all active:scale-95">
                <Play className="h-4 w-4 fill-header" /> Explore Store
              </button>
            </div>
            <div className="flex items-center gap-4 pt-4 border-t border-primary/5">
              <div className="flex -space-x-3">
                 {[1,2,3,4].map(i => <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-200" style={{ backgroundImage: `url(https://i.pravatar.cc/100?img=${i+10})`, backgroundSize: 'cover' }} />)}
              </div>
              <p className="text-[11px] font-black text-primary/40 uppercase tracking-widest">Trusted by 2,000+ Pet Families</p>
            </div>
          </div>
          
          <div className="relative group perspective-1000">
             <div className="absolute inset-0 bg-accent rounded-[3rem] rotate-3 scale-95 blur-2xl opacity-20 group-hover:rotate-6 transition-transform duration-700" />
             <div className="relative bg-white rounded-[3rem] p-4 shadow-fun group-hover:rotate-[-1deg] transition-transform duration-700 border border-primary/5">
                <img 
                  src="/images/hero_pet_garden.png" 
                  alt="Playful Pets" 
                  className="rounded-[2.5rem] w-full h-[600px] object-cover animate-pop"
                />
                <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-[2rem] shadow-hover border border-primary/5 flex items-center gap-4 animate-slide-up delay-300">
                   <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center">
                      <ShieldCheck className="h-6 w-6" />
                   </div>
                   <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Safety First</p>
                      <p className="text-sm font-black text-header">Certified Professional Care</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* ── Service Intelligence ── */}
      <section className="py-24 px-6 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center space-y-4">
             <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-full">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span className="text-[9px] font-black text-primary uppercase tracking-[0.3em]">Our Services</span>
             </div>
             <h2 className="text-4xl sm:text-6xl font-black text-header tracking-tighter">Wellness for Every <span className="text-accent underline decoration-8 decoration-accent/30 underline-offset-4">Tale.</span></h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {services.slice(0, 4).map((service, i) => (
              <Link to={`/bookings?service=${service._id}`} key={service._id} className="card-paw-interactive p-8 space-y-6 group">
                <div className="w-16 h-16 bg-accent-light rounded-3xl flex items-center justify-center text-3xl group-hover:scale-110 group-hover:rotate-6 transition-transform">
                  {i === 0 ? '✂️' : i === 1 ? '🛁' : i === 2 ? '🦮' : '🏥'}
                </div>
                <div>
                   <h3 className="text-xl font-black text-header mb-2">{service.name}</h3>
                   <p className="text-[11px] text-primary/60 font-medium leading-relaxed mb-4">{service.description?.substring(0, 80)}...</p>
                   <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-accent uppercase tracking-widest">Book Now</span>
                      <ArrowRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-2" />
                   </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product Showcase ── */}
      <section className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto space-y-16">
           <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-8">
              <div className="space-y-4">
                 <p className="text-[9px] font-black text-teal-600 uppercase tracking-[0.3em]">Premium Shop</p>
                 <h2 className="text-4xl sm:text-6xl font-black text-header tracking-tighter">Only the <span className="italic">Best</span> Stuff.</h2>
              </div>
              <Link to="/products" className="btn-fun bg-white text-header border border-primary/10 hover:border-accent">View All Products</Link>
           </div>
           
           <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.slice(0, 4).map((product) => (
              <Link to={`/products?id=${product._id}`} key={product._id} className="card-paw-interactive group">
                <div className="relative h-64 overflow-hidden bg-slate-100">
                  <img 
                    src={getImageUrl(product.image)} 
                    alt={product.name} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[9px] font-black text-header uppercase tracking-widest shadow-sm">
                    ₱{product.price}
                  </div>
                </div>
                <div className="p-6 space-y-2">
                   <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest">{product.category}</p>
                   <h3 className="text-lg font-black text-header line-clamp-1 group-hover:text-accent transition-colors">{product.name}</h3>
                   <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(i => <Star key={i} className="h-3 w-3 fill-accent text-accent" />)}
                   </div>
                </div>
              </Link>
            ))}
           </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 px-6 bg-[#3e2723] text-white overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffb74d 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="max-w-4xl mx-auto space-y-12 relative z-10 text-center">
            <Sparkles className="h-12 w-12 text-accent mx-auto animate-float" />
            <h2 className="text-4xl sm:text-6xl font-black tracking-tighter leading-none mb-12">Loved by Pets, <br/> <span className="text-accent underline decoration-8 decoration-accent/30 underline-offset-4">Obsessed</span> by Humans.</h2>
            
            <div className="relative">
               <div className="absolute -top-10 -left-10 text-9xl text-accent/10 font-serif">“</div>
               <p className="text-xl sm:text-3xl font-medium leading-relaxed italic">
                 "Pawzzle has completely changed how I manage Max's appointments. The automated pet profiles make booking easier than ever, and the grooming service is top-notch!"
               </p>
               <div className="mt-12 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full border-4 border-accent shadow-hover bg-slate-200" style={{ backgroundImage: 'url(https://i.pravatar.cc/200?img=32)', backgroundSize: 'cover' }} />
                  <div>
                    <p className="text-xl font-black uppercase tracking-widest">Angelina Rose</p>
                    <p className="text-[10px] font-bold text-accent uppercase tracking-[0.4em]">Max's Human</p>
                  </div>
               </div>
            </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-32 px-6 text-center relative overflow-hidden bg-accent-light">
         <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'url("/images/pet_icons_sheet.png")', backgroundSize: '200px' }} />
         <div className="max-w-2xl mx-auto relative z-10 space-y-10">
            <h2 className="text-5xl sm:text-7xl font-black text-header tracking-tighter leading-none">Ready to start the <span className="text-primary italic">Fun?</span></h2>
            <p className="text-lg text-header/60 font-medium">Join the thousands of pet families that trust Pawzzle with their best friends' needs.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-6">
                <Link to="/register" className="btn-fun px-16 py-6 text-base">Get Started Now</Link>
                <Link to="/products" className="btn-fun bg-white text-header hover:bg-white hover:border-accent">Browse Shop</Link>
            </div>
         </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-20 px-6 bg-white border-t border-primary/5">
         <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-12 sm:gap-16">
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-white text-xs">🐾</div>
                 <span className="text-xl font-black tracking-tighter text-header italic">Pawzzle</span>
               </div>
               <p className="text-xs text-primary/60 leading-relaxed font-medium">Providing the best care and supplies for your beloved pets since 2024. Your animal's happiness is our top priority.</p>
            </div>
            {['Shop', 'Services', 'Support', 'Company'].map(cat => (
              <div key={cat} className="space-y-4">
                 <h4 className="text-[10px] font-black text-header uppercase tracking-widest">{cat}</h4>
                 <div className="flex flex-col gap-3">
                    {[1,2,3].map(i => <Link key={i} to="#" className="text-xs text-primary/40 hover:text-accent transition-colors font-medium">Link {i}</Link>)}
                 </div>
              </div>
            ))}
         </div>
         <div className="max-w-7xl mx-auto mt-20 pt-10 border-t border-primary/5 flex flex-col sm:flex-row justify-between items-center gap-6">
            <p className="text-[10px] font-black text-primary/30 uppercase tracking-widest">© 2026 PAWZZLE INC. ALL RIGHTS RESERVED.</p>
            <div className="flex gap-8">
               {['FB', 'TW', 'IG'].map(s => <a key={s} href="#" className="text-[10px] font-black text-primary/30 hover:text-accent transition-colors">{s}</a>)}
            </div>
         </div>
      </footer>
    </div>
  );
};

export default Landing;
