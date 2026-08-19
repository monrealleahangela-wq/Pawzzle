import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building,
  Calendar,
  Heart,
  Package,
  PawPrint,
  Star,
  Store as StoreIcon,
  X
} from 'lucide-react';
import { getImageUrl } from '../../services/apiService';
import { formatPeso } from '../../utils/paymentSummary';

const favoriteTabs = [
  { id: 'pets', label: 'Pets', icon: PawPrint },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'services', label: 'Services', icon: Calendar },
  { id: 'stores', label: 'Stores', icon: StoreIcon }
];

const labelize = (value, fallback = 'Pet store') => value
  ? String(value).replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
  : fallback;

const storeName = item => item?.store?.name || 'Pawzzle Store';

const RemoveButton = ({ label, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-100 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-rose-600 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
  >
    <X className="h-3.5 w-3.5" /> Remove
  </button>
);

const ImageOrIcon = ({ src, alt, icon: Icon }) => (
  <div className="aspect-[4/3] overflow-hidden bg-slate-50">
    {src ? (
      <img src={getImageUrl(src)} alt={alt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
    ) : (
      <Icon className="h-full w-full p-10 text-slate-200" />
    )}
  </div>
);

const FavoriteCard = ({ type, item, onRemove, removing }) => {
  if (type === 'pets') {
    return (
      <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm transition hover:shadow-lg">
        <Link to={`/pets/${item._id}`} className="group block">
          <ImageOrIcon src={item.images?.[0]} alt={item.name} icon={PawPrint} />
          <div className="space-y-1 p-4 pb-3">
            <h3 className="truncate text-sm font-black text-slate-900">{item.name}</h3>
            <p className="truncate text-xs font-semibold text-slate-500">{item.breed || labelize(item.species, 'Pet')}</p>
            <p className="text-sm font-black text-primary-700">{formatPeso(item.price)}</p>
          </div>
        </Link>
        <div className="flex items-center justify-between border-t border-slate-50 p-3">
          <Link to={`/pets/${item._id}`} className="text-[9px] font-black uppercase tracking-wider text-primary-700 hover:underline">View Details</Link>
          <RemoveButton label={`Remove ${item.name} from favorites`} onClick={() => onRemove(type, item)} disabled={removing} />
        </div>
      </article>
    );
  }

  if (type === 'products') {
    return (
      <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm transition hover:shadow-lg">
        <Link to={`/products/${item._id}`} className="group block">
          <ImageOrIcon src={item.images?.[0] || item.coverImage} alt={item.name} icon={Package} />
          <div className="space-y-1 p-4 pb-3">
            <h3 className="truncate text-sm font-black text-slate-900">{item.name}</h3>
            <p className="truncate text-xs font-semibold text-slate-500">{storeName(item)}</p>
            <p className="text-sm font-black text-primary-700">{formatPeso(item.price)}</p>
          </div>
        </Link>
        <div className="flex items-center justify-between border-t border-slate-50 p-3">
          <Link to={`/products/${item._id}`} className="text-[9px] font-black uppercase tracking-wider text-primary-700 hover:underline">View Product</Link>
          <RemoveButton label={`Remove ${item.name} from favorites`} onClick={() => onRemove(type, item)} disabled={removing} />
        </div>
      </article>
    );
  }

  if (type === 'services') {
    return (
      <article className="flex min-h-52 flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-lg">
        <Link to={`/bookings?service=${item._id}`} className="group block">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
            <Calendar className="h-6 w-6" />
          </div>
          <h3 className="text-base font-black text-slate-900 group-hover:text-primary-700">{item.name}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">{storeName(item)}</p>
          <p className="mt-3 text-sm font-black text-primary-700">{formatPeso(item.price)}</p>
        </Link>
        <div className="mt-5 flex items-center justify-between border-t border-slate-50 pt-3">
          <Link to={`/bookings?service=${item._id}`} className="text-[9px] font-black uppercase tracking-wider text-primary-700 hover:underline">Book Again</Link>
          <RemoveButton label={`Remove ${item.name} from favorites`} onClick={() => onRemove(type, item)} disabled={removing} />
        </div>
      </article>
    );
  }

  const rating = Number(item.ratings?.average || 0);
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm transition hover:shadow-lg">
      <Link to={`/stores/${item._id}`} className="group block">
        <ImageOrIcon src={item.logo} alt={item.name} icon={Building} />
        <div className="space-y-2 p-4 pb-3">
          <h3 className="truncate text-sm font-black text-slate-900">{item.name}</h3>
          <div className="flex items-center gap-1 text-xs font-bold text-amber-600">
            <Star className="h-3.5 w-3.5 fill-current" /> {rating.toFixed(1)}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between border-t border-slate-50 p-3">
        <Link to={`/stores/${item._id}`} className="text-[9px] font-black uppercase tracking-wider text-primary-700 hover:underline">View Store</Link>
        <RemoveButton label={`Remove ${item.name} from favorites`} onClick={() => onRemove(type, item)} disabled={removing} />
      </div>
    </article>
  );
};

export const FavoritesPanel = ({ favorites, loading, onRemove, pendingRemoval }) => {
  const total = useMemo(
    () => favoriteTabs.reduce((count, tab) => count + (favorites[tab.id]?.length || 0), 0),
    [favorites]
  );
  const firstPopulatedTab = favoriteTabs.find(tab => favorites[tab.id]?.length)?.id;
  const [activeType, setActiveType] = useState(firstPopulatedTab || 'products');
  const userSelectedTab = useRef(false);
  const items = favorites[activeType] || [];

  useEffect(() => {
    if (!loading && !userSelectedTab.current && total > 0 && items.length === 0 && firstPopulatedTab) {
      setActiveType(firstPopulatedTab);
    }
  }, [firstPopulatedTab, items.length, loading, total]);

  return (
    <section className="space-y-7 animate-in fade-in slide-in-from-right-8 duration-500">
      <header>
        <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-3xl">My <span className="text-rose-600">Favorites</span></h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">Saved pets, products, services, and stores in one place.</p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Favorite categories">
        {favoriteTabs.map(tab => {
          const Icon = tab.icon;
          const selected = activeType === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                userSelectedTab.current = true;
                setActiveType(tab.id);
              }}
              className={`inline-flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition ${selected ? 'bg-slate-900 text-white shadow-md' : 'border border-slate-100 bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[9px] ${selected ? 'bg-white/15' : 'bg-slate-100'}`}>{favorites[tab.id]?.length || 0}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading favorites">
          {[1, 2, 3].map(item => <div key={item} className="h-72 animate-pulse rounded-3xl bg-slate-100" />)}
        </div>
      ) : items.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => (
            <FavoriteCard
              key={item._id}
              type={activeType}
              item={item}
              onRemove={onRemove}
              removing={pendingRemoval === `${activeType}:${item._id}`}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
          <Heart className="mx-auto mb-4 h-12 w-12 text-slate-200" />
          <h3 className="text-sm font-black text-slate-800">{total ? `No favorite ${activeType} yet.` : 'No favorites yet.'}</h3>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Save pets, products, services, or stores to find them quickly later.</p>
          <Link to="/products" className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-white hover:bg-primary-700">Explore Marketplace</Link>
        </div>
      )}
    </section>
  );
};

