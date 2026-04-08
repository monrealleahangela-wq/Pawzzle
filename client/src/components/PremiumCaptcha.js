import React, { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';

const PremiumCaptcha = ({ onVerify, theme = 'light' }) => {
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleVerify = () => {
    if (verified || loading) return;
    setLoading(true);
    // Simulate a brief "security check" animation for premium feel
    setTimeout(() => {
      setVerified(true);
      setLoading(false);
      if (onVerify) onVerify('manual_verification_success');
    }, 800);
  };

  return (
    <div 
      onClick={handleVerify}
      className={`w-full max-w-[304px] h-[78px] rounded-2xl border transition-all duration-300 flex items-center px-4 cursor-pointer select-none group
        ${verified 
          ? 'bg-emerald-50/50 border-emerald-200' 
          : 'bg-white border-slate-100 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-500/5'
        }`}
    >
      <div className="relative">
        <div className={`w-8 h-8 rounded-xl border-2 transition-all duration-500 flex items-center justify-center
          ${verified 
            ? 'bg-emerald-500 border-emerald-500 scale-110' 
            : 'bg-slate-50 border-slate-200 group-hover:border-primary-400 group-hover:bg-white'
          }`}
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          ) : verified ? (
            <Check className="text-white h-5 w-5 animate-pop" strokeWidth={4} />
          ) : null}
        </div>
      </div>

      <div className="ml-4 flex-1">
        <p className={`text-sm font-black tracking-tight transition-colors duration-300
          ${verified ? 'text-emerald-700' : 'text-slate-600 group-hover:text-primary-600'}`}>
          {verified ? 'Identity Verified' : 'I am not a robot'}
        </p>
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
          Secure Human Check
        </p>
      </div>

      <div className="flex flex-col items-center opacity-40 group-hover:opacity-100 transition-opacity">
        <ShieldCheck className={`h-6 w-6 ${verified ? 'text-emerald-500' : 'text-primary-500'}`} />
        <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter mt-1">PAWZZLE SECURE</span>
      </div>
    </div>
  );
};

export default PremiumCaptcha;
