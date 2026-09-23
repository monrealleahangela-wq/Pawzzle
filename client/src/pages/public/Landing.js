import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CalendarDays, Check, Heart, MapPin, Menu, MessageCircle,
  Package, PawPrint, Search, ShieldCheck, ShoppingBag, Store, Users, X
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

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

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
      id: service._id, title: service.name,
      meta: [service.category?.replace(/_/g, ' '), service.duration ? `${service.duration} min` : null].filter(Boolean).join(' · '),
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
  const activeItems = catalogItems[activeCatalog];
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="landing-page">
      <header className={`landing-header ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand" aria-label="Pawzzle home">
            <span className="landing-brand-mark"><img src="/images/logo.png" alt="" /></span>
            <span>Pawzzle</span>
          </Link>

          <nav className="landing-desktop-nav" aria-label="Primary navigation">
            <a href="#explore">Explore</a>
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <Link to="/seller-join">For stores</Link>
          </nav>

          <div className="landing-header-actions">
            <Link to="/login" className="landing-sign-in">Sign in</Link>
            <Link to="/register" className="landing-button landing-button-small">Create account</Link>
          </div>

          <button className="landing-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle navigation" aria-expanded={mobileMenuOpen} aria-controls="landing-mobile-menu">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav id="landing-mobile-menu" className="landing-mobile-nav" aria-label="Mobile navigation">
            <a href="#explore" onClick={closeMobileMenu}>Explore</a>
            <a href="#features" onClick={closeMobileMenu}>Features</a>
            <a href="#how-it-works" onClick={closeMobileMenu}>How it works</a>
            <Link to="/seller-join" onClick={closeMobileMenu}>For stores</Link>
            <div className="landing-mobile-actions">
              <Link to="/login" onClick={closeMobileMenu}>Sign in</Link>
              <Link to="/register" onClick={closeMobileMenu}>Create account</Link>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
          <div className="landing-shell landing-hero-grid">
            <div className="landing-hero-copy landing-reveal">
              <p className="landing-kicker"><PawPrint aria-hidden="true" /> Pet commerce and care, thoughtfully connected</p>
              <h1>Everything your pet journey needs, <em>in one place.</em></h1>
              <p className="landing-hero-intro">
                Discover listed pets, shop trusted essentials, find nearby stores, and book available care services through one organized platform.
              </p>

              <form onSubmit={handleSearch} className="landing-search" role="search">
                <Search aria-hidden="true" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Search Pawzzle" placeholder="Search pets, products, or stores" />
                <button type="submit">Search <ArrowRight aria-hidden="true" /></button>
              </form>

              <div className="landing-hero-links" aria-label="Explore Pawzzle">
                <Link to="/pets"><Heart aria-hidden="true" /> Browse pets</Link>
                <Link to="/products"><Package aria-hidden="true" /> Shop products</Link>
                <Link to="/services"><CalendarDays aria-hidden="true" /> Book services</Link>
              </div>
            </div>

            <div className="landing-hero-art landing-reveal landing-delay">
              <figure className="landing-hero-photo landing-hero-photo-main">
                <img src="/images/landing_hero.png" alt="Pet owner spending time with a companion cat" />
              </figure>
              <figure className="landing-hero-photo landing-hero-photo-secondary" aria-hidden="true">
                <img src="/images/hero-premium.png" alt="" />
              </figure>
              <div className="landing-hero-note">
                <span className="landing-note-icon"><Check aria-hidden="true" /></span>
                <span><strong>One connected experience</strong><small>Discover · Shop · Book · Track</small></span>
              </div>
              <span className="landing-scribble" aria-hidden="true"><PawPrint /></span>
            </div>
          </div>
        </section>

        <section className="landing-stats" aria-label="Live platform statistics">
          <div className="landing-shell landing-stats-grid">
            <article className="landing-stat-intro">
              <span>Live from Pawzzle</span>
              <h2>A growing community, built around better pet care.</h2>
            </article>
            {stats.map(({ label, value, icon: Icon }) => (
              <article key={label} className="landing-stat-card">
                <Icon aria-hidden="true" />
                <strong><CountUp value={value} /></strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="landing-section landing-features-section">
          <div className="landing-shell">
            <div className="landing-section-heading landing-section-heading-split">
              <div>
                <p className="landing-eyebrow">One connected experience</p>
                <h2>Made for the everyday rhythm of pet life.</h2>
              </div>
              <p>Move from discovery to purchase, booking, communication, and tracking without juggling separate systems.</p>
            </div>

            <div className="landing-feature-bento">
              <Link to="/pets" className="landing-feature-card landing-feature-pets">
                <img src="/images/hero-premium.png" alt="A dog and cat relaxing together at home" />
                <span className="landing-feature-shade" aria-hidden="true" />
                <span className="landing-feature-content">
                  <span className="landing-feature-icon"><Heart /></span>
                  <small>Find a companion</small>
                  <strong>Pet listings</strong>
                  <span>Browse available pets with listing, health, fulfillment, and payment details.</span>
                  <b>Explore pets <ArrowRight /></b>
                </span>
              </Link>

              <Link to="/products" className="landing-feature-card landing-feature-products">
                <span className="landing-feature-icon"><ShoppingBag /></span>
                <small>Everyday essentials</small>
                <strong>Pet marketplace</strong>
                <span>Explore active products from Pawzzle stores and manage orders through your account.</span>
                <b>Shop products <ArrowRight /></b>
                <Package className="landing-feature-watermark" aria-hidden="true" />
              </Link>

              <Link to="/services" className="landing-feature-card landing-feature-services">
                <span className="landing-feature-icon"><CalendarDays /></span>
                <small>Care when you need it</small>
                <strong>Service booking</strong>
                <span>Review active pet-care services and organize appointments from one calendar.</span>
                <b>Book services <ArrowRight /></b>
              </Link>

              <Link to="/login" className="landing-feature-card landing-feature-support">
                <span className="landing-feature-icon"><MessageCircle /></span>
                <span><small>Stay in the loop</small><strong>Connected support</strong></span>
                <span>Keep messages, order updates, and delivery tracking together where available.</span>
                <b>Sign in <ArrowRight /></b>
              </Link>
            </div>
          </div>
        </section>

        <section id="explore" className="landing-section landing-explore-section">
          <div className="landing-shell">
            <div className="landing-explore-header">
              <div>
                <p className="landing-eyebrow">Curated from the live catalog</p>
                <h2>See what’s waiting on Pawzzle.</h2>
              </div>
              <div className="landing-catalog-tabs" role="tablist" aria-label="Catalog type">
                {catalogTabs.map(({ key, label, count, icon: Icon }) => (
                  <button key={key} onClick={() => setActiveCatalog(key)} role="tab" aria-selected={activeCatalog === key} className={activeCatalog === key ? 'is-active' : ''}>
                    <Icon aria-hidden="true" /> <span>{label}</span> <small>{count}</small>
                  </button>
                ))}
              </div>
            </div>

            {activeItems.length > 0 ? (
              <div className={`landing-catalog-bento landing-catalog-count-${Math.min(activeItems.length, 4)}`}>
                {activeItems.map((item, index) => (
                  <Link key={item.id} to={item.to} className={`landing-catalog-card ${index === 0 ? 'is-featured' : ''}`}>
                    <div className="landing-catalog-image">
                      {item.image
                        ? <img src={getImageUrl(item.image)} alt={item.title} />
                        : <div className="landing-image-fallback"><img src="/images/logo.png" alt="" /></div>}
                    </div>
                    <div className="landing-catalog-copy">
                      <div><small>{item.meta || 'Available on Pawzzle'}</small><h3>{item.title}</h3></div>
                      <div className="landing-catalog-price">
                        {item.price && <strong>{item.price}</strong>}
                        <span aria-hidden="true"><ArrowRight /></span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="landing-empty-state">
                <PawPrint aria-hidden="true" />
                <h3>No active {activeCatalog} are listed right now.</h3>
                <p>Check back as stores update their catalogs.</p>
              </div>
            )}

            <div className="landing-view-all">
              <Link to={activeTab.route}>View all {activeTab.label.toLowerCase()} <ArrowRight aria-hidden="true" /></Link>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-section landing-how-section">
          <div className="landing-shell landing-how-grid">
            <figure className="landing-how-image">
              <img src="/images/hero_pet_garden.png" alt="Dog and cat enjoying time together near a pet-friendly store" />
              <figcaption><MapPin aria-hidden="true" /> From local discovery to everyday care</figcaption>
            </figure>

            <div className="landing-how-copy">
              <p className="landing-eyebrow">Simple by design</p>
              <h2>From first search to ongoing care.</h2>
              <p>Pawzzle keeps discovery, transactions, bookings, messages, and account activity organized in one place.</p>
              <ol>
                {[
                  ['01', 'Discover', 'Search active pets, products, services, and stores.'],
                  ['02', 'Choose', 'Review listing information, availability, and pricing.'],
                  ['03', 'Manage', 'Track orders, bookings, messages, and updates in your account.']
                ].map(([number, title, text]) => (
                  <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="landing-cta-section">
          <div className="landing-shell">
            <div className="landing-cta-card">
              <div className="landing-cta-paw" aria-hidden="true"><PawPrint /></div>
              <div>
                <p className="landing-eyebrow">A better-connected pet life</p>
                <h2>Ready to make Pawzzle part of your routine?</h2>
                <p>Create an account to manage your pet marketplace activity, or apply to bring your store onto Pawzzle.</p>
              </div>
              <div className="landing-cta-actions">
                <Link to="/register" className="landing-button landing-button-light">Create account <ArrowRight /></Link>
                <Link to="/seller-join" className="landing-button landing-button-outline-light">Join as a store</Link>
              </div>
              <ShieldCheck className="landing-cta-shield" aria-hidden="true" />
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer-grid">
          <div>
            <Link to="/" className="landing-brand" aria-label="Pawzzle home"><span className="landing-brand-mark"><img src="/images/logo.png" alt="" /></span><span>Pawzzle</span></Link>
            <p>Pet marketplace, store discovery, service booking, and account management—all thoughtfully connected.</p>
          </div>
          <nav aria-label="Footer navigation">
            <span>Explore</span><Link to="/pets">Pets</Link><Link to="/products">Products</Link><Link to="/services">Services</Link>
          </nav>
          <nav aria-label="Account navigation">
            <span>Join Pawzzle</span><Link to="/login">Sign in</Link><Link to="/register">Create account</Link><Link to="/seller-join">For stores</Link>
          </nav>
          <div className="landing-footer-note"><PawPrint aria-hidden="true" /><span>Made for pets, their people, and the stores that care for them.</span></div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
