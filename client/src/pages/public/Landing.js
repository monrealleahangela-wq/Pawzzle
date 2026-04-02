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
    <div className="min-h-screen bg-neutral-50 selection:bg-primary-500 selection:text-white overflow-hidden text-slate-900">
      {/* Sticky Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${isScrolled ? 'py-4 glass-morphism' : 'py-6 bg-transparent'}`}>
        <div className="container-custom flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3 group">
            <img src="/images/logo.png" alt="Pawzzle Logo" className="h-10 md:h-12 w-auto object-contain transition-transform group-hover:scale-110 drop-shadow-2xl" />
            <span className={`text-2xl font-black tracking-tighter ${isScrolled ? 'text-primary-600' : 'text-slate-900'}`}>Pawzzle</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            {!isAuthenticated ? (
              <>
                <Link to="/login" className="text-sm font-black uppercase tracking-widest text-slate-600 hover:text-primary-600 transition-colors hidden sm:block">Sign In</Link>
                <Link
                  to="/register?seller=true"
                  className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.15em] px-4 py-2 rounded-xl border-2 border-amber-400 text-amber-600 hover:bg-amber-400 hover:text-white transition-all duration-200 shadow-sm shadow-amber-100"
                >
                  <Store className="h-3.5 w-3.5" />
                  Be a Seller
                </Link>
                <Link to="/register" className="btn btn-primary px-5 py-2.5 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-primary-100">Join</Link>
              </>
            ) : (
              <>
                {user?.role === 'customer' && (
                  <Link
                    to="/account-upgrade"
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.15em] px-4 py-2 rounded-xl border-2 border-amber-400 text-amber-600 hover:bg-amber-400 hover:text-white transition-all duration-200 shadow-sm shadow-amber-100"
                  >
                    <Store className="h-3.5 w-3.5" />
                    Be a Seller
                  </Link>
                )}
                <Link to="/home" className="btn btn-primary px-5 py-2.5 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-primary-100">Dashboard</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Dynamic Background Blobs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-200/30 rounded-full blur-[120px] blob-animation" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary-200/30 rounded-full blur-[120px] blob-animation" style={{ animationDelay: '-2s' }} />
        <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] bg-primary-200/20 rounded-full blur-[100px] blob-animation" style={{ animationDelay: '-4s' }} />
      </div>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="container-custom relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 border border-primary-100 rounded-full animate-fade-in">
              <Sparkles className="h-4 w-4 text-primary-600 animate-pulse" />
              <span className="text-sm font-bold text-primary-700 uppercase tracking-wider">The Future of Pet Adoption</span>
            </div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-slate-900 leading-[1.1] animate-slide-up">
              Find Your New
              <span className="block italic text-transparent bg-clip-text bg-gradient-to-r from-primary-600 via-secondary-600 to-primary-600">Best Friend</span>
            </h1>

            <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: '0.2s' }}>
              Browse premium pet supplies, find a bestfriend, and book expert services. Everything your furry friend needs, all in one premium platform.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap animate-slide-up" style={{ animationDelay: '0.4s' }}>
              {!isAuthenticated ? (
                <Link to="/login" className="btn btn-primary px-10 py-5 text-lg group shadow-xl shadow-primary-200">
                  Get Started
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </Link>
              ) : (
                <Link to="/home" className="btn btn-primary px-10 py-5 text-lg group shadow-xl shadow-primary-200">
                  Go to Dashboard
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </Link>
              )}
              <Link to="/pets" className="btn btn-outline px-10 py-5 text-lg border-2 border-slate-200 hover:border-primary-600 bg-white/50 backdrop-blur-sm">
                <Heart className="h-5 w-5 mr-1" />
                Browse Pets
              </Link>
              <Link
                to={isAuthenticated ? '/account-upgrade' : '/register?seller=true'}
                className="flex items-center justify-center gap-2 px-10 py-5 text-lg font-black uppercase tracking-[0.15em] rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-xl shadow-amber-200 hover:from-amber-500 hover:to-amber-600 transition-all duration-300 hover:scale-105 active:scale-95"
              >
                <Store className="h-5 w-5" />
                Be a Seller
              </Link>
            </div>
          </div>
        </div>

        {/* Floating elements for visual depth */}
        <div className="absolute top-1/4 left-10 float-animation hidden xl:block opacity-40">
          <div className="p-4 glass-morphism rounded-2xl shadow-xl flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center"><Heart className="text-primary-600 h-5 w-5" /></div>
            <div><p className="text-xs font-bold text-slate-800">Premium Supplies!</p><p className="text-[10px] text-slate-500">This month</p></div>
          </div>
        </div>
        <div className="absolute bottom-1/4 right-10 float-animation hidden xl:block opacity-40" style={{ animationDelay: '-3s' }}>
          <div className="p-4 glass-morphism rounded-2xl shadow-xl flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary-100 rounded-full flex items-center justify-center"><Package className="text-secondary-600 h-5 w-5" /></div>
            <div><p className="text-xs font-bold text-slate-800">Premium Care</p><p className="text-[10px] text-slate-500">Top Rated</p></div>
          </div>
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section className="py-24 bg-white/50 relative z-10 backdrop-blur-md border-y border-slate-100">
        <div className="container-custom">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card group hover:bg-slate-50 border-none shadow-none hover:shadow-2xl transition-all duration-500">
              <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <Heart className="text-white h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Compassionate Adoption</h3>
              <p className="text-slate-600">Find pets from verified shelters. Our platform ensures a safe and loving transition for every animal.</p>
            </div>

            <div className="card group hover:bg-slate-50 border-none shadow-none hover:shadow-2xl transition-all duration-500">
              <div className="w-16 h-16 bg-secondary-500 rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <Package className="text-white h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Curated Pet Shop</h3>
              <p className="text-slate-600">From organic food to luxury toys, everything we sell is vet-approved and tested for safety and fun.</p>
            </div>

            <div className="card group hover:bg-slate-50 border-none shadow-none hover:shadow-2xl transition-all duration-500">
              <div className="w-16 h-16 bg-secondary-500 rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <Calendar className="text-white h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Expert Care Services</h3>
              <p className="text-slate-600">Book grooming, veterinary appointments, and training sessions with highly rated local professionals.</p>
            </div>
          </div>
        </div>
      </section>

      {/* === BECOME A SELLER BANNER === */}
      <section className="py-20 relative z-10 overflow-hidden">
        <div className="container-custom">
          <div className="relative rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-slate-900 via-amber-950 to-slate-900 p-10 lg:p-16 shadow-2xl">
            {/* Ambient blobs */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <div className="absolute bottom-0 left-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
              {/* Left: Icon badge */}
              <div className="shrink-0">
                <div className="w-20 h-20 rounded-3xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center shadow-xl shadow-amber-900/30">
                  <Store className="h-10 w-10 text-amber-400" />
                </div>
              </div>

              {/* Center: Text */}
              <div className="flex-1 text-center lg:text-left">
                <p className="text-amber-400 text-xs font-black uppercase tracking-[0.4em] mb-2">For Pet Owners & Breeders</p>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">
                  Ready to Sell Your Pets & Products?
                </h2>
                <p className="text-slate-400 text-base leading-relaxed max-w-xl">
                  Join hundreds of trusted sellers on Pawzzle. List your pets, products, and services — reach thousands of pet lovers and grow your business.
                </p>

                {/* Benefits row */}
                <div className="flex flex-wrap gap-x-8 gap-y-3 mt-5 justify-center lg:justify-start">
                  {[
                    { icon: TrendingUp, text: 'Grow your reach' },
                    { icon: Users,     text: 'Trusted community' },
                    { icon: Package,   text: 'Easy store setup' },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-2 text-slate-300 text-sm font-semibold">
                      <div className="w-5 h-5 rounded-full bg-amber-400/20 flex items-center justify-center">
                        <Icon className="h-3 w-3 text-amber-400" />
                      </div>
                      {text}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: CTA */}
              <div className="shrink-0">
                <Link
                  to={isAuthenticated ? '/account-upgrade' : '/register?seller=true'}
                  className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-white font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-amber-900/40 hover:from-amber-500 hover:to-amber-600 transition-all duration-300 hover:scale-105 active:scale-95 whitespace-nowrap"
                >
                  <Store className="h-4.5 w-4.5" />
                  Be a Seller — It's Free
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <p className="text-slate-500 text-xs mt-3 text-center">No monthly fees. Apply in minutes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Pets Grid */}
      <section ref={sectionRef} className="py-24 relative z-10">
        <div className="container-custom">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-4">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-100 rounded-full">
                <Heart className="h-3 w-3 text-primary-600" />
                <span className="text-[10px] font-black text-primary-700 uppercase tracking-widest">Global Discovery</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-none uppercase">
                Featured <span className="text-gradient-shimmer italic">Companions</span>
              </h2>
              <p className="text-lg text-slate-500 max-w-xl font-medium">Our latest elite fleet of companions are ready to bring joy to your base.</p>
            </div>
            <Link to="/pets" className="group flex items-center gap-2 font-black text-[10px] uppercase tracking-[0.2em] text-primary-600 hover:text-primary-700 transition-all">
              View All Pets
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {pets.map((pet, index) => (
              <div 
                key={pet._id} 
                className={`group card-landing-premium flex flex-col relative overflow-hidden transition-all duration-700 hover:shadow-2xl hover:shadow-primary-200/50 hover:-translate-y-2 card-3d-hover ${revealPets ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} 
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                {/* 3D background accent */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[4rem] -translate-y-16 translate-x-16 group-hover:bg-primary-50 transition-colors duration-500" />
                
                <div className="relative h-64 overflow-hidden rounded-[2rem] z-10">
                  <img
                    src={pet.images?.[0] || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=1000&auto=format&fit=crop'}
                    alt={pet.name}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 group-hover:rotate-1"
                  />
                  <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <span className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-xl text-[10px] font-black uppercase tracking-widest text-primary-600 shadow-xl border border-white/20">LIVE</span>
                    <span className="px-3 py-1 bg-slate-900/90 backdrop-blur-md rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">VERIFIED</span>
                  </div>
                  
                  {/* Floating price tag on hover */}
                  <div className="absolute inset-x-4 bottom-4 glass-morphism rounded-2xl p-4 flex justify-between items-center opacity-0 group-hover:opacity-100 translate-y-10 group-hover:translate-y-0 transition-all duration-500">
                    <span className="text-white text-lg font-black tracking-tighter">₱{pet.price?.toLocaleString()}</span>
                    <Link to={`/pets/${pet._id}`} className="w-10 h-10 bg-white text-primary-600 rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-90 transition-transform">
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </div>
                </div>

                <div className="p-6 space-y-4 relative z-10 flex-1 flex flex-col">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">{pet.breed || 'Biological Unit'}</p>
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none group-hover:text-primary-600 transition-colors">{pet.name}</h3>
                    </div>
                    {pet.store && (
                      <Link to={`/stores/${pet.store._id}`} className="flex flex-col items-center gap-1 group/store text-center">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-slate-100 shadow-sm shrink-0 group-hover/store:border-primary-200 transition-colors">
                          {pet.store.logo ? (
                            <img src={getImageUrl(pet.store.logo)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Store className="h-4 w-4 text-primary-400 m-auto mt-2" />
                          )}
                        </div>
                        <span className="text-[7px] font-black uppercase text-slate-400 group-hover/store:text-primary-600 transition-colors max-w-[50px] truncate">
                          {pet.store.name}
                        </span>
                      </Link>
                    )}
                  </div>
                  
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-600">{pet.age} {pet.ageUnit?.[0]}</span>
                    <span className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-600">{pet.gender?.[0]}</span>
                  </div>

                  <Link 
                    to={`/pets/${pet._id}`} 
                    className="mt-auto px-6 py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest group-hover:bg-primary-600 transition-all hover:shadow-xl hover:shadow-primary-200 active:scale-95 text-center flex items-center justify-center gap-2"
                  >
                    Details <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative z-10">
        <div className="container-custom">
          <div className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-secondary-600 to-primary-700 rounded-[40px] p-12 lg:p-24 text-center text-white shadow-2xl">
            {/* CTA Background blobs */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary-400/20 rounded-full blur-3xl -ml-20 -mb-20"></div>

            <div className="relative z-10 max-w-3xl mx-auto space-y-8">
              <h2 className="text-4xl md:text-6xl font-black tracking-tight font-outfit">
                {isAuthenticated ? `Glad you're here, ${user?.firstName}!` : 'Start Your Journey Today'}
              </h2>
              <p className="text-xl text-primary-100 leading-relaxed font-medium">
                {isAuthenticated
                  ? 'Ready to make another addition to your family? Our community is here to support you in finding the perfect companion.'
                  : 'Join thousands of happy families who found their perfect match. Adoption is an act of love.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                {!isAuthenticated ? (
                  <>
                    <Link to="/register" className="btn bg-white text-primary-600 hover:bg-slate-50 px-12 py-5 text-xl shadow-2xl font-black uppercase tracking-widest">Create Account</Link>
                    <Link to="/pets" className="btn border-2 border-white/30 text-white hover:bg-white/10 px-12 py-5 text-xl font-black uppercase tracking-widest">Browse All Pets</Link>
                  </>
                ) : (
                  <>
                    <Link to="/home" className="btn bg-white text-primary-600 hover:bg-slate-50 px-12 py-5 text-xl shadow-2xl font-black uppercase tracking-widest transition-transform hover:scale-105">My Dashboard</Link>
                    <Link to="/pets" className="btn border-2 border-white/30 text-white hover:bg-white/10 px-12 py-5 text-xl font-black uppercase tracking-widest">Find A Pet</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-16 border-t border-slate-100 text-center space-y-4">
        <div className="flex justify-center items-center gap-2 opacity-60">
          <img src="/images/logo.png" alt="Pawzzle Logo" className="h-6 w-auto grayscale contrast-125" />
          <span className="text-sm font-black tracking-widest text-slate-400">PAWZZLE</span>
        </div>
        <p className="text-slate-400 text-xs font-medium">&copy; 2026 Pawzzle Platform. Made with love for animals.</p>
      </footer>
    </div>
  );
};

export default Landing;
