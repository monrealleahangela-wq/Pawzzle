import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { productService, getImageUrl } from '../../services/apiService';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { Package, ArrowLeft, Plus, Minus, MapPin, Store, ShoppingBag, Star, Heart, ShieldCheck, Tag, Scale, PawPrint, CheckCircle2 } from 'lucide-react';
import LoginModal from '../../components/LoginModal';
import ReviewSection from '../../components/ReviewSection';
import { socialService } from '../../services/apiService';
import { formatPeso } from '../../utils/paymentSummary';
import productSuitabilityLabel from '../../utils/productSuitability';

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [mainImage, setMainImage] = useState(null);
  const [normalizedVariants, setNormalizedVariants] = useState([]);
  const [variantCapabilities, setVariantCapabilities] = useState({ browsingEnabled: false, purchasingEnabled: true });
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [regulatoryVerification, setRegulatoryVerification] = useState(null);
  const { addToCart, buyNow } = useCart();
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    fetchProduct();
    if (isAuthenticated) {
        checkFavoriteStatus();
    }
  }, [id, isAuthenticated]);

  const checkFavoriteStatus = async () => {
    try {
        const res = await socialService.checkFavoriteStatus(id);
        setIsFavorite(res.data.isFavorite);
    } catch (error) {
        console.error('Error checking favorite status:', error);
    }
  };

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
        setShowLoginModal(true);
        return;
    }

    try {
        setIsTogglingFavorite(true);
        const res = await socialService.toggleFavorite(id);
        setIsFavorite(res.data.isFavorite);
        toast.success(res.data.message, { icon: res.data.isFavorite ? '❤️' : '💔' });
    } catch (error) {
        toast.error('We could not update your favorites. Please try again.');
    } finally {
        setIsTogglingFavorite(false);
    }
  };

  const fetchProduct = async () => {
    try {
      const response = await productService.getProductById(id);
      setProduct(response.data.product);
      const variants = response.data.normalizedVariants || [];
      setNormalizedVariants(variants);
      setVariantCapabilities(response.data.variantCapabilities || { browsingEnabled: false, purchasingEnabled: true });
      setRegulatoryVerification(response.data.regulatoryVerification || null);
      setSelectedVariantId('');
      setMainImage(response.data.product?.images?.[0] || null);
    } catch (error) {
      toast.error('We could not load this product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    // Check if authenticated using context flag
    if (!isAuthenticated || !user) {
      setShowLoginModal(true);
      return;
    }

    if (product.productMode === 'variant' && !selectedVariant) {
      toast.info('Select a product option before adding it to your cart.');
      return;
    }
    if (!canPurchaseSelection) {
      toast.error('This product option is not available for purchase.');
      return;
    }
    const userId = user._id || user.id;

    addToCart({
      itemType: 'product',
      itemId: product._id,
      name: selectedVariant ? `${product.name} — ${variantLabel(selectedVariant)}` : product.name,
      price: selectedVariant?.price ?? product.price,
      image: selectedVariant?.images?.[0] || product.images?.[0] || null,
      ...(selectedVariant ? { productVariant: selectedVariant._id, variantSnapshot: { sku: selectedVariant.sku, attributes: selectedVariant.attributes } } : {}),
      quantity,
      storeName: product.store?.name,
      storeId: product.store?._id,
      storeAddress: product.store?.address || product.store?.contactInfo?.address,
      userId: userId
    });
    toast.success(`${product.name} added to cart!`);
  };

  const handleBuyNow = () => {
    // Check if authenticated using context flag
    if (!isAuthenticated || !user) {
      setShowLoginModal(true);
      return;
    }

    if (product.productMode === 'variant' && !selectedVariant) {
      toast.info('Select a product option before continuing.');
      return;
    }
    if (!canPurchaseSelection) {
      toast.error('This product option is not available for purchase.');
      return;
    }
    const userId = user._id || user.id;

    // Prepare item
    const item = {
      itemType: 'product',
      itemId: product._id,
      name: selectedVariant ? `${product.name} — ${variantLabel(selectedVariant)}` : product.name,
      price: selectedVariant?.price ?? product.price,
      image: selectedVariant?.images?.[0] || product.images?.[0] || null,
      ...(selectedVariant ? { productVariant: selectedVariant._id, variantSnapshot: { sku: selectedVariant.sku, attributes: selectedVariant.attributes } } : {}),
      quantity,
      storeName: product.store?.name,
      storeId: product.store?._id,
      storeAddress: product.store?.address || product.store?.contactInfo?.address,
      userId: userId,
      selected: true // Pre-selected for immediate checkout
    };

    // Logic: Atomic buyNow handles deselection and addition
    buyNow(item);

    // Brief delay to ensure state update and sync before navigation
    setTimeout(() => {
      navigate('/checkout');
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Product not found</h2>
        <Link to="/products" className="btn btn-primary">
          Back to Products
        </Link>
      </div>
    );
  }

  const description = product.description || 'A great product for your pet.';
  const hasLongDescription = description.length > 260;
  const isSellerAccount = user?.role === 'seller' || user?.role === 'store_owner';
  const variantLabel = variant => (variant?.attributes || []).map(attribute => `${attribute.label}: ${attribute.valueLabel}`).join(' · ');
  const selectedVariant = normalizedVariants.find(variant => String(variant._id) === String(selectedVariantId));
  const displayedPrice = selectedVariant?.price ?? product.price;
  const displayedStock = product.productMode === 'variant' ? Number(selectedVariant?.availableQuantity || 0) : Number(product.stockQuantity || 0);
  const canPurchaseSelection = product.productMode !== 'variant'
    ? displayedStock > 0
    : Boolean(selectedVariant && selectedVariant.inStock && variantCapabilities.purchasingEnabled);
  const purchaseLabel = product.productMode === 'variant' && !variantCapabilities.purchasingEnabled
    ? 'Purchasing unavailable'
    : (product.productMode === 'variant' && !selectedVariant ? 'Select an option' : (displayedStock > 0 ? null : 'Out of Stock'));
  const availabilityLabel = product.productMode === 'variant' && !selectedVariant
    ? 'Choose an option'
    : (displayedStock > 0 ? `${displayedStock} in stock` : 'Out of stock');
  const productFacts = [
    { label: 'Category', value: product.category, icon: Tag },
    { label: 'Brand', value: product.brand || 'Not specified', icon: Store },
    product.weight ? { label: 'Package weight', value: `${product.weight} ${product.weightUnit || 'kg'}`, icon: Scale } : null,
    { label: 'Good for', value: productSuitabilityLabel(product), icon: PawPrint }
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-1 pb-24 sm:space-y-5 sm:px-0 lg:pb-12 animate-fade-in">
      <Link to="/products" className="group inline-flex items-center rounded-full border border-primary-100 bg-white/80 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 shadow-sm backdrop-blur transition-all hover:-translate-x-0.5 hover:border-primary-200 hover:text-primary-700 hover:shadow-md sm:text-xs">
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        Back to Products
      </Link>

      <div className="relative grid grid-cols-1 items-start gap-4 overflow-hidden rounded-[2rem] border border-primary-100 bg-white/55 p-3 shadow-[0_24px_70px_rgba(76,38,13,0.10)] backdrop-blur-sm sm:gap-6 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8 lg:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary-100/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-secondary-100/30 blur-3xl" />
        {/* Product Image */}
        <div className="relative lg:sticky lg:top-4">
          <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[1.75rem] border border-white bg-gradient-to-br from-white via-primary-50/30 to-secondary-50/30 p-5 shadow-[0_20px_50px_rgba(76,38,13,0.08)] sm:p-8 lg:max-h-[34rem]">
            <div className={`absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest shadow-sm backdrop-blur ${displayedStock > 0 || (product.productMode === 'variant' && !selectedVariant)
              ? 'border-emerald-100 bg-white/90 text-emerald-700'
              : 'border-rose-100 bg-white/90 text-rose-600'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${displayedStock > 0 || (product.productMode === 'variant' && !selectedVariant) ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {availabilityLabel}
            </div>
            {mainImage ? (
              <img src={getImageUrl(mainImage)} alt={product.name} onError={() => setMainImage(null)} className="h-full w-full object-contain drop-shadow-[0_20px_22px_rgba(0,0,0,0.08)] transition-transform duration-500 hover:scale-[1.02]" />
            ) : (
              <Package className="h-20 w-20 text-slate-200" />
            )}
          </div>
          {product.images?.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto rounded-2xl border border-primary-100 bg-white/75 p-2 shadow-sm">{product.images.map((image, index) => <button key={`${image}-${index}`} type="button" onClick={() => setMainImage(image)} aria-label={`Show ${product.name} image ${index + 1}`} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-1 transition-all ${mainImage === image ? 'border-primary-500 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={getImageUrl(image)} alt={`${product.name} view ${index + 1}`} onError={event => { event.currentTarget.style.display = 'none'; }} className="h-full w-full rounded-lg object-cover" /></button>)}</div>}
        </div>

        {/* Product Details */}
        <div className="relative space-y-4 rounded-[1.75rem] border border-white/90 bg-white/85 p-4 shadow-[0_18px_45px_rgba(76,38,13,0.07)] sm:p-6 lg:space-y-4">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-primary-700">
                <Package className="h-3 w-3" /> {product.category}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Product details</span>
            </div>
            <div className="flex items-start justify-between gap-4">
                <h1 className="mb-1.5 min-w-0 text-[clamp(1.65rem,3vw,2.75rem)] font-black uppercase leading-[0.98] tracking-[-0.035em] text-slate-950 break-words">{product.name}</h1>
                {user?.role !== 'super_admin' && (
                  <button 
                      onClick={handleToggleFavorite}
                      disabled={isTogglingFavorite}
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-all sm:h-14 sm:w-14 ${isFavorite
                          ? 'bg-rose-50 border-rose-100 text-rose-500 shadow-lg shadow-rose-100/70'
                          : 'bg-white border-slate-200 text-slate-300 shadow-sm hover:-translate-y-0.5 hover:border-primary-200 hover:text-primary-500 hover:shadow-md'
                      }`}
                      title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                      aria-label={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                  >
                      <Heart className={`h-6 w-6 ${isFavorite ? 'fill-current' : ''}`} />
                  </button>
                )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <span className="text-2xl font-black tracking-[-0.04em] text-primary-800 sm:text-3xl">{formatPeso(displayedPrice)}</span>
              {product.brand && (
                <span className="rounded-lg bg-slate-950 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-white">{product.brand}</span>
              )}
            </div>

            {regulatoryVerification?.authority === 'FDA' && regulatoryVerification?.status === 'approved' && (
              <div
                className="mt-3 flex w-full max-w-lg items-center gap-3 rounded-2xl border border-primary-200 bg-gradient-to-r from-primary-50 to-white px-3.5 py-3 text-primary-900 shadow-sm"
                role="status"
                aria-label="FDA approved; FDA registration evidence verified by Pawzzle"
                title="FDA registration evidence was reviewed by Pawzzle. Pawzzle does not issue FDA approval."
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-700 text-white shadow-md shadow-primary-200"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase tracking-[0.16em]">FDA Approved</span>
                  <span className="mt-0.5 block text-[9px] font-bold normal-case text-primary-700">Registration evidence verified by Pawzzle</span>
                </span>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
              </div>
            )}

            {product.ratings && product.ratings.count > 0 && (
              <div className="mt-2 flex w-fit items-center gap-1.5 rounded-xl border border-secondary-100 bg-secondary-50 px-3 py-1.5">
                <Star className="w-4 h-4 text-secondary-500 fill-secondary-500" />
                <span className="text-xs font-black text-primary-700 tracking-wider">
                  {product.ratings.average.toFixed(1)} <span className="font-bold opacity-70">({product.ratings.count} REVIEWS)</span>
                </span>
              </div>
            )}
          </div>

          {product.productMode === 'variant' && variantCapabilities.browsingEnabled && (
            <section className="rounded-2xl border border-primary-100 bg-primary-50/40 p-3 sm:p-4" aria-label="Product options">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-900">Choose an option</h2>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Only combinations offered by this store are shown.</p>
                </div>
                {selectedVariant && <span className="text-[10px] font-black text-primary-700">{selectedVariant.availableQuantity} available</span>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {normalizedVariants.map(variant => (
                  <button
                    key={variant._id}
                    type="button"
                    onClick={() => {
                      setSelectedVariantId(variant._id);
                      setQuantity(1);
                      setMainImage(variant.images?.[0] || product.images?.[0] || null);
                    }}
                    disabled={!variant.inStock}
                    aria-pressed={String(selectedVariantId) === String(variant._id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${String(selectedVariantId) === String(variant._id)
                      ? 'border-primary-600 bg-white shadow-sm ring-2 ring-primary-100'
                      : 'border-slate-200 bg-white hover:border-primary-300'} ${!variant.inStock ? 'cursor-not-allowed opacity-45' : ''}`}
                  >
                    <span className="block text-[11px] font-black text-slate-900">{variantLabel(variant)}</span>
                    <span className="mt-1 block text-[10px] font-bold text-slate-500">{formatPeso(variant.price)} · {variant.inStock ? `${variant.availableQuantity} in stock` : 'Out of stock'}</span>
                  </button>
                ))}
              </div>
              {!variantCapabilities.purchasingEnabled && (
                <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-slate-600">Options are visible for review, but checkout remains disabled until inventory and payment safety checks are verified.</p>
              )}
            </section>
          )}

          <div className="grid grid-cols-2 gap-2">
            {productFacts.map(({ label, value, icon: Icon }) => (
              <div key={label} className="group flex min-w-0 items-center gap-2.5 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 transition-colors hover:border-primary-100 hover:bg-primary-50/40">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-primary-600 shadow-sm"><Icon className="h-3.5 w-3.5" /></span>
                <span className="min-w-0">
                  <span className="mb-0.5 block text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                  <span className="line-clamp-2 block break-words text-[11px] font-black uppercase leading-tight text-slate-900 sm:text-xs" title={String(value)}>{value}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-primary-100 bg-gradient-to-br from-white to-primary-50/35 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-primary-600" />
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Description</h3>
            </div>
            <p className={`text-[11px] font-semibold italic leading-relaxed text-slate-600 sm:text-sm ${hasLongDescription && !showFullDescription ? 'line-clamp-3' : ''}`}>
              "{description}"
            </p>
            {hasLongDescription && (
              <button
                type="button"
                onClick={() => setShowFullDescription(current => !current)}
                className="mt-2 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-primary-700 hover:text-primary-900"
                aria-expanded={showFullDescription}
              >
                {showFullDescription ? 'Show less' : 'Read full description'}
              </button>
            )}
          </div>

          {/* Buying Options */}
          <div className={`relative overflow-hidden rounded-3xl bg-slate-900 p-5 shadow-2xl ${isSellerAccount ? 'hidden sm:block' : 'hidden lg:block'}`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            
            {isSellerAccount ? (
              <div className="relative z-10 text-center py-4">
                <p className="text-white text-[11px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Seller Account</p>
                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                    Sellers are not allowed to buy items on the marketplace.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="relative z-10 mb-4 flex items-center justify-between">
                  <h3 className="text-white text-base font-black uppercase tracking-widest italic">Quantity</h3>
                  <div className="flex items-center gap-4 bg-white/10 rounded-xl p-1 px-4 border border-white/10">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="text-slate-400 hover:text-white" aria-label="Decrease quantity"><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-center text-white font-black">{quantity}</span>
                    <button onClick={() => setQuantity(Math.min(displayedStock, quantity + 1))} disabled={!canPurchaseSelection || quantity >= displayedStock} className="text-slate-400 hover:text-white disabled:opacity-30" aria-label="Increase quantity"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="relative z-10 grid grid-cols-2 gap-3">
                  <button
                    onClick={handleAddToCart}
                    disabled={!canPurchaseSelection}
                    className={`w-full rounded-2xl px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${canPurchaseSelection
                      ? 'bg-white/10 text-white border border-white/10 hover:bg-white/20 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                  >
                    {purchaseLabel || 'Add to Cart'}
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={!canPurchaseSelection}
                    className={`w-full rounded-2xl px-4 py-3.5 text-[11px] font-black uppercase tracking-[0.16em] transition-all ${canPurchaseSelection
                      ? 'bg-primary-600 text-white shadow-xl shadow-primary-500/20 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                  >
                    {purchaseLabel || `Buy Now [${formatPeso(displayedPrice * quantity)}]`}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Specifications */}
          {(product.dimensions || product.material) && (
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div>
                <p className="mb-1 text-[8px] font-black uppercase tracking-widest text-slate-400">Dimensions</p>
                <p className="text-[10px] font-black uppercase tracking-tighter text-slate-900">
                  {product.dimensions?.length || '0'}x{product.dimensions?.width || '0'}x{product.dimensions?.height || '0'} {product.dimensions?.unit || 'cm'}
                </p>
              </div>
              {product.material && (
                <div className="text-right">
                  <p className="mb-1 text-[8px] font-black uppercase tracking-widest text-slate-400">Material</p>
                  <p className="text-[10px] font-black uppercase text-slate-900">{product.material}</p>
                </div>
              )}
            </div>
          )}

          {/* Seller Information */}
          {product.store && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-lg shadow-slate-200/40 sm:p-4">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-slate-100 bg-slate-50 sm:h-16 sm:w-16">
                {product.store.logo ? (
                  <img src={getImageUrl(product.store.logo)} alt={product.store.name} className="w-full h-full object-cover" />
                ) : (
                  <Store className="w-full h-full p-3.5 text-slate-200" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-primary-500">Verified Seller</p>
                <h4 className="line-clamp-2 break-words text-base font-black uppercase leading-tight tracking-tight text-slate-900">{product.store.name}</h4>
                <div className="mt-1 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-slate-300" />
                  <span className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    {[
                      product.store.contactInfo?.address?.street,
                      product.store.contactInfo?.address?.barangay,
                      product.store.contactInfo?.address?.city,
                      product.store.contactInfo?.address?.state
                    ].filter(Boolean).join(', ') || 'Cavite'}
                  </span>
                </div>
              </div>
              <Link to={`/stores/${product.store?._id || product.store}`} aria-label={`View ${product.store.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-transform hover:scale-105">
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Fixed Action Bar */}
      {!isSellerAccount && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-100 px-4 py-3 shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-1 border border-slate-100 shrink-0">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 flex items-center justify-center text-slate-400" aria-label="Decrease quantity"><Minus className="h-3 w-3" /></button>
              <span className="w-6 text-center text-[11px] font-black text-slate-900">{quantity}</span>
              <button onClick={() => setQuantity(Math.min(displayedStock, quantity + 1))} disabled={!canPurchaseSelection || quantity >= displayedStock} className="w-8 h-8 flex items-center justify-center text-slate-400 disabled:opacity-30" aria-label="Increase quantity"><Plus className="h-3 w-3" /></button>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={!canPurchaseSelection}
              aria-label={purchaseLabel || 'Add to Cart'}
              className={`w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 shrink-0 ${!canPurchaseSelection ? 'opacity-50' : ''}`}
            >
              <ShoppingBag className="h-5 w-5" />
            </button>
            <button
              onClick={handleBuyNow}
              disabled={!canPurchaseSelection}
              className={`flex-1 btn btn-primary py-3.5 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary-200 text-center ${!canPurchaseSelection ? 'opacity-50 grayscale' : ''}`}
            >
              {purchaseLabel || `Buy Now [${formatPeso(displayedPrice * quantity)}]`}
            </button>
          </div>
        </div>
      )}

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={() => navigate('/login')}
      />

      {/* Reviews Section */}
      <div className="max-w-4xl">
        <ReviewSection targetType="Product" targetId={id} />
      </div>
    </div>
  );
};

export default ProductDetail;