export const FollowingPanel = ({ following, loading, onUnfollow, pendingUnfollow }) => (
  <section className="space-y-7 animate-in fade-in slide-in-from-right-8 duration-500">
    <header>
      <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-3xl">Stores You <span className="text-primary-600">Follow</span></h2>
      <p className="mt-1 text-xs font-semibold text-slate-500">Quick access to your favorite pet stores.</p>
    </header>

    {loading ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Loading followed stores">
        {[1, 2, 3, 4].map(item => <div key={item} className="h-56 animate-pulse rounded-3xl bg-slate-100" />)}
      </div>
    ) : following.length ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {following.map(followed => {
          const store = followed.store || {};
          const storeId = followed.storeId || store._id;
          const address = store.contactInfo?.address || {};
          const branch = [address.barangay, address.city].filter(Boolean).join(', ');
          const name = store.name || `${followed.firstName || followed.username || 'Pawzzle'}'s Store`;
          const rating = Number(store.ratings?.average || 0);

          return (
            <article key={followed._id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-lg">
              {storeId ? (
                <Link to={`/stores/${storeId}`} className="group flex items-start gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                    {store.logo || followed.avatar ? <img src={getImageUrl(store.logo || followed.avatar)} alt={name} className="h-full w-full object-cover" /> : <Building className="h-full w-full p-4 text-slate-200" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-black text-slate-900 group-hover:text-primary-700">{name}</h3>
                    <p className="mt-1 text-[10px] font-bold text-slate-500">{labelize(store.businessType)}</p>
                    {branch && <p className="mt-1 truncate text-[10px] text-slate-400">{branch}</p>}
                    <div className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-600"><Star className="h-3.5 w-3.5 fill-current" /> {rating.toFixed(1)}</div>
                  </div>
                </Link>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50"><Building className="h-full w-full p-4 text-slate-200" /></div>
                  <div><h3 className="text-sm font-black text-slate-900">{name}</h3><p className="mt-1 text-xs text-slate-500">Store profile unavailable</p></div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-50 pt-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Following</span>
                <div className="flex items-center gap-2">
                  {storeId && <Link to={`/stores/${storeId}`} className="rounded-xl bg-slate-900 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white hover:bg-primary-700">View Store</Link>}
                  <button
                    type="button"
                    onClick={() => onUnfollow(followed)}
                    disabled={pendingUnfollow === followed._id}
                    className="rounded-xl border border-rose-100 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
                  >
                    Unfollow
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    ) : (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
        <StoreIcon className="mx-auto mb-4 h-12 w-12 text-slate-200" />
        <h3 className="text-sm font-black text-slate-800">You're not following any stores yet.</h3>
        <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Follow your favorite pet stores to see them here.</p>
        <Link to="/stores" className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-white hover:bg-primary-700">Browse Stores</Link>
      </div>
    )}
  </section>
);
