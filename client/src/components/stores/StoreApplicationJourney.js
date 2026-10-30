import React from 'react';
import {
  BadgeCheck,
  Building2,
  Check,
  ClipboardCheck,
  FileCheck2,
  MapPin,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound
} from 'lucide-react';

export const STORE_APPLICATION_JOURNEY = Object.freeze([
  { key: 'account', label: 'Account', description: 'Create login', icon: UserRound },
  { key: 'verify', label: 'Verify', description: 'Confirm email', icon: BadgeCheck },
  { key: 'overview', label: 'Overview', description: 'Review process', icon: ClipboardCheck, applicationStep: 0 },
  { key: 'business', label: 'Business', description: 'Store identity', icon: Building2, applicationStep: 1 },
  { key: 'owner', label: 'Owner & Team', description: 'People and roles', icon: UsersRound, applicationStep: 2 },
  { key: 'location', label: 'Location & Tax', description: 'Address and BIR', icon: MapPin, applicationStep: 3 },
  { key: 'documents', label: 'Documents', description: 'Compliance files', icon: FileCheck2, applicationStep: 4 },
  { key: 'review', label: 'Review', description: 'References and declaration', icon: ShieldCheck, applicationStep: 5 }
]);

export const storeApplicationStageForStep = step => (
  STORE_APPLICATION_JOURNEY.find(stage => stage.applicationStep === step)?.key || 'overview'
);

const requirements = [
  'Verified Pawzzle account',
  'DTI or SEC registration',
  'Confirmed store map location',
  'BIR details when registered',
  'Two business references'
];

const StoreApplicationJourney = ({
  activeStage = 'account',
  accountComplete = false,
  onStageSelect
}) => {
  const activeIndex = Math.max(0, STORE_APPLICATION_JOURNEY.findIndex(stage => stage.key === activeStage));

  return (
    <section className="overflow-hidden rounded-[2rem] border border-primary-100 bg-white shadow-xl shadow-slate-200/40 sm:rounded-[2.5rem]">
      <div className="relative overflow-hidden bg-slate-950 px-5 py-7 text-white sm:px-8 sm:py-9 lg:px-10">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary-600/30 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-primary-300/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.24em] text-primary-100">
              <Store className="h-3.5 w-3.5" /> Pawzzle Seller Network
            </div>
            <h1 className="!text-white text-3xl font-black uppercase leading-[0.95] tracking-[-0.045em] sm:text-5xl">
              Build a trusted <span className="!text-primary-200">pet business.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-slate-300">
              Create your seller account, submit one complete store application, and follow the same verified onboarding process from registration through platform review.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-wider sm:flex">
            <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">One application</span>
            <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Manual review</span>
            <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Saved progress</span>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 bg-white px-3 py-4 sm:px-5">
        <div className="flex snap-x gap-2 overflow-x-auto pb-1" aria-label="Store application progress">
          {STORE_APPLICATION_JOURNEY.map((stage, index) => {
            const isActive = index === activeIndex;
            const isComplete = index < activeIndex || (accountComplete && index < 2);
            const canSelect = Boolean(onStageSelect && Number.isInteger(stage.applicationStep));
            const Element = canSelect ? 'button' : 'div';
            return (
              <Element
                key={stage.key}
                {...(canSelect ? { type: 'button', onClick: () => onStageSelect(stage.applicationStep) } : {})}
                aria-current={isActive ? 'step' : undefined}
                className={`flex min-w-[142px] snap-start items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all sm:min-w-[158px] ${
                  isActive
                    ? 'border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-200'
                    : isComplete
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
                      : 'border-slate-100 bg-slate-50 text-slate-500'
                } ${canSelect ? 'cursor-pointer hover:-translate-y-0.5 hover:border-primary-300' : ''}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-white/15' : isComplete ? 'bg-emerald-600 text-white' : 'bg-white'}`}>
                  {isComplete && !isActive ? <Check className="h-4 w-4" /> : <stage.icon className="h-4 w-4" />}
                </span>
                <span>
                  <span className="block text-[9px] font-black uppercase tracking-widest">{stage.label}</span>
                  <span className={`mt-0.5 block text-[8px] font-bold ${isActive ? 'text-white/70' : 'text-current opacity-60'}`}>{stage.description}</span>
                </span>
              </Element>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 bg-primary-50/60 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5">
        {requirements.map((requirement, index) => (
          <div key={requirement} className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-white px-3 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-[9px] font-black text-primary-700">{index + 1}</span>
            <span className="text-[9px] font-black uppercase leading-tight tracking-wide text-slate-700">{requirement}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default StoreApplicationJourney;
