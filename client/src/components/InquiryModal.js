import React, { useState } from 'react';
import { X, ClipboardCheck, Info, Calendar, MapPin, User, Phone, Heart } from 'lucide-react';
import { toast } from 'react-toastify';

const InquiryModal = ({ isOpen, onClose, pet, onSubmit }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    contactNumber: '',
    cityArea: '',
    preferredPickupDate: '',
    interestReason: '',
    previousExperience: '',
    pickupConfirmation: false
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
    if (!formData.pickupConfirmation) {
      toast.error('Please confirm that you understand this is for pickup only.');
      return;
    }
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-scale-up border border-slate-100 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 p-5 sm:p-6 flex items-center justify-between relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <h2 className="text-white text-lg sm:text-xl font-black uppercase tracking-tight">Purchase Inquiry</h2>
            <p className="text-primary-400 text-[9px] font-black uppercase tracking-widest mt-0.5 italic">For {pet.name} • {pet.breed}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10 text-white">
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
