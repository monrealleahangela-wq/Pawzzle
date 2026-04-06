import React from 'react';
import { LogOut, X } from 'lucide-react';

const LogoutModal = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div className="relative bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl border border-white animate-scale-in flex flex-col items-center text-center">
        {/* Close Button - Optional but good for UX */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-full transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon Header */}
        <div className="w-24 h-24 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mb-8 transform hover:rotate-3 transition-transform">
          <LogOut className="h-10 w-10" />
        </div>

        {/* Content */}
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4 leading-none">
          Logout
        </h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-12 leading-relaxed max-w-[200px]">
          Are you sure you want to sign out of Pawzzle?
        </p>

        {/* Action Buttons */}
        <div className="w-full space-y-3">
          <button
            onClick={onConfirm}
            className="w-full py-5 bg-rose-600 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] shadow-xl shadow-rose-200 hover:bg-rose-700 active:scale-[0.98] transition-all"
          >
            Yes, Sign Out
          </button>
          
          <button
            onClick={onClose}
            className="w-full py-5 bg-slate-50 text-slate-400 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutModal;
