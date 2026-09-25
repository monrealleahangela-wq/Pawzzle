import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, Brain, Building, CalendarDays, CheckCircle2,
  ChevronRight, Dumbbell, Heart, Package, PawPrint, Scissors, Search,
  ShieldCheck, ShoppingBag, Sparkles, Stethoscope, ThumbsUp
} from 'lucide-react';
import { toast } from 'react-toastify';
import { publicService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { formatPeso } from '../../utils/paymentSummary';
import '../../styles/CustomerHome.css';

const EMPTY_DATA = {
  pets: [], products: [], services: [],
  stats: { stores: 0, pets: 0, experts: 0, products: 0, services: 0 }
};

const Counter = ({ target, label, icon: Icon }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    let timer;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => setCount(Number(target) || 0);

    if (reducedMotion || !('IntersectionObserver' in window)) {
      finish();
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      const total = Number(target) || 0;
      const steps = 24;
      let currentStep = 0;
      timer = window.setInterval(() => {
        currentStep += 1;
        setCount(Math.round(total * (currentStep / steps)));
        if (currentStep >= steps) window.clearInterval(timer);
      }, 24);
      observer.disconnect();
    }, { threshold: 0.25 });

    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      if (timer) window.clearInterval(timer);
    };
  }, [target]);

  return (
    <article ref={ref} className="customer-home-stat">
      <span><Icon aria-hidden="true" /></span>
      <div><strong>{count.toLocaleString()}</strong><small>{label}</small></div>
    </article>
  );
};

const SectionHeading = ({ eyebrow, title, description, to, linkLabel }) => (
  <header className="customer-home-section-heading">
    <div>
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      {description && <span>{description}</span>}
    </div>
    {to && <Link to={to}>{linkLabel} <ArrowRight aria-hidden="true" /></Link>}
  </header>
);

