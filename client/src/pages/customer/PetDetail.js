import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, Heart, Calendar, Weight, MapPin, Package, MessageSquare, Star } from 'lucide-react';
import { petService, getImageUrl, adoptionService } from '../../services/apiService';
import { chatService } from '../../services/chatService';
import LoginModal from '../../components/LoginModal';
import EnhancedChatMessenger from '../../components/EnhancedChatMessenger';
import { useAuth } from '../../contexts/AuthContext';
import ReviewSection from '../../components/ReviewSection';
import InquiryModal from '../../components/InquiryModal';

const PetDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
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

  const handleInquirySubmit = async (formData) => {
    try {
      setLoading(true);
      
      let conversationId;
      try {
        const response = await chatService.getConversationByPet(id);
        if (response.data.conversation) {
          conversationId = response.data.conversation._id;
        } else {
          throw new Error('Not found');
        }
      } catch (err) {
        const convResponse = await chatService.createConversation({ 
          participantIds: [pet.addedBy._id || pet.addedBy],
          petId: id, 
          type: 'adoption'
        });
        conversationId = convResponse.data.conversation._id;
      }

      await adoptionService.requestAdoption({
        petId: id,
        conversationId,
        ...formData
      });

      toast.success(`Active inquiry started for ${pet.name}!`);
      setShowInquiryModal(false);
      setShowChat(true); // Open chat to see the system messages
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start inquiry');
    } finally {
      setLoading(false);
    }
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
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-8 px-2 sm:px-6 animate-fade-in pb-60">
      <Link to="/pets" className="inline-flex items-center text-[10px] sm:text-sm font-black text-slate-400 hover:text-primary-600 uppercase tracking-widest transition-all">
        <ArrowLeft className="h-3 w-3 mr-1.5" />
        Back to Pets
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
                <p className="font-black uppercase tracking-widest text-[8px] opacity-40">No Images</p>
              </div>
            )}
            <div className="absolute top-3 right-3">
              <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-md border border-white/20 ${pet.status === 'available' ? 'bg-primary-600/90 text-white' :
                pet.status === 'reserved' ? 'bg-primary-600/90 text-white' :
                  'bg-rose-600/90 text-white'
                }`}>
                {pet.status === 'adopted' ? 'SOLD' : (pet.status?.toUpperCase() || (pet.isAvailable ? 'Active' : 'Sold'))}
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
              <div className="flex items-center gap-1.5 mb-4 bg-secondary-50 rounded-xl px-3 py-1.5 w-fit border border-secondary-100">
                <Star className="w-4 h-4 text-secondary-500 fill-secondary-500" />
                <span className="text-xs font-black text-primary-700 tracking-wider">
                  {pet.ratings.average.toFixed(1)} <span className="font-bold opacity-70">({pet.ratings.count} reviews)</span>
                </span>
              </div>
            )}
            <p className="text-[11px] sm:text-base font-bold text-slate-500 leading-relaxed italic">
              "{pet.description || 'Looking for a new loving home!'}"
            </p>
          </div>

          {/* Seller Trust Snapshot */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center border border-primary-100 overflow-hidden">
                  {pet.store?.logo ? (
                    <img src={getImageUrl(pet.store.logo)} alt={pet.store.name} className="w-full h-full object-cover" />
                  ) : (
                    <Star className="h-5 w-5 text-primary-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">{pet.store?.name || 'Private Seller'}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-emerald-100">Verified Seller</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">• {pet.store?.stats?.responseTime || 'under an hour'} response</span>
                  </div>
                </div>
              </div>
              <Link 
                to={`/stores/${pet.store?._id}`}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-lg"
              >
                Visit Seller Page
              </Link>
            </div>
            
            <div className="grid grid-cols-3 gap-2 border-t border-slate-50 pt-4">
              <div className="text-center">
                <p className="text-[10px] font-black text-slate-900">{pet.store?.stats?.activeListingsCount || '11+'}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Active Pets</p>
              </div>
              <div className="text-center border-x border-slate-50">
                <p className="text-[10px] font-black text-slate-900">{pet.store?.stats?.responseRate || '98'}%</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Resp. Rate</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black text-slate-900">{pet.store?.ratings?.count || '0'}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Store Reviews</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {[
              { label: 'Species', value: pet.species },
              { label: 'Breed', value: pet.breed },
              { label: 'Age', value: `${pet.age} ${pet.ageUnit}` },
              { label: 'Gender', value: pet.gender },
              { label: 'Size', value: pet.size },
              { label: 'Health', value: pet.vaccinationStatus?.replace('_', ' ') || 'Screened' },
              { label: 'Temperament', value: pet.temperament || 'Friendly' },
              { label: 'Pickup Area', value: pet.location || 'Cavite' }
            ].map((stat, i) => (
              <div key={i} className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 flex flex-col justify-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                <p className="text-[11px] sm:text-xs font-black text-slate-900 uppercase truncate">{stat.value}</p>
              </div>
            ))}
          </div>

          {pet.specialNeeds && (
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
              <h3 className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-1">Health Notes</h3>
              <p className="text-[11px] font-bold text-rose-800 leading-relaxed">{pet.specialNeeds}</p>
            </div>
          )}

          {/* Action Hub */}
          <div className="bg-slate-900 p-6 sm:p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-50" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 opacity-50" />

            <h3 className="text-white text-[10px] sm:text-sm font-black uppercase tracking-widest mb-6 relative z-10 italic opacity-60">Professional Inquiry</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
              <button
                onClick={handleChatSeller}
                className="w-full py-4 rounded-2xl text-[10px] font-black text-white bg-slate-800 border-2 border-slate-700 uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                Ask a Question
              </button>
              
              <button
                disabled={pet.status !== 'available'}
                onClick={() => {
                  if (isAuthenticated) {
                    setShowInquiryModal(true);
                  } else {
                    setShowLoginModal(true);
                  }
                }}
                className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95 ${pet.status === 'available'
                  ? 'bg-primary-600 text-white hover:bg-primary-500 shadow-primary-900/40'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
              >
                <Package className="h-4 w-4" />
                {pet.status === 'available' ? 'Start Purchase Inquiry' : pet.status?.toUpperCase()}
              </button>
            </div>
            
            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-6 text-center">
               Confirm availability and health records before committing.
            </p>
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

      {/* Inquiry Modal */}
      {pet && (
        <InquiryModal
          isOpen={showInquiryModal}
          onClose={() => setShowInquiryModal(false)}
          pet={pet}
          onSubmit={handleInquirySubmit}
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
