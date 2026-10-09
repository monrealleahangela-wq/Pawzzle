import React, { useId, useRef } from 'react';
import { LogOut, X } from 'lucide-react';
import ModalViewport from '../ui/ModalViewport';

const LogoutModal = ({ isOpen, onClose, onConfirm }) => {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef(null);
  if (!isOpen) return null;

  return (
    <ModalViewport onClose={onClose} initialFocusRef={cancelRef} className="z-[1100] p-3 sm:p-4">
      {/* Modal Card */}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-white bg-white text-center shadow-2xl animate-scale-in sm:max-h-[calc(100dvh-2rem)] sm:rounded-[3rem]"
      >
        {/* Close Button - Optional but good for UX */}
        <button 
          onClick={onClose}
          aria-label="Close logout confirmation"
          className="absolute right-4 top-4 z-10 p-2 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-full transition-colors sm:right-6 sm:top-6"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="min-h-0 overflow-y-auto px-6 pb-5 pt-7 sm:px-10 sm:pb-6 sm:pt-10">
          {/* Icon Header */}
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 transition-transform hover:rotate-3 sm:mb-6 sm:h-20 sm:w-20">
            <LogOut className="h-8 w-8 sm:h-9 sm:w-9" />
          </div>

          {/* Content */}
          <h2 id={titleId} className="mb-3 text-2xl font-black uppercase leading-none tracking-tighter text-slate-900 sm:text-3xl">
            Logout
          </h2>
          <p id={descriptionId} className="mx-auto max-w-[240px] text-[10px] font-black uppercase leading-relaxed tracking-[0.2em] text-slate-400">
            Are you sure you want to logout?
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full shrink-0 space-y-2.5 border-t border-slate-100 bg-white px-6 pb-6 pt-4 sm:px-10 sm:pb-8">
          <button
            onClick={onConfirm}
            className="min-h-11 w-full rounded-2xl bg-rose-600 px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.3em] text-white shadow-xl shadow-rose-200 transition-all hover:bg-rose-700 active:scale-[0.98]"
          >
            Logout
          </button>
          
          <button
            ref={cancelRef}
            onClick={onClose}
            className="min-h-11 w-full rounded-2xl bg-slate-50 px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]"
          >
            Cancel
          </button>
        </div>
      </section>
    </ModalViewport>
  );
};

export default LogoutModal;
