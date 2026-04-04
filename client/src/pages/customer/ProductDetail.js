import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { productService, getImageUrl } from '../../services/apiService';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { Package, ArrowLeft, Plus, Minus, MapPin, Phone, Mail, Clock, Store, ShoppingBag, Star, Heart } from 'lucide-react';
import GoogleMap from '../../components/GoogleMap';
import LoginModal from '../../components/LoginModal';
import ReviewSection from '../../components/ReviewSection';
import { socialService } from '../../services/apiService';

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
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
        toast.error('Failed to update favorite status');
    } finally {
        setIsTogglingFavorite(false);
    }
  };

  const fetchProduct = async () => {
    try {
      const response = await productService.getProductById(id);
      setProduct(response.data.product);
    } catch (error) {
      toast.error('Failed to load product details');
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

    const userId = user._id || user.id;

    addToCart({
      itemType: 'product',
      itemId: product._id,
      name: product.name,
      price: product.price,
      image: product.images?.[0] || null,
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

    const userId = user._id || user.id;

    // Prepare item
    const item = {
      itemType: 'product',
      itemId: product._id,
      name: product.name,
      price: product.price,
      image: product.images?.[0] || null,
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

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-8 animate-fade-in pb-24 px-1 sm:px-0">
      <Link to="/products" className="inline-flex items-center text-[10px] sm:text-sm font-black text-slate-400 hover:text-primary-600 uppercase tracking-widest transition-all px-2 md:px-0">
        <ArrowLeft className="h-3 w-3 mr-1.5" />
        Back to Stock
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-10">
        {/* Product Image */}
        <div className="bg-slate-50 rounded-3xl aspect-[4/3] sm:aspect-square flex items-center justify-center p-8 border border-slate-100 shadow-sm sm:shadow-none">
          {product.images?.[0] ? (
            <img src={getImageUrl(product.images[0])} alt={product.name} className="w-full h-full object-contain" />
          ) : (
            <Package className="h-20 w-20 text-slate-200" />
          )}
        </div>

        {/* Product Details */}
        <div className="space-y-4 sm:space-y-8 px-2 sm:px-0">
          <div>
            <p className="text-[10px] font-black text-secondary-600 uppercase tracking-[0.2em] mb-1">{product.category}</p>
            <div className="flex justify-between items-start gap-4">
                <h1 className="text-2xl sm:text-5xl font-black text-slate-900 mb-2 uppercase tracking-tight leading-none">{product.name}</h1>
                {user?.role !== 'super_admin' && (
                  <button 
                      onClick={handleToggleFavorite}
                      disabled={isTogglingFavorite}
                      className={`p-3 rounded-2xl border-2 transition-all ${isFavorite 
                          ? 'bg-rose-50 border-rose-100 text-rose-500 shadow-lg shadow-rose-100' 
                          : 'bg-white border-slate-100 text-slate-300 hover:border-slate-200 hover:text-slate-400'
                      }`}
                      title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                  >
                      <Heart className={`h-6 w-6 ${isFavorite ? 'fill-current' : ''}`} />
                  </button>
                )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl sm:text-3xl font-black text-slate-900 tracking-tighter">₱{product.price?.toLocaleString()}</span>
              {product.brand && (
                <span className="px-2 py-0.5 bg-slate-900 text-white rounded text-[8px] font-black uppercase tracking-widest">{product.brand}</span>
              )}
            </div>

            {product.ratings && product.ratings.count > 0 && (
              <div className="flex items-center gap-1.5 mt-3 bg-amber-50 rounded-xl px-3 py-1.5 w-fit border border-amber-100">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-xs font-black text-amber-700 tracking-wider">
                  {product.ratings.average.toFixed(1)} <span className="font-bold opacity-70">({product.ratings.count} REVIEWS)</span>
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {[
              { label: 'Classification', value: product.category },
              { label: 'Origin', value: product.brand || 'Premium' },
              { label: 'Mass', value: `${product.weight || '0'} ${product.weightUnit || 'kg'}` },
              { label: 'Deployment', value: product.suitableFor?.[0] || 'Universal' }
            ].map((stat, i) => (
              <div key={i} className="bg-slate-50 p-3 sm:p-5 rounded-2xl border border-slate-100">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                <p className="text-[11px] sm:text-sm font-black text-slate-900 uppercase truncate">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Operational Intel</h3>
            <p className="text-[11px] sm:text-base font-bold text-slate-500 leading-relaxed italic pr-4">
              "{product.description || 'Superior selection awaiting a premium deployment environment.'}"
            </p>
          </div>

          {/* Technical Specs - Compacted */}
          {(product.dimensions || product.material) && (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Dimensions</p>
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">
                  {product.dimensions?.length || '0'}x{product.dimensions?.width || '0'}x{product.dimensions?.height || '0'} {product.dimensions?.unit || 'cm'}
                </p>
              </div>
              {product.material && (
                <div className="text-right">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Material</p>
                  <p className="text-[10px] font-black text-slate-900 uppercase">{product.material}</p>
                </div>
              )}
            </div>
          )}

          {/* Store Intel - Streamlined */}
          {product.store && (
            <div className="bg-white rounded-[2.5rem] p-4 sm:p-6 border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-50 border border-slate-100 flex-shrink-0 overflow-hidden">
                {product.store.logo ? (
                  <img src={getImageUrl(product.store.logo)} alt={product.store.name} className="w-full h-full object-cover" />
                ) : (
                  <Store className="w-full h-full p-4 text-slate-200" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-primary-500 uppercase tracking-[0.2em] mb-1">Verified Base</p>
                <h4 className="text-base sm:text-xl font-black text-slate-900 truncate uppercase tracking-tight">{product.store.name}</h4>
                <div className="flex items-center gap-1.5 mt-1 sm:mt-2">
                  <MapPin className="h-3 w-3 text-slate-300" />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">
                    {[
                      product.store.contactInfo?.address?.street,
                      product.store.contactInfo?.address?.barangay,
                      product.store.contactInfo?.address?.city,
                      product.store.contactInfo?.address?.state
                    ].filter(Boolean).join(', ') || 'Cavite Operating Zone'}
                  </span>
                </div>
              </div>
              <Link to={`/stores/${product.store._id}`} className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white shrink-0 hover:scale-110 transition-transform">
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Link>
            </div>
          )}

          {/* Acquisition Module */}
          <div className="bg-slate-900 p-4 sm:p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden hidden sm:block">
            <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center justify-between mb-6 relative z-10">
              <h3 className="text-white text-base font-black uppercase tracking-widest italic">Acquisition</h3>
              <div className="flex items-center gap-4 bg-white/10 rounded-xl p-1 px-4 border border-white/10">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="text-slate-400 hover:text-white"><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center text-white font-black">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="text-slate-400 hover:text-white"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex flex-col gap-3 relative z-10">
              <button
                onClick={handleAddToCart}
                disabled={product.stockQuantity === 0}
                className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${product.stockQuantity > 0
                  ? 'bg-white/10 text-white border border-white/10 hover:bg-white/20 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
              >
                {product.stockQuantity === 0 ? 'Asset Depleted' : `Add to Cart`}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={product.stockQuantity === 0}
                className={`w-full py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all ${product.stockQuantity > 0
                  ? 'bg-primary-600 text-white shadow-xl shadow-primary-500/20 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
              >
                {product.stockQuantity === 0 ? 'Asset Depleted' : `Buy Now [₱${(product.price * quantity).toLocaleString()}]`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Action Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-100 px-4 py-3 shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-1 border border-slate-100 shrink-0">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 flex items-center justify-center text-slate-400"><Minus className="h-3 w-3" /></button>
            <span className="w-6 text-center text-[11px] font-black text-slate-900">{quantity}</span>
            <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 flex items-center justify-center text-slate-400"><Plus className="h-3 w-3" /></button>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={product.stockQuantity === 0}
            className={`w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 shrink-0 ${product.stockQuantity === 0 ? 'opacity-50' : ''}`}
          >
            <ShoppingBag className="h-5 w-5" />
          </button>
          <button
            onClick={handleBuyNow}
            disabled={product.stockQuantity === 0}
            className={`flex-1 btn btn-primary py-3.5 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary-200 text-center ${product.stockQuantity === 0 ? 'opacity-50 grayscale' : ''}`}
          >
            {product.stockQuantity === 0 ? 'Out of Stock' : `Buy Now [₱${(product.price * quantity).toLocaleString()}]`}
          </button>
        </div>
      </div>

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
