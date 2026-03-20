import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, Heart, Calendar, Weight, MapPin, Package, MessageSquare, Star } from 'lucide-react';
import { petService, getImageUrl } from '../../services/apiService';
import LoginModal from '../../components/LoginModal';
import EnhancedChatMessenger from '../../components/EnhancedChatMessenger';
import { useAuth } from '../../contexts/AuthContext';
import ReviewSection from '../../components/ReviewSection';

const PetDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [mainImage, setMainImage] = useState(null);
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    fetchPet();
  }, [id]);

  useEffect(() => {
    if (pet && pet.images && pet.images.length > 0) {
      setMainImage(pet.images[0]);
    }
  }, [pet]);

  const fetchPet = async () => {
    try {
      const response = await petService.getPetById(id);
      setPet(response.data.pet);
    } catch (error) {
      toast.error('Failed to load pet details');
    } finally {
      setLoading(false);
    }
  };

  const handleChatSeller = () => {
    // Check if authenticated using context flag
    if (isAuthenticated && user) {
      setShowChat(true);
      return;
    }

    // If not logged in, show login modal
    setShowLoginModal(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Pet not found</h2>
        <Link to="/pets" className="btn btn-primary">
          Back to Pets
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-8 px-2 sm:px-6 animate-fade-in pb-12">
      <Link to="/pets" className="inline-flex items-center text-[10px] sm:text-sm font-black text-slate-400 hover:text-primary-600 uppercase tracking-widest transition-all">
        <ArrowLeft className="h-3 w-3 mr-1.5" />
        Back to Fleet
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-10">
        {/* Pet Image Gallery */}
        <div className="space-y-2 sm:space-y-4">
          <div className="bg-slate-50 rounded-3xl overflow-hidden aspect-[4/3] sm:aspect-square flex items-center justify-center relative group border border-slate-100">
            {mainImage ? (
              <img
                src={getImageUrl(mainImage)}
                alt={pet.name}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.onerror = null; e.target.src = '/images/placeholder-pet.png'; }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-300">
                <Heart className="h-16 w-16 mb-2 opacity-20" />
                <p className="font-black uppercase tracking-widest text-[8px] opacity-40">No Visuals</p>
              </div>
            )}
            <div className="absolute top-3 right-3">
              <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-md border border-white/20 ${pet.status === 'available' ? 'bg-primary-600/90 text-white' :
                pet.status === 'reserved' ? 'bg-amber-600/90 text-white' :
                  'bg-rose-600/90 text-white'
                }`}>
                {pet.status?.toUpperCase() || (pet.isAvailable ? 'Active' : 'Deployed')}
              </span>
            </div>
          </div>

          {/* Thumbnails */}
          {pet.images && pet.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {pet.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setMainImage(img)}
                  className={`w-12 h-12 sm:w-20 sm:h-20 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${mainImage === img ? 'border-primary-500 shadow-md' : 'border-slate-100 opacity-60'}`}
                >
                  <img src={getImageUrl(img)} alt={`${pet.name} ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pet Details */}
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white p-4 sm:p-0 rounded-3xl sm:bg-transparent border border-slate-50 sm:border-none">
            <p className="text-[10px] font-black text-primary-600 uppercase tracking-[0.2em] mb-1">{pet.breed}</p>
            <h1 className="text-2xl sm:text-5xl font-black text-slate-900 mb-2 uppercase tracking-tight leading-none">{pet.name}</h1>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl sm:text-3xl font-black text-slate-900 tracking-tighter">₱{pet.price?.toLocaleString()}</span>
              {pet.store && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100">
                  <MapPin className="h-2.5 w-2.5 text-slate-400" />
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    {[
                      pet.store.contactInfo?.address?.street,
                      pet.store.contactInfo?.address?.barangay,
                      pet.store.contactInfo?.address?.city,
                      pet.store.contactInfo?.address?.state
                    ].filter(Boolean).join(', ') || 'Cavite'}
                  </span>
                </div>
              )}
            </div>
            {pet.ratings && pet.ratings.count > 0 && (
              <div className="flex items-center gap-1.5 mb-4 bg-amber-50 rounded-xl px-3 py-1.5 w-fit border border-amber-100">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-xs font-black text-amber-700 tracking-wider">
                  {pet.ratings.average.toFixed(1)} <span className="font-bold opacity-70">({pet.ratings.count} REVIEWS)</span>
                </span>
              </div>
            )}
            <p className="text-[11px] sm:text-base font-bold text-slate-500 leading-relaxed italic">
              "{pet.description || 'Superior selection awaiting a premium deployment environment.'}"
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {[
              { label: 'Classification', value: pet.species },
              { label: 'Breed Spec', value: pet.breed },
              { label: 'Maturity', value: `${pet.age} ${pet.ageUnit}` },
              { label: 'Gender', value: pet.gender },
              { label: 'Magnitude', value: pet.size },
              { label: 'Vetting', value: pet.vaccinationStatus.replace('_', ' ') }
            ].map((stat, i) => (
              <div key={i} className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 flex flex-col justify-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                <p className="text-[11px] sm:text-sm font-black text-slate-900 uppercase truncate">{stat.value}</p>
              </div>
            ))}
          </div>

          {pet.specialNeeds && (
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
              <h3 className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-1">Critical Requirements</h3>
              <p className="text-[11px] font-bold text-rose-800 leading-relaxed">{pet.specialNeeds}</p>
            </div>
          )}

          {/* Action Hub */}
          <div className="bg-slate-900 p-4 sm:p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <h3 className="text-white text-[10px] sm:text-base font-black uppercase tracking-widest mb-4 sm:mb-6 relative z-10 italic">Execute Acquisition</h3>

            <div className="flex flex-col gap-2 relative z-10">
              <button
                disabled={pet.status !== 'available'}
                onClick={handleChatSeller}
                className={`w-full py-4 sm:py-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${pet.status === 'available'
                  ? 'bg-primary-600 text-white hover:bg-primary-500 shadow-primary-900/40'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
              >
                {pet.status === 'available' ? (
                  <>
                    <MessageSquare className="h-5 w-5" />
                    Inquire / Message Seller
                  </>
                ) : pet.status === 'reserved' ? 'Asset Reserved' : 'Asset Adopted'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={() => navigate('/login')}
      />

      {/* Enhanced Chat Messenger */}
      {pet && (
        <EnhancedChatMessenger
          isOpen={showChat}
          onClose={() => setShowChat(false)}
          pet={pet}
          seller={pet.addedBy ? { _id: pet.addedBy._id, firstName: pet.addedBy.firstName || pet.addedBy.username } : null}
          currentUser={user}
        />
      )}

      {/* Reviews Section */}
      <div className="max-w-4xl">
        <ReviewSection targetType="Pet" targetId={id} />
      </div>
    </div>
  );
};

export default PetDetail;
