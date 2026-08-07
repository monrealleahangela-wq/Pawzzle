import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CalendarDays, Check, Heart, MapPin, Menu, MessageCircle,
  Package, Search, ShieldCheck, ShoppingBag, Store, Users, X
} from 'lucide-react';
import { publicService, getImageUrl } from '../../services/apiService';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import '../../styles/Landing.css';

const EMPTY_DATA = {
  pets: [], products: [], services: [], experts: [],
  stats: { stores: 0, pets: 0, experts: 0, products: 0, services: 0 }
};

const formatPrice = (value) =>
  Number.isFinite(Number(value))
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)
    : null;

const CountUp = ({ value }) => {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(target);
      return undefined;
    }
    const started = performance.now();
    const duration = 650;
    let frame;
    const tick = (now) => {
      const progress = Math.min((now - started) / duration, 1);
      setDisplay(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return display.toLocaleString();
};

const Landing = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCatalog, setActiveCatalog] = useState('pets');

  const fetchLandingData = useCallback(async () => {
    try {
      const response = await publicService.getLandingData();
      setData({ ...EMPTY_DATA, ...response.data, stats: { ...EMPTY_DATA.stats, ...response.data?.stats } });
    } catch (error) {
      console.error('Landing fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLandingData();
    const handleScroll = () => setIsScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchLandingData]);

  const handleSearch = (event) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const catalogItems = useMemo(() => ({
    pets: data.pets.slice(0, 4).map((pet) => ({
      id: pet._id, title: pet.name, meta: [pet.breed, pet.gender].filter(Boolean).join(' · '),
      price: formatPrice(pet.price), image: pet.images?.[0], to: `/pets/${pet._id}`
    })),
    products: data.products.slice(0, 4).map((product) => ({
      id: product._id, title: product.name, meta: product.category, price: formatPrice(product.price),
      image: product.images?.[0], to: `/products/${product._id}`
    })),
    services: data.services.slice(0, 4).map((service) => ({
      id: service._id, title: service.name, meta: [service.category?.replace(/_/g, ' '), service.duration ? `${service.duration} min` : null].filter(Boolean).join(' · '),
      price: formatPrice(service.price), image: service.images?.[0], to: '/services'
    }))
  }), [data]);

  if (loading) return <PageLoader message="Loading Pawzzle" />;

  const stats = [
    { label: 'Active stores', value: data.stats.stores, icon: Store },
    { label: 'Available pets', value: data.stats.pets, icon: Heart },
    { label: 'Active products', value: data.stats.products, icon: Package },
    { label: 'Bookable services', value: data.stats.services, icon: CalendarDays },
    { label: 'Active professionals', value: data.stats.experts, icon: Users }
  ];

  const catalogTabs = [
    { key: 'pets', label: 'Pets', count: data.stats.pets, icon: Heart, route: '/pets' },
    { key: 'products', label: 'Products', count: data.stats.products, icon: ShoppingBag, route: '/products' },
    { key: 'services', label: 'Services', count: data.stats.services, icon: CalendarDays, route: '/services' }
  ];
  const activeTab = catalogTabs.find((tab) => tab.key === activeCatalog);

  return (
    <div className="landing-page min-h-screen bg-white text-slate-900 selection:bg-primary-100">
      <header className={`fixed inset-x-0 top-0 z-[100] transition-all duration-300 ${isScrolled ? 'bg-white/95 shadow-sm border-b border-slate-100 backdrop-blur-xl' : 'bg-white/80 backdrop-blur-md'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Pawzzle home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 p-1.5 shadow-sm">
              <img src="/images/logo.png" alt="" className="h-full w-full object-contain brightness-0 invert" />
            </span>
            <span className="text-base font-black uppercase tracking-tight">Pawzzle</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary navigation">
            <a href="#explore" className="landing-nav-link">Explore</a>
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#how-it-works" className="landing-nav-link">How it works</a>
            <Link to="/seller-join" className="landing-nav-link">For stores</Link>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link to="/login" className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-primary-700">Sign in</Link>
            <Link to="/register" className="rounded-lg bg-primary-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700">Create account</Link>
          </div>

          <button className="rounded-lg p-2 text-slate-600 md:hidden" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle navigation" aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav className="border-t border-slate-100 bg-white px-4 py-3 md:hidden" aria-label="Mobile navigation">
            <div className="mx-auto grid max-w-7xl gap-1">
              {[['Explore', '#explore'], ['Features', '#features'], ['How it works', '#how-it-works']].map(([label, href]) => (
                <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">{label}</a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <Link to="/login" className="rounded-lg border border-slate-200 px-3 py-2.5 text-center text-xs font-bold">Sign in</Link>
                <Link to="/register" className="rounded-lg bg-primary-600 px-3 py-2.5 text-center text-xs font-bold text-white">Create account</Link>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-100 bg-[#fdfaf8] pt-24 pb-12 sm:pt-28 sm:pb-16">
          <div className="landing-grid-bg absolute inset-0 opacity-50" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
            <div className="max-w-xl landing-reveal">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary-700">
                <MapPin className="h-3.5 w-3.5" /> Pet commerce and care in one place
              </div>
              <h1 className="max-w-xl text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
                Everything your pet journey needs, connected.
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-slate-600 sm:text-base">
                Discover listed pets, shop pet essentials, find stores, and book available care services through one organized platform.
              </p>

              <form onSubmit={handleSearch} className="mt-6 flex max-w-lg items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-primary-300 focus-within:ring-4 focus-within:ring-primary-50">
                <Search className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search pets, products, or stores" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-400" />
                <button type="submit" className="flex h-9 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-xs font-bold text-white transition hover:bg-primary-700">
                  Search <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </form>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/pets" className="landing-quick-link"><Heart className="h-3.5 w-3.5" /> Browse pets</Link>
                <Link to="/products" className="landing-quick-link"><Package className="h-3.5 w-3.5" /> Shop products</Link>
                <Link to="/services" className="landing-quick-link"><CalendarDays className="h-3.5 w-3.5" /> Book services</Link>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg landing-reveal landing-delay">
              <div className="overflow-hidden rounded-2xl border border-white bg-slate-100 shadow-xl shadow-primary-950/10">
                <img src="/images/landing_hero.png" alt="Pet owner spending time with a companion animal" className="h-[300px] w-full object-cover sm:h-[380px]" />
              </div>
              <div className="absolute -bottom-4 left-4 right-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-100 bg-white/95 p-3 shadow-lg backdrop-blur sm:left-auto sm:right-4 sm:w-64">
                <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Live catalog</p><p className="mt-1 text-sm font-black text-slate-900">Database powered</p></div>
                <div className="flex items-center justify-end"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Check className="h-4 w-4" /></span></div>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Live platform statistics" className="border-b border-slate-100 bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-slate-100 px-4 sm:px-6 md:grid-cols-5 md:divide-y-0 lg:px-8">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 px-3 py-5 sm:px-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><Icon className="h-4 w-4" /></span>
                <div><p className="text-xl font-black tabular-nums text-slate-950"><CountUp value={value} /></p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-7 max-w-2xl">
              <p className="landing-eyebrow">One connected experience</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Built for everyday pet needs</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Move from discovery to purchase, booking, and communication without juggling separate systems.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Heart, title: 'Pet listings', text: 'Browse available pets with listing, health, fulfillment, and payment details.', to: '/pets' },
                { icon: ShoppingBag, title: 'Pet marketplace', text: 'Explore active products from stores and manage orders through your account.', to: '/products' },
                { icon: CalendarDays, title: 'Service booking', text: 'Review active care services and organize appointments from one calendar.', to: '/services' },
                { icon: MessageCircle, title: 'Connected support', text: 'Use platform messaging, order updates, and delivery tracking where available.', to: '/login' }
              ].map(({ icon: Icon, title, text, to }) => (
                <Link key={title} to={to} className="group rounded-xl border border-slate-200 bg-white p-5 transition duration-300 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-950/5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-primary-700 transition group-hover:bg-primary-600 group-hover:text-white"><Icon className="h-4 w-4" /></span>
                  <h3 className="mt-4 text-base font-black text-slate-900">{title}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-primary-700">Explore <ArrowRight className="h-3 w-3 transition group-hover:translate-x-1" /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="explore" className="border-y border-slate-100 bg-slate-50/60 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="landing-eyebrow">Live from Pawzzle</p><h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Explore current listings</h2></div>
              <div className="flex w-full gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:w-auto" role="tablist" aria-label="Catalog type">
                {catalogTabs.map(({ key, label, count, icon: Icon }) => (
                  <button key={key} onClick={() => setActiveCatalog(key)} role="tab" aria-selected={activeCatalog === key} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition sm:flex-none ${activeCatalog === key ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Icon className="h-3.5 w-3.5" /> {label} <span className="opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {catalogItems[activeCatalog].length > 0 ? (
              <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {catalogItems[activeCatalog].map((item) => (
                  <Link key={item.id} to={item.to} className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-primary-200 hover:shadow-md">
                    <div className="aspect-[4/3] overflow-hidden bg-primary-50">
                      {item.image ? <img src={getImageUrl(item.image)} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><img src="/images/logo.png" alt="" className="h-12 w-12 object-contain opacity-20" /></div>}
                    </div>
                    <div className="p-3.5">
                      <h3 className="truncate text-sm font-black text-slate-900">{item.title}</h3>
                      <p className="mt-1 truncate text-[10px] capitalize text-slate-400">{item.meta || 'Available on Pawzzle'}</p>
                      {item.price && <p className="mt-2 text-xs font-black text-primary-700">{item.price}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-7 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
                <p className="text-sm font-bold text-slate-600">No active {activeCatalog} are listed right now.</p>
                <p className="mt-1 text-xs text-slate-400">Check back as stores update their catalogs.</p>
              </div>
            )}

            <div className="mt-6 text-center"><Link to={activeTab.route} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-primary-300 hover:text-primary-700">View all {activeTab.label.toLowerCase()} <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          </div>
        </section>

        <section id="how-it-works" className="py-12 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8">
            <div><p className="landing-eyebrow">Simple by design</p><h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">From search to care in three steps</h2><p className="mt-3 max-w-md text-sm leading-6 text-slate-500">Pawzzle keeps discovery, transactions, bookings, and account activity organized in one place.</p></div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ['01', 'Discover', 'Search active pets, products, services, and stores.'],
                ['02', 'Choose', 'Review listing information, availability, and pricing.'],
                ['03', 'Manage', 'Track orders, bookings, messages, and updates in your account.']
              ].map(([number, title, text]) => (
                <li key={number} className="rounded-xl border border-slate-200 p-5"><span className="text-[10px] font-black tracking-widest text-primary-600">{number}</span><h3 className="mt-3 text-base font-black">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-slate-900 px-5 py-8 text-white sm:px-8 sm:py-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl"><div className="mb-2 flex items-center gap-2 text-primary-300"><ShieldCheck className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">Join the platform</span></div><h2 className="text-2xl font-black tracking-tight">Ready to get started?</h2><p className="mt-2 text-sm leading-6 text-slate-300">Create an account to manage your pet marketplace activity, or apply to bring your store onto Pawzzle.</p></div>
              <div className="flex flex-col gap-2 sm:flex-row"><Link to="/register" className="rounded-lg bg-primary-600 px-4 py-2.5 text-center text-xs font-bold text-white transition hover:bg-primary-500">Create account</Link><Link to="/seller-join" className="rounded-lg border border-white/15 px-4 py-2.5 text-center text-xs font-bold transition hover:bg-white/10">Join as a store</Link></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-center sm:px-6 md:flex-row md:items-center md:justify-between md:text-left lg:px-8">
          <div className="flex items-center justify-center gap-2 md:justify-start"><img src="/images/logo.png" alt="" className="h-7 w-7 object-contain" /><span className="text-xs font-black uppercase tracking-wider">Pawzzle</span></div>
          <p className="text-[10px] text-slate-400">Pet marketplace, store discovery, service booking, and account management.</p>
          <div className="flex justify-center gap-4 text-[10px] font-bold text-slate-500"><Link to="/pets" className="hover:text-primary-700">Pets</Link><Link to="/products" className="hover:text-primary-700">Products</Link><Link to="/services" className="hover:text-primary-700">Services</Link></div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
