import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, BadgeCheck, CalendarDays, ChevronDown, Heart, MapPin, MessageSquare, Package, PawPrint, Ruler, Scale, ShieldCheck, Sparkles, Star, Store, Syringe } from 'lucide-react';
import { adoptionService, getImageUrl, paymentService, petService, storeService } from '../../services/apiService';
import { chatService } from '../../services/chatService';
import LoginModal from '../../components/LoginModal';
import EnhancedChatMessenger from '../../components/EnhancedChatMessenger';
import { useAuth } from '../../contexts/AuthContext';
import ReviewSection from '../../components/ReviewSection';
import InquiryModal from '../../components/InquiryModal';

const statusStyles = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reserved: 'bg-amber-50 text-amber-700 border-amber-200',
  sold: 'bg-slate-100 text-slate-700 border-slate-200',
  adopted: 'bg-primary-50 text-primary-700 border-primary-200',
  unavailable: 'bg-slate-100 text-slate-700 border-slate-200'
};

const formatAge = pet => {
  if (pet.age === undefined || pet.age === null) return 'Not specified';
  const unit = pet.ageUnit === 'months' ? 'month' : 'year';
  return `${pet.age} ${unit}${Number(pet.age) === 1 ? '' : 's'}`;
};

const PetDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [mainImage, setMainImage] = useState(null);
  const [storeDetails, setStoreDetails] = useState(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    const fetchPet = async () => {
      try {
        setLoading(true);
        const response = await petService.getPetById(id);
        setPet(response.data.pet);
      } catch (error) {
        toast.error('We could not load this pet. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchPet();
  }, [id]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const payment = query.get('payment');
    const adoptionId = query.get('id');
    if (!adoptionId) return;
    if (payment === 'success') {
      toast.info('Payment received. Checking its status...');
      paymentService.verifyPayment(adoptionId).then(response => {
        if (['paid_in_full', 'deposit_paid', 'partially_paid'].includes(response.data.status)) toast.success('PayMongo payment confirmed.');
        else toast.info('Payment is still pending confirmation.');
      }).catch(() => toast.info('Payment confirmation is still pending.'));
    } else if (payment === 'cancelled') {
      paymentService.cancelPayment('adoption', adoptionId).catch(() => {});
      toast.warning('Payment was cancelled. You can try again from your inquiry.');
    }
  }, [location.search]);

  useEffect(() => {
    if (!pet) return;
    setMainImage(pet.images?.[0] || null);
    const storeId = pet.store?._id || pet.store;
    if (storeId) {
      storeService.getStoreDetails(storeId).then(response => setStoreDetails(response.data)).catch(error => {
        console.error('Failed to fetch store details', error);
      });
    }
    try {
      const favorites = JSON.parse(window.localStorage.getItem('favoritePets') || '[]');
      setFavorite(favorites.includes(pet._id));
    } catch {
      setFavorite(false);
    }
  }, [pet]);

  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    try {
      const favorites = new Set(JSON.parse(window.localStorage.getItem('favoritePets') || '[]'));
      if (next) favorites.add(pet._id); else favorites.delete(pet._id);
      window.localStorage.setItem('favoritePets', JSON.stringify([...favorites]));
    } catch {
      // Favorites remain usable for the current page when storage is unavailable.
    }
  };

  const handleChatSeller = () => {
    if (isAuthenticated && user) setShowChat(true);
    else setShowLoginModal(true);
  };

  const openInquiry = () => {
    if (pet.status !== 'available' || pet.isAvailable !== true) return;
    if (isAuthenticated) setShowInquiryModal(true);
    else setShowLoginModal(true);
  };

  const handleInquirySubmit = async formData => {
    try {
      setLoading(true);
      let conversationId;
      try {
        const response = await chatService.getConversationByPet(id);
        if (!response.data.conversation) throw new Error('Not found');
        conversationId = response.data.conversation._id;
      } catch (error) {
        const response = await chatService.createConversation({
          participantIds: [pet.addedBy._id || pet.addedBy], petId: id, type: 'adoption'
        });
        conversationId = response.data.conversation._id;
      }

      const response = await adoptionService.requestAdoption({ petId: id, conversationId, ...formData });
      const adoptionRequest = response.data.request;
      if (formData.paymentMethod === 'paymongo' && pet.price > 0) {
        toast.info('Opening PayMongo payment...');
        try {
          const checkout = await paymentService.createAdoptionCheckoutSession(adoptionRequest._id);
          if (checkout.data.checkoutUrl) {
            window.location.href = checkout.data.checkoutUrl;
            return;
          }
        } catch (error) {
          console.error('Payment preparation failed:', error);
          toast.warning('Your inquiry was sent, but payment could not start. You can pay from the chat later.');
        }
      }
      toast.success(`Active inquiry started for ${pet.name}!`);
      setShowInquiryModal(false);
      setShowChat(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'We could not start this inquiry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const store = storeDetails?.store || pet?.store || {};
  const storeId = store?._id || pet?.store?._id || pet?.store;
  const storeAddress = store?.contactInfo?.address || {};
  const branch = [storeAddress.barangay, storeAddress.city].filter(Boolean).join(', ') || 'Branch details available from the store';
  const hasServices = Boolean(storeDetails?.services?.length);
  const isPurchasable = pet?.status === 'available' && pet?.isAvailable === true;
  const pcciProvided = Boolean(pet?.pcciRegistration?.certificateAvailable);
  const temperament = useMemo(() => {
    const values = String(pet?.temperament || '').split(/[,;|]/).map(value => value.trim()).filter(Boolean);
    if (pet?.adoptionDetails?.isKidFriendly) values.push('Good with Kids');
    if (pet?.adoptionDetails?.isPetFriendly) values.push('Good with Pets');
    return [...new Set(values)];
  }, [pet]);
  const relatedPets = useMemo(() => (storeDetails?.pets || [])
    .filter(item => item._id !== pet?._id)
    .sort((a, b) => Number(b.breed === pet?.breed) - Number(a.breed === pet?.breed))
    .slice(0, 4), [storeDetails, pet]);

  if (loading && !pet) return <div className="flex h-64 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-primary-600" /></div>;
  if (!pet) return <div className="py-16 text-center"><h2 className="text-xl font-black text-slate-900">Pet not found</h2><Link to="/pets" className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary-600 px-4 text-xs font-black text-white">Back to Pets</Link></div>;

  const quickFacts = [
    { icon: PawPrint, label: 'Species', value: pet.species },
    { icon: Sparkles, label: 'Breed', value: pet.breed },
    { icon: BadgeCheck, label: 'Sex', value: pet.gender },
    { icon: CalendarDays, label: 'Age', value: formatAge(pet) },
    pet.weight ? { icon: Scale, label: 'Weight', value: `${pet.weight} kg` } : null,
    pet.color ? { icon: Ruler, label: 'Color', value: pet.color } : null,
    { icon: Syringe, label: 'Vaccination', value: pet.vaccinationStatus === 'complete' ? 'Vaccinated' : pet.vaccinationStatus === 'partial' ? 'Partially vaccinated' : 'Not yet vaccinated' },
    pcciProvided ? { icon: ShieldCheck, label: 'PCCI', value: 'Information provided' } : null
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-2 pb-28 sm:px-5 lg:pb-12">
      <Link to="/pets" className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white hover:text-primary-700"><ArrowLeft className="h-4 w-4" />Back to Pets</Link>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[1.08fr_.92fr]">
          <div className="border-b border-slate-100 bg-slate-50 p-3 lg:border-b-0 lg:border-r">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-white">
              {mainImage ? <img src={getImageUrl(mainImage)} alt={pet.name} className="h-full w-full object-cover" onError={event => { event.currentTarget.src = '/images/placeholder-pet.png'; }} /> : <div className="flex h-full flex-col items-center justify-center text-slate-300"><Heart className="h-12 w-12" /><span className="mt-2 text-[10px] font-black uppercase">No photo available</span></div>}
              <div className="absolute left-3 top-3 flex flex-wrap gap-2"><span className="rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-primary-700 backdrop-blur">{pet.listingType === 'adoption' ? 'Adoption' : 'For Sale'}</span><span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur ${statusStyles[pet.status] || statusStyles.available}`}>{pet.status || 'available'}</span></div>
            </div>
            {pet.images?.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{pet.images.map((image, index) => <button key={`${image}-${index}`} type="button" onClick={() => setMainImage(image)} className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${mainImage === image ? 'border-primary-500' : 'border-white opacity-70'}`}><img src={getImageUrl(image)} alt={`${pet.name} view ${index + 1}`} className="h-full w-full object-cover" /></button>)}</div>}
          </div>

          <div className="flex flex-col p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-primary-600">{pet.species} · {pet.breed}</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{pet.name}</h1></div><button type="button" onClick={toggleFavorite} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${favorite ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} /></button></div>
            <div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{pet.listingType === 'adoption' ? 'Adoption Fee' : 'Price'}</p><p className="text-2xl font-black text-slate-950">₱{Number(pet.price || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</p></div>
            {pet.legacyGroupedListing && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">This historical grouped listing is unavailable while the seller reviews its individual pet records.</p>}
            {pet.availabilityNotes && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">{pet.availabilityNotes}</p>}
            <div className="mt-auto hidden gap-2 pt-6 sm:grid sm:grid-cols-2">
              <button type="button" onClick={handleChatSeller} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50"><MessageSquare className="h-4 w-4" />Chat Store</button>
              <button type="button" disabled={!isPurchasable} onClick={openInquiry} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 text-[10px] font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Package className="h-4 w-4" />{isPurchasable ? (pet.listingType === 'adoption' ? 'Adopt / Inquire' : 'Buy / Inquire') : (pet.status || 'Unavailable')}</button>
              {hasServices && <button type="button" onClick={() => navigate(`/services?store=${storeId}`)} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 text-[10px] font-black uppercase text-white"><CalendarDays className="h-4 w-4" />Book a Service</button>}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4"><h2 className="text-sm font-black text-slate-900">Quick Facts</h2><p className="text-[10px] text-slate-500">Important listing details at a glance</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{quickFacts.map(({ icon: Icon, label, value }) => <div key={label} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-primary-600"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="truncate text-[11px] font-bold capitalize text-slate-800">{value}</p></div></div>)}</div></section>

      <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-900">Description</h2><p className={`mt-3 whitespace-pre-line text-sm leading-6 text-slate-600 ${descriptionExpanded ? '' : 'line-clamp-5'}`}>{pet.description}</p>{pet.description?.length > 280 && <button type="button" onClick={() => setDescriptionExpanded(value => !value)} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase text-primary-700">{descriptionExpanded ? 'Show less' : 'Read more'}<ChevronDown className={`h-3 w-3 transition ${descriptionExpanded ? 'rotate-180' : ''}`} /></button>}</section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-900">Health Information</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase text-slate-400">Vaccination</p><p className="mt-1 text-xs font-bold text-slate-800">{pet.vaccinationStatus === 'complete' ? 'Vaccinated' : pet.vaccinationStatus === 'partial' ? 'Partially vaccinated' : 'Not yet vaccinated'}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase text-slate-400">Deworming</p><p className="mt-1 text-xs font-bold text-slate-800">{pet.dewormed ? 'Dewormed' : 'Not specified'}</p></div>{pet.healthCondition && pet.healthCondition !== 'healthy' && <div className="rounded-xl bg-amber-50 p-3 sm:col-span-2"><p className="text-[9px] font-black uppercase text-amber-700">Health condition disclosure</p><p className="mt-1 text-xs font-bold capitalize text-slate-800">{pet.healthCondition.replaceAll('_', ' ')}</p></div>}{pet.healthNotes && <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2"><p className="text-[9px] font-black uppercase text-slate-400">Health notes</p><p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-700">{pet.healthNotes}</p></div>}</div></section>

          {temperament.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-900">Temperament & Personality</h2><div className="mt-3 flex flex-wrap gap-2">{temperament.map(value => <span key={value} className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1.5 text-[10px] font-bold text-primary-700">{value}</span>)}</div></section>}

          {pcciProvided && <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-amber-700"><ShieldCheck className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-black text-slate-900">PCCI Registration Information Provided</h2><span className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black uppercase text-amber-800">Certificate available</span></div>{pet.pcciRegistration?.registrationNumber && <p className="mt-2 text-xs font-semibold text-slate-700">Certificate number: {pet.pcciRegistration.registrationNumber}</p>}<p className="mt-1 text-[10px] leading-4 text-slate-600">The uploaded certificate remains private. Ask the store if you need to review it before proceeding.</p></div></div></section>}
        </div>

        <aside className="space-y-5"><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"><Store className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-black text-slate-900">{store.name || 'Pet Store'}</h2>{store.verificationStatus === 'verified' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase text-emerald-700"><BadgeCheck className="h-3 w-3" />Verified Store</span>}</div><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><MapPin className="h-3 w-3" />{branch}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[8px] font-black uppercase text-slate-400">Store rating</p><p className="mt-1 flex items-center gap-1 text-xs font-black text-slate-800"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(store.ratings?.average || 0).toFixed(1)} <span className="font-medium text-slate-400">({store.ratings?.count || 0})</span></p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[8px] font-black uppercase text-slate-400">Response time</p><p className="mt-1 text-xs font-black text-slate-800">{store.stats?.responseTime || 'Not available'}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={handleChatSeller} className="h-9 rounded-xl border border-slate-200 text-[10px] font-black text-slate-700">Chat Store</button>{storeId ? <Link to={`/stores/${storeId}`} className="flex h-9 items-center justify-center rounded-xl bg-slate-900 text-[10px] font-black text-white">View Store</Link> : <span />}</div></section></aside>
      </div>

      {relatedPets.length > 0 && <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-base font-black text-slate-900">More from this store</h2><p className="text-[10px] text-slate-500">Similar available pets</p></div><Link to={`/stores/${storeId}`} className="text-[10px] font-black uppercase text-primary-700">View store</Link></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{relatedPets.map(item => <Link key={item._id} to={`/pets/${item._id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="aspect-square bg-slate-50">{item.images?.[0] ? <img src={getImageUrl(item.images[0])} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><PawPrint className="h-8 w-8 text-slate-200" /></div>}</div><div className="p-3"><p className="truncate text-xs font-black text-slate-900">{item.name}</p><p className="truncate text-[9px] font-semibold text-slate-500">{item.breed}</p><p className="mt-2 text-xs font-black text-primary-700">₱{Number(item.price || 0).toLocaleString()}</p></div></Link>)}</div></section>}

      <ReviewSection targetType="Pet" targetId={id} />
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,23,42,.12)] backdrop-blur sm:hidden"><button type="button" onClick={handleChatSeller} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase text-slate-700"><MessageSquare className="h-4 w-4" />Chat</button><button type="button" disabled={!isPurchasable} onClick={openInquiry} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 text-[10px] font-black uppercase text-white disabled:bg-slate-300"><Package className="h-4 w-4" />{isPurchasable ? (pet.listingType === 'adoption' ? 'Adopt' : 'Inquire') : 'Unavailable'}</button></div>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} onLogin={() => navigate('/login')} />
      <EnhancedChatMessenger isOpen={showChat} onClose={() => setShowChat(false)} pet={pet} seller={pet.addedBy ? { _id: pet.addedBy._id, firstName: pet.addedBy.firstName || pet.addedBy.username } : null} currentUser={user} />
      <InquiryModal isOpen={showInquiryModal} onClose={() => setShowInquiryModal(false)} pet={pet} onSubmit={handleInquirySubmit} />
    </div>
  );
};

export default PetDetail;
