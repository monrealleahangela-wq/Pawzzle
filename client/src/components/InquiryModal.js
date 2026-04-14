import React, { useState } from 'react';
import { X, ClipboardCheck, Info, Calendar, MapPin, User, Phone, Heart, Wallet, CheckCircle2, Zap } from 'lucide-react';
import { toast } from 'react-toastify';

const InquiryModal = ({ isOpen, onClose, pet, onSubmit }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    contactNumber: '',
    cityArea: '',
    preferredPickupDate: '',
    interestReason: '',
    previousExperience: '',
    pickupConfirmation: false,
    paymentMethod: ''
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate that the preferred pickup date is not in the past
    const selectedDate = new Date(formData.preferredPickupDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      toast.error('Please select today or a future date only');
      return;
    }

    if (!formData.paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }

    if (!formData.pickupConfirmation) {
      toast.error('Please confirm that you understand this is for pickup only.');
      return;
    }
    onSubmit(formData);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-scale-up border border-slate-100 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 p-5 sm:p-6 flex items-center justify-between relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-white text-lg sm:text-xl font-black uppercase tracking-tight">Purchase Inquiry</h2>
            <p className="text-primary-400 text-[9px] font-black uppercase tracking-widest mt-0.5 italic">For {pet.name} • {pet.breed}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-20 text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-5 sm:p-6 overflow-y-auto scrollbar-hide">
          <form id="inquiry-form" onSubmit={handleSubmit} className="space-y-4">
            
            {/* Identity Group */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  <User className="h-3 w-3" /> Full Name
                </label>
                <input
                  required
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary-500/20 focus:bg-white transition-all outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  <Phone className="h-3 w-3" /> Contact Number
                </label>
                <input
                  required
                  name="contactNumber"
                  value={formData.contactNumber}
                  onChange={handleChange}
                  placeholder="09XX XXX XXXX"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary-500/20 focus:bg-white transition-all outline-none"
                />
              </div>
            </div>

            {/* Logistics Group */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  <MapPin className="h-3 w-3" /> City / Area
                </label>
                <input
                  required
                  name="cityArea"
                  value={formData.cityArea}
                  onChange={handleChange}
                  placeholder="e.g. Dasmariñas, Cavite"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary-500/20 focus:bg-white transition-all outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  <Calendar className="h-3 w-3" /> Preferred Pickup Date
                </label>
                <input
                  required
                  type="date"
                  name="preferredPickupDate"
                  min={todayStr}
                  value={formData.preferredPickupDate}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary-500/20 focus:bg-white transition-all outline-none"
                />
              </div>
            </div>

            {/* Experience Group */}
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                <Heart className="h-3 w-3" /> Why are you interested?
              </label>
              <textarea
                required
                name="interestReason"
                rows="2"
                value={formData.interestReason}
                onChange={handleChange}
                placeholder="Share your story or intention for this pet..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary-500/20 focus:bg-white transition-all outline-none resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                <ClipboardCheck className="h-3 w-3" /> Previous Experience with Pets?
              </label>
              <textarea
                required
                name="previousExperience"
                rows="2"
                value={formData.previousExperience}
                onChange={handleChange}
                placeholder="Mention any pets you've owned or currently have..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary-500/20 focus:bg-white transition-all outline-none resize-none"
              />
            </div>

            {/* Payment Section */}
            <div className="bg-slate-900 rounded-[2rem] p-6 text-white space-y-6 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <Wallet className="h-4 w-4 text-primary-400" />
                     <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Settlement Settings</h3>
                  </div>
                  <span className="text-[9px] font-black text-primary-400 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">
                    {pet.paymentConfig === 'deposit_first' ? 'RESERVATION REQUIRED' : 
                     pet.paymentConfig === 'cash_on_pickup_only' ? 'CASH AT PICKUP' : 'FULL PAYMENT REQUIRED'}
                  </span>
               </div>

               {/* Pricing Breakdown */}
               <div className="grid grid-cols-1 gap-2 p-4 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Total Valuation</span>
                    <span className="text-sm font-black text-white">₱{pet.price?.toLocaleString()}</span>
                  </div>
                  {pet.paymentConfig === 'deposit_first' && (
                    <>
                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-[9px] font-black text-primary-400 uppercase tracking-widest">Deposit Amount</span>
                        <span className="text-sm font-black text-primary-400">₱{pet.depositAmount?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest italic">Balance Due at Pickup</span>
                        <span className="text-[11px] font-black text-white/60 italic">₱{(pet.price - (pet.depositAmount || 0)).toLocaleString()}</span>
                      </div>
                    </>
                  )}
               </div>

               {/* Payment Methods Grid */}
               <div className="space-y-2">
                  <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Preferred Settlement Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(pet.allowedPaymentMethods || ['gcash', 'maya', 'bank_transfer', 'cash_on_pickup']).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, paymentMethod: m }))}
                        className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                          formData.paymentMethod === m 
                            ? 'bg-primary-600 border-primary-500 text-white shadow-lg' 
                            : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest">{m.replace(/_/g, ' ')}</span>
                        {formData.paymentMethod === m && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </button>
                    ))}
                  </div>
               </div>
            </div>

            {/* Confirmation Toggle */}
            <label className="flex items-start gap-3 p-3 bg-primary-50 rounded-2xl border border-primary-100 cursor-pointer group hover:bg-primary-100 transition-all">
              <div className="relative flex items-center mt-0.5">
                <input
                  type="checkbox"
                  name="pickupConfirmation"
                  checked={formData.pickupConfirmation}
                  onChange={handleChange}
                  className="w-5 h-5 rounded-md border-primary-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-primary-900 uppercase tracking-wider">I understand this is Pickup-Only</p>
                <p className="text-[8px] font-bold text-primary-600 tracking-tight leading-relaxed">
                  I agree to coordinate directly with the seller for a safe physical handover. Pawzzle strictly enforces pickup for pet safety.
                </p>
              </div>
            </label>
          </form>
        </div>

        {/* Action Footer */}
        <div className="p-5 sm:p-6 bg-slate-50 border-t border-slate-100 shrink-0">
          <button
            form="inquiry-form"
            type="submit"
            className="w-full py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-primary-600 transition-all transform active:scale-[0.98]"
          >
            Submit Professional Inquiry
          </button>
          <p className="text-center text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-3">
            Submission creates a structured thread for seller review.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InquiryModal;
