import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, CheckCircle2, MapPin, Phone, ShieldCheck, Store, User, Wallet, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { formatPeso } from '../utils/paymentSummary';
import { normalizeRefundPolicy, refundPolicyLabel, requiresRefundAcknowledgment } from '../utils/refundPolicy';
import './PetPurchaseModal.css';

const createPurchaseRequestId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `pet_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const localDateValue = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PetPurchaseModal = ({ isOpen, onClose, pet, store, buyer, onSubmit, submitting = false }) => {
  const [formData, setFormData] = useState({
    fullName: '', contactNumber: '', cityArea: '', preferredPickupDate: '',
    pickupConfirmation: false, refundPolicyAcknowledged: false,
    paymentMethod: 'paymongo', purchaseRequestId: createPurchaseRequestId()
  });

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      fullName: [buyer?.firstName, buyer?.lastName].filter(Boolean).join(' '),
      contactNumber: buyer?.phone || buyer?.contactNumber || '',
      cityArea: buyer?.address?.city || '',
      preferredPickupDate: '',
      pickupConfirmation: false,
      refundPolicyAcknowledged: false,
      paymentMethod: 'paymongo',
      purchaseRequestId: createPurchaseRequestId()
    });
  }, [isOpen, pet?._id, buyer?.firstName, buyer?.lastName, buyer?.phone, buyer?.contactNumber, buyer?.address?.city]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !submitting) onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, submitting]);

  const refundPolicy = useMemo(() => normalizeRefundPolicy(store?.refundPolicy), [store?.refundPolicy]);
  const acknowledgmentRequired = requiresRefundAcknowledgment(refundPolicy);
  if (!isOpen || !pet) return null;

  const price = Number(pet.price || 0);
  const deposit = pet.paymentConfig === 'deposit_first' ? Number(pet.depositAmount || 0) : 0;
  const dueNow = deposit > 0 ? deposit : price;
  const balanceAtPickup = Math.max(price - dueNow, 0);
  const isReservation = pet.paymentConfig === 'deposit_first';
  const storeAddress = store?.contactInfo?.address || {};
  const pickupLocation = [storeAddress.barangay, storeAddress.city, storeAddress.state].filter(Boolean).join(', ');

  const handleChange = event => {
    const { name, value, type, checked } = event.target;
    setFormData(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = event => {
    event.preventDefault();
    const selectedDate = new Date(`${formData.preferredPickupDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!formData.preferredPickupDate || Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
      toast.error('Please select today or a future pickup date.');
      return;
    }
    if (!formData.pickupConfirmation) {
      toast.error('Please acknowledge the pickup-only condition.');
      return;
    }
    if (acknowledgmentRequired && !formData.refundPolicyAcknowledged) {
      toast.error(`Please acknowledge the ${refundPolicyLabel(refundPolicy.type)} policy.`);
      return;
    }
    onSubmit({
      ...formData,
      fullName: formData.fullName.trim(),
      contactNumber: formData.contactNumber.trim(),
      cityArea: formData.cityArea.trim(),
      refundPolicyAcknowledged: acknowledgmentRequired ? formData.refundPolicyAcknowledged : false
    });
  };

  return createPortal(
    <div className="pet-purchase-modal fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true" aria-labelledby="pet-checkout-title">
      <div className="pet-purchase-modal__panel flex w-full max-w-2xl flex-col overflow-hidden border-slate-100 bg-white shadow-2xl sm:border">
        <header className="pet-purchase-modal__header relative flex shrink-0 items-start justify-between overflow-hidden bg-slate-950 px-5 pb-4 text-white sm:p-6">
          <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary-500/20 blur-3xl" />
          <div className="relative">
            <p className="text-[9px] font-black uppercase tracking-[.2em] text-primary-300">Secure PayMongo checkout</p>
            <h2 id="pet-checkout-title" className="pet-purchase-modal__hero-title mt-1 text-xl font-black tracking-tight sm:text-2xl">
              {isReservation ? 'Reserve Pet' : 'Pet Purchase Checkout'}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-300">{pet.name} · {pet.breed || pet.species}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close pet checkout" className="pet-purchase-modal__close relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>

        <form id="pet-purchase-form" onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_.82fr]">
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700 shadow-sm"><Store className="h-4 w-4" /></span>
                  <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Seller / Store</p><p className="mt-1 text-sm font-black text-slate-900">{store?.name || 'Pet Store'}</p>{pickupLocation && <p className="mt-1 flex items-start gap-1 text-[10px] text-slate-500"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{pickupLocation}</p>}</div>
                </div>
              </section>

              <section>
                <h3 className="pet-purchase-modal__section-title pet-purchase-modal__section-title--light text-[10px] font-black uppercase tracking-widest text-slate-500">Buyer information</h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500"><span className="flex items-center gap-1.5"><User className="h-3 w-3" />Full name</span><input required name="fullName" autoComplete="name" maxLength="160" value={formData.fullName} onChange={handleChange} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-primary-500" /></label>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500"><span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />Contact number</span><input required name="contactNumber" autoComplete="tel" maxLength="40" value={formData.contactNumber} onChange={handleChange} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-primary-500" /></label>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500"><span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />City / Area</span><input required name="cityArea" autoComplete="address-level2" maxLength="200" value={formData.cityArea} onChange={handleChange} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-primary-500" /></label>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500"><span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />Preferred pickup</span><input required type="date" name="preferredPickupDate" min={localDateValue(new Date())} value={formData.preferredPickupDate} onChange={handleChange} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-primary-500" /></label>
                </div>
              </section>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50 p-3">
                <input required type="checkbox" name="pickupConfirmation" checked={formData.pickupConfirmation} onChange={handleChange} className="mt-0.5 h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500" />
                <span><strong className="block text-[10px] font-black uppercase tracking-wider text-primary-900">Pickup only</strong><span className="mt-0.5 block text-[9px] leading-4 text-primary-700">I understand that this pet must be collected from the seller at an agreed safe handover time and location.</span></span>
              </label>
            </div>

            <div className="space-y-4">
              <section className="rounded-2xl bg-slate-950 p-4 text-white">
                <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary-300" /><h3 className="pet-purchase-modal__section-title pet-purchase-modal__section-title--dark text-[10px] font-black uppercase tracking-[.18em]">Payment summary</h3></div>
                <dl className="mt-4 space-y-2 text-[10px]">
                  <div className="flex justify-between gap-3 text-slate-300"><dt>Listed price</dt><dd className="font-bold text-white">{formatPeso(price)}</dd></div>
                  <div className="flex justify-between gap-3 text-slate-300"><dt>Additional charges</dt><dd className="font-bold text-white">{formatPeso(0)}</dd></div>
                  <div className="flex justify-between gap-3 border-t border-white/10 pt-2"><dt className="font-black uppercase tracking-wider">Total</dt><dd className="font-black">{formatPeso(price)}</dd></div>
                  <div className="flex justify-between gap-3 rounded-xl bg-white/10 p-2.5"><dt className="font-black text-primary-200">Due now</dt><dd className="font-black text-primary-200">{formatPeso(dueNow)}</dd></div>
                  {isReservation && <div className="flex justify-between gap-3 text-slate-300"><dt>Balance due at pickup</dt><dd className="font-bold text-white">{formatPeso(balanceAtPickup)}</dd></div>}
                </dl>
                <p className="mt-3 flex items-center gap-1.5 text-[9px] text-slate-300"><CheckCircle2 className="h-3 w-3 text-emerald-400" />Payment method: PayMongo</p>
              </section>

              <section className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary-700" /><h3 className="pet-purchase-modal__section-title pet-purchase-modal__section-title--light text-[10px] font-black uppercase tracking-widest text-slate-900">{refundPolicyLabel(refundPolicy.type)} policy</h3></div>
                <p className="mt-2 text-[10px] leading-4 text-slate-600">{refundPolicy.summary}</p>
                {refundPolicy.conditions && <p className="mt-2 text-[9px] leading-4 text-slate-500">Conditions: {refundPolicy.conditions}</p>}
                {acknowledgmentRequired && <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-rose-50 p-2.5 text-[9px] font-semibold leading-4 text-rose-800"><input required type="checkbox" name="refundPolicyAcknowledged" checked={formData.refundPolicyAcknowledged} onChange={handleChange} className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500" /><span>I have read and acknowledge this Store's no-refund policy.</span></label>}
              </section>

              <p className="rounded-xl bg-amber-50 p-3 text-[9px] leading-4 text-amber-800">Payment starts a {isReservation ? 'reservation' : 'purchase'} record. The pet is not marked sold until PayMongo confirms payment and the required seller/pickup steps are completed.</p>
            </div>
          </div>
        </form>

        <footer className="pet-purchase-modal__footer shrink-0 border-t border-slate-200 bg-white px-4 pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:px-6 sm:pt-4">
          <button form="pet-purchase-form" type="submit" disabled={submitting} className="flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-[10px] font-black uppercase tracking-[.16em] text-white shadow-lg transition hover:bg-primary-700 disabled:cursor-wait disabled:bg-slate-400">
            {submitting ? 'Preparing secure checkout…' : 'Proceed to Payment'}
          </button>
          <p className="mt-2 text-center text-[8px] font-semibold text-slate-400">Availability, seller, Store, and price are rechecked by Pawzzle before payment.</p>
        </footer>
      </div>
    </div>,
    document.body
  );
};

export default PetPurchaseModal;
