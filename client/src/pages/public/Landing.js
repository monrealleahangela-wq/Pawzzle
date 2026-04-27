import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Package, Calendar, ArrowRight, LogIn, Sparkles, Users, TrendingUp, Star, Store } from 'lucide-react';
import { petService, productService, serviceService } from '../../services/apiService';
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
    return <PageLoader message="Getting everything ready for you..." />;
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
          <div className="flex items-center gap-6">
            <Link to="/seller-join" className="hidden md:flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary-600 hover:text-primary-700 transition-colors">
              <Store className="h-4 w-4" />
              Be a Seller
            </Link>
            {!isAuthenticated ? (
              <>
                <Link to="/login" className="text-sm font-black uppercase tracking-widest text-slate-600 hover:text-primary-600 transition-colors">Sign In</Link>
                <Link to="/register" className="btn btn-primary px-6 py-2.5 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-primary-100">Join</Link>
              </>
            ) : (
              <Link to="/home" className="btn btn-primary px-6 py-2.5 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-primary-100">Dashboard</Link>
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
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <div className="space-y-10 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 border border-primary-100 rounded-full animate-fade-in shadow-sm">
                <Sparkles className="h-4 w-4 text-primary-600 animate-pulse" />
                <span className="text-xs font-black text-primary-700 uppercase tracking-widest">Pet Care Made Simple</span>
              </div>

              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-slate-900 leading-[1.05] animate-slide-up">
                Find Your New
                <span className="block italic text-transparent bg-clip-text bg-gradient-to-r from-primary-600 via-secondary-600 to-primary-600">Best Friend</span>
              </h1>

              <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed animate-slide-up" style={{ animationDelay: '0.2s' }}>
                Connecting you with trusted sellers, pet supplies, and services. Everything your pet needs in one place.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start animate-slide-up" style={{ animationDelay: '0.4s' }}>
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
                <div className="flex gap-4">
                  <Link to="/pets" className="btn btn-outline flex-1 sm:flex-initial px-8 py-5 text-lg border-2 border-slate-200 hover:border-primary-600 bg-white/50 backdrop-blur-sm">
                    <Heart className="h-5 w-5 mr-1" />
                    Browse Pets
                  </Link>
                </div>
              </div>
            </div>

            {/* Hero Image */}
            <div className="relative animate-fade-in hidden lg:block" style={{ animationDelay: '0.6s' }}>
              <div className="relative z-10 rounded-[3rem] overflow-hidden shadow-2xl rotate-2 transition-transform hover:rotate-0 duration-700 group border-4 border-white">
                <img 
                  src="/images/landing_hero.png" 
                  alt="Happy Cat and Owner" 
                  className="w-full h-auto object-cover scale-105 group-hover:scale-100 transition-transform duration-700" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
              
              {/* Decorative elements */}
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-secondary-200 rounded-full blur-3xl opacity-60 animate-pulse"></div>
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary-200 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDelay: '-2s' }}></div>
              
              {/* Floating badges */}
              <div className="absolute -top-10 -left-10 float-animation z-20">
                <div className="p-4 glass-morphism rounded-3xl shadow-xl flex items-center gap-3 animate-slide-up" style={{ animationDelay: '1s' }}>
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center shadow-inner">
                    <Heart className="text-primary-600 h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800 tracking-tight">500+ New Homes</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Found this month</p>
                  </div>
                </div>
              </div>
              
              <div className="absolute -bottom-8 -right-8 float-animation z-20" style={{ animationDelay: '-3s' }}>
                <div className="p-4 glass-morphism rounded-3xl shadow-xl flex items-center gap-3 animate-slide-up" style={{ animationDelay: '1.2s' }}>
                  <div className="w-12 h-12 bg-secondary-100 rounded-full flex items-center justify-center shadow-inner">
                    <Star className="text-secondary-600 h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800 tracking-tight">Top Rated Care</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">By verified owners</p>
                  </div>
                </div>
              </div>
            </div>
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
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Live Pets</h3>
              <p className="text-slate-600">Browse verified listings of pets from trusted breeders and shelters. Safe inquiries and adoption protocols guaranteed.</p>
            </div>

            <div className="card group hover:bg-slate-50 border-none shadow-none hover:shadow-2xl transition-all duration-500">
              <div className="w-16 h-16 bg-secondary-500 rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <Package className="text-white h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Supply Chain</h3>
              <p className="text-slate-600">Access quality food, accessories, and health products. Our sellers provide essentials for every pet's needs.</p>
            </div>

            <div className="card group hover:bg-slate-50 border-none shadow-none hover:shadow-2xl transition-all duration-500">
              <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <Calendar className="text-white h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Modular Services</h3>
              <p className="text-slate-600">Grooming, veterinary, and training services. Book professional care tailored to your pet's lifestyle.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Pets Grid */}
      <section className="py-24 relative z-10">
        <div className="container-custom">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-4">
            <div className="space-y-4">
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Meet the New Arrivals</h2>
              <p className="text-lg text-slate-500 max-w-xl">Our latest pets are ready to bring joy to your home.</p>
            </div>
            <Link to="/pets" className="group flex items-center gap-2 font-bold text-primary-600 hover:text-primary-700">
              View All Pets
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {pets.map((pet, index) => (
              <div key={pet._id} className="card group p-0 hover:border-primary-200 transition-all duration-500 hover:shadow-primary-100 animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
                <div className="relative h-64 overflow-hidden rounded-t-[23px]">
                  <img
                    src={pet.images?.[0] || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=1000&auto=format&fit=crop'}
                    alt={pet.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute top-4 right-4"><span className="badge badge-success glass-morphism border-none">Available</span></div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-900">{pet.name}</h3>
                    <p className="text-lg font-black text-primary-600">₱{pet.price}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md">{pet.breed}</span>
                    <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md">{pet.age} {pet.ageUnit}</span>
                  </div>
                  <Link to={`/pets/${pet._id}`} className="btn btn-primary w-full py-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">Meet {pet.name}</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Business Section */}
      <section className="py-24 bg-slate-900 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/10 rounded-full blur-[120px] -mr-64 -mt-64"></div>
        <div className="container-custom relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                <Store className="h-4 w-4 text-primary-400" />
                <span className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em]">Business Solutions</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black text-white leading-none tracking-tighter">
                Scale Your <br />
                <span className="text-primary-500 italic">Pet Business</span>
              </h2>
              <p className="text-lg text-slate-400 max-w-xl leading-relaxed font-medium">
                Whether you sell live pets, supply chains, or professional services, our modular platform adapts to your operations.
              </p>
              <div className="space-y-4">
                {[
                  { title: 'Modular Architecture', desc: 'Activate Pets, Products, or Services modules as you grow.' },
                  { title: 'Operational Excellence', desc: 'Staff management and supplier integration built-in.' },
                  { title: 'Secured Payments', desc: 'Fast, automated payouts for your successful sales.' }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-6 h-6 rounded-full bg-primary-600/20 flex items-center justify-center shrink-0 mt-1">
                      <CheckCircle2 className="h-4 w-4 text-primary-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-tight">{item.title}</h4>
                      <p className="text-xs text-slate-500 font-medium">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/seller-join" className="inline-flex px-12 py-5 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm hover:bg-primary-500 transition-all shadow-2xl shadow-primary-900/20 active:scale-95">
                Join As Seller
              </Link>
            </div>
            <div className="relative group">
              <div className="absolute inset-0 bg-primary-600/30 rounded-[3rem] blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <div className="relative rounded-[3rem] border border-white/10 bg-white/5 p-8 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center gap-4 mb-8">
                   <div className="flex -space-x-4">
                      {[1,2,3,4].map(n => <div key={n} className="w-12 h-12 rounded-2xl border-4 border-slate-900 bg-slate-800" />)}
                   </div>
                   <div className="text-xs font-black text-white uppercase tracking-widest">+500 Happy Partners</div>
                </div>
                <div className="space-y-6">
                  <div className="h-32 bg-slate-800/50 rounded-2xl animate-pulse"></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-24 bg-slate-800/50 rounded-2xl animate-pulse"></div>
                    <div className="h-24 bg-slate-800/50 rounded-2xl animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
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
                  : 'Join thousands of happy families who found their perfect companion. Finding a pet is an act of love.'}
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
