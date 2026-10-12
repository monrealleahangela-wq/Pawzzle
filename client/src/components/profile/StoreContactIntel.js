import React from 'react';
import { Mail, Phone } from 'lucide-react';

const CONTACTS = [
  { key: 'phone', label: 'Phone', icon: Phone, href: value => `tel:${value}` },
  { key: 'email', label: 'Email', icon: Mail, href: value => `mailto:${value}` }
];

const StoreContactIntel = ({ contactInfo = {} }) => (
  <div className="space-y-3 sm:space-y-4" data-testid="store-contact-intel">
    {CONTACTS.map(({ key, label, icon: Icon, href }) => {
      const value = typeof contactInfo?.[key] === 'string' ? contactInfo[key].trim() : '';
      const content = (
        <>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/10 transition-colors group-hover:bg-primary-600 sm:h-11 sm:w-11">
            <Icon aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
            <span className={`mt-0.5 block text-sm font-semibold leading-snug ${value ? 'break-words text-slate-100' : 'text-slate-400'}`}>
              {value || 'Not provided'}
            </span>
          </span>
        </>
      );

      return value ? (
        <a key={key} href={href(value)} className="group flex min-w-0 items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
          {content}
        </a>
      ) : (
        <div key={key} aria-label={`${label} not provided`} className="group flex min-w-0 items-center gap-3 rounded-xl px-1 py-1.5">
          {content}
        </div>
      );
    })}
  </div>
);

export default StoreContactIntel;