const Home = () => {
  const { isAuthenticated } = useAuth();
  const { addToCart } = useCart();
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await publicService.getLandingData();
        setData({ ...EMPTY_DATA, ...response.data, stats: { ...EMPTY_DATA.stats, ...response.data?.stats } });
      } catch (error) {
        console.error('Customer Home data error:', error);
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
      <div className="customer-home-loading" role="status">
        <span aria-hidden="true" />
        <p>Loading the latest updates</p>
      </div>
    );
  }

  const stats = [
    { label: 'Active products', value: data.stats.products, icon: Package },
    { label: 'Professionals', value: data.stats.experts, icon: ShieldCheck },
    { label: 'Bookable services', value: data.stats.services, icon: Sparkles },
    { label: 'Active stores', value: data.stats.stores, icon: Building }
  ];

  const categories = [
    { to: '/pets', className: 'is-pets', image: '/images/hero-premium.png', icon: Heart, eyebrow: 'Find a companion', title: 'Available pets', text: 'Browse current pet listings and their available details.', action: 'Browse pets' },
    { to: '/products', className: 'is-products', image: '/images/landing_hero.png', icon: ShoppingBag, eyebrow: 'Everyday essentials', title: 'Pet products', text: 'Shop active products from Pawzzle stores.', action: 'Shop products' },
    { to: '/services', className: 'is-services', image: '/images/hero_pet_garden.png', icon: CalendarDays, eyebrow: 'Care made easier', title: 'Pet services', text: 'Review and book available professional care.', action: 'Book services' }
  ];

  const serviceTypes = [
    { icon: Stethoscope, label: 'Medical', title: 'Veterinary care', image: '/images/landing_hero.png' },
    { icon: Scissors, label: 'Grooming', title: 'Grooming services', image: '/images/hero-premium.png' },
    { icon: Dumbbell, label: 'Training', title: 'Behavioral training', image: '/images/hero_pet_garden.png' }
  ];

  return (
    <div className="customer-home">
      <section className="customer-home-hero">
        <div className="customer-home-hero-copy">
          <p className="customer-home-eyebrow"><PawPrint aria-hidden="true" /> Your Pawzzle home</p>
          <h1>Everything for their next <em>good day.</em></h1>
          <p className="customer-home-hero-text">Find companions, shop essentials, and arrange pet care from one practical, connected place.</p>
          <div className="customer-home-hero-actions">
            <label className="customer-home-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Search pets, products, or services</span>
              <input type="text" placeholder="Search pets, products, or services" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            </label>
            <Link to="/pets" className="customer-home-primary-action">Explore pets <ChevronRight aria-hidden="true" /></Link>
          </div>
        </div>
        <figure className="customer-home-hero-image">
          <img src="/images/hero-premium.png" alt="A dog and cat relaxing together at home" />
          <figcaption><CheckCircle2 aria-hidden="true" /><span><strong>One connected place</strong><small>Pets · Products · Care</small></span></figcaption>
        </figure>
      </section>

      <section className="customer-home-stats" aria-label="Live Pawzzle statistics">
        {stats.map((stat) => <Counter key={stat.label} target={stat.value || 0} label={stat.label} icon={stat.icon} />)}
      </section>

      <section className="customer-home-section">
        <SectionHeading eyebrow="Explore Pawzzle" title="What do you need today?" description="The main parts of your pet journey, kept close at hand." />
        <div className="customer-home-category-grid">
          {categories.map(({ to, className, image, icon: Icon, eyebrow, title, text, action }) => (
            <Link key={to} to={to} className={`customer-home-category ${className}`}>
              <img src={image} alt="" aria-hidden="true" />
              <span className="customer-home-category-overlay" aria-hidden="true" />
              <span className="customer-home-category-content">
                <span className="customer-home-category-icon"><Icon /></span>
                <small>{eyebrow}</small><strong>{title}</strong><span>{text}</span>
                <b>{action} <ArrowRight /></b>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {data.pets.length > 0 && (
        <section className="customer-home-section">
          <SectionHeading eyebrow="Available companions" title="Meet pets looking for a home." description="Current pet listings available through Pawzzle stores." to="/pets" linkLabel="View all pets" />
          <div className="customer-home-listing-grid responsive-card-grid [--card-min:13rem] [--card-gap:0.75rem]">
            {data.pets.map((pet) => (
              <article key={pet._id} className="customer-home-listing-card">
                <Link to={`/pets/${pet._id}`} className="customer-home-listing-image">
                  {pet.images?.[0] ? <img src={getImageUrl(pet.images[0])} alt={pet.name || 'Available pet'} loading="lazy" /> : <span><Heart aria-hidden="true" /></span>}
                  <small>Available</small>
                </Link>
                <div className="customer-home-listing-copy">
                  <p>{[pet.breed, pet.gender].filter(Boolean).join(' · ') || 'Pet listing'}</p>
                  <h3>{pet.name}</h3>
                  <div><strong>{formatPeso(pet.price)}</strong><Link to={`/pets/${pet._id}`} aria-label={`View ${pet.name}`}><ChevronRight /></Link></div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {data.products.length > 0 && (
        <section className="customer-home-section customer-home-products-section">
          <SectionHeading eyebrow="Pet essentials" title="Useful picks from active stores." description="Browse current products and add an item directly to your cart." to="/products" linkLabel="View all products" />
          <div className="customer-home-product-grid responsive-card-grid [--card-min:13rem] [--card-gap:0.75rem]">
            {data.products.map((product) => (
              <article key={product._id} className="customer-home-product-card">
                <div className="customer-home-product-image">
                  <Link to={`/products/${product._id}`}>
                    {product.images?.[0] ? <img src={getImageUrl(product.images[0])} alt={product.name || 'Pet product'} loading="lazy" /> : <span><Package aria-hidden="true" /></span>}
                  </Link>
                  <button type="button" onClick={() => handleAddToCart(product)} aria-label={`Add ${product.name} to cart`} title={`Add ${product.name} to cart`}><ShoppingBag /></button>
                </div>
                <div className="customer-home-product-copy">
                  <p>{product.category || 'Pet product'}</p>
                  <Link to={`/products/${product._id}`}><h3>{product.name}</h3></Link>
                  <div><strong>{formatPeso(product.price)}</strong><small>{product.stockQuantity > 5 ? 'In stock' : 'Low stock'}</small></div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="customer-home-trust">
        <div className="customer-home-trust-copy">
          <p className="customer-home-eyebrow"><ShieldCheck aria-hidden="true" /> Connected with care</p>
          <h2>Useful tools for everyday pet decisions.</h2>
          <p>Shop, book, compare, and keep up with pet activity through one customer account.</p>
          <div className="customer-home-trust-list">
            {[
              { icon: ShieldCheck, title: 'Secure checkout', text: 'Online payments use Pawzzle’s existing PayMongo flow.' },
              { icon: Brain, title: 'Pet matching support', text: 'Explainable recommendations use your preferences and available listings.' },
              { icon: Activity, title: 'Care activity', text: 'Bookings and service updates stay connected to your account.' },
              { icon: ThumbsUp, title: 'Store visibility', text: 'Customer discovery uses active, eligible Pawzzle stores.' }
            ].map(({ icon: Icon, title, text }) => (
              <article key={title}><span><Icon /></span><div><h3>{title}</h3><p>{text}</p></div></article>
            ))}
          </div>
        </div>
        <figure className="customer-home-trust-image">
          <img src="/images/landing_hero.png" alt="Pet owner enjoying time at home with a cat" />
          <figcaption><PawPrint aria-hidden="true" /><span><strong>One customer account</strong><small>Shop · Book · Follow updates</small></span></figcaption>
        </figure>
      </section>

      <section className="customer-home-section">
        <SectionHeading eyebrow="Professional pet care" title="Find the right kind of service." description="Browse Pawzzle’s active service catalog for availability and booking details." to="/services" linkLabel="View all services" />
        <div className="customer-home-service-grid">
          {serviceTypes.map(({ icon: Icon, label, title, image }) => (
            <Link to="/services" key={title} className="customer-home-service-card">
              <img src={image} alt="" aria-hidden="true" />
              <span className="customer-home-service-overlay" aria-hidden="true" />
              <span className="customer-home-service-copy"><small><Icon /> {label}</small><strong>{title}</strong><b>Browse services <ArrowRight /></b></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="customer-home-cta">
        <span className="customer-home-cta-mark" aria-hidden="true"><PawPrint /></span>
        <div><p>Keep their world close</p><h2>Your Pawzzle activity, all in one place.</h2><span>Discover pets, products, services, and account updates without losing track of what matters.</span></div>
        <div className="customer-home-cta-actions">
          {!isAuthenticated ? (
            <><Link to="/register">Create account <ArrowRight /></Link><Link to="/login">Sign in</Link></>
          ) : (
            <Link to="/pets">Browse catalog <ArrowRight /></Link>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
