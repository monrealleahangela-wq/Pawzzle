import React from 'react';
import { Check, Clock3, CreditCard, ShieldCheck } from 'lucide-react';

export const FALLBACK_STORE_SUBSCRIPTION_PLANS = [
  {
    id: 'starter', name: 'Pawzzle Starter', monthlyPrice: 299, annualPrice: 3049,
    description: 'Start selling and managing your pet business online.',
    features: ['30 active listings', 'Up to 2 staff accounts', 'Inventory and low-stock alerts', 'Supplier catalog and restocking']
  },
  {
    id: 'growth', name: 'Pawzzle Growth', monthlyPrice: 699, annualPrice: 7129,
    description: 'Grow your store with inventory, staffing, and sales tools.',
    features: ['70 active listings', 'Up to 8 staff accounts', 'Product variants and promotions', 'Advanced reports and scheduling']
  },
  {
    id: 'professional', name: 'Pawzzle Professional', monthlyPrice: 1499, annualPrice: 15289,
    description: 'Complete operations and reporting for established pet businesses.',
    features: ['Unlimited active listings', 'Up to 25 staff accounts', 'Payroll and detailed analytics', 'Priority marketplace placement and support']
  }
];

const money = value => Number(value || 0).toLocaleString('en-PH', {
  style: 'currency', currency: 'PHP', maximumFractionDigits: 0
});

const StoreApplicationSubscriptionChoice = ({ plans, value, onChange, error }) => {
  const availablePlans = Array.isArray(plans) && plans.length ? plans : FALLBACK_STORE_SUBSCRIPTION_PLANS;
  const selectedTier = value?.tier || 'growth';
  const billingInterval = value?.billingInterval || 'monthly';
  const select = patch => onChange({ ...value, ...patch });

  return (
    <section data-field="subscriptionPreference" className={`overflow-hidden rounded-[1.75rem] border bg-white ${error ? 'border-rose-300 ring-2 ring-rose-100' : 'border-primary-200'}`}>
      <div className="bg-slate-950 p-5 text-white sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-primary-300"><CreditCard className="h-4 w-4" />Pawzzle subscription</p>
            <h3 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">Choose the plan you prefer after your trial</h3>
            <p className="mt-2 text-xs leading-5 text-slate-300">Approved stores receive a 30-day Pawzzle Growth trial. There is no charge today and Pawzzle will not bill you automatically.</p>
          </div>
          <div data-field="subscriptionPreference.billingInterval" tabIndex="-1" className="flex shrink-0 rounded-xl bg-white/10 p-1" aria-label="Subscription billing interval">
            {['monthly', 'annual'].map(interval => (
              <button key={interval} type="button" aria-pressed={billingInterval === interval} onClick={() => select({ billingInterval: interval })} className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wider ${billingInterval === interval ? 'bg-white text-slate-950 shadow' : 'text-slate-300'}`}>
                {interval === 'monthly' ? 'Monthly' : 'Annual · save ~15%'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-[10px] leading-4 text-amber-100">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Before the trial ends, Pawzzle will remind you to complete payment. Without confirmed payment, seller access is temporarily suspended, the store is placed on vacation, and listings are hidden until a plan is paid.</span>
        </div>
      </div>

      <div data-field="subscriptionPreference.tier" tabIndex="-1" className="grid gap-3 p-4 lg:grid-cols-3 sm:p-5">
        {availablePlans.filter(plan => ['starter', 'growth', 'professional'].includes(plan.id)).map(plan => {
          const selected = plan.id === selectedTier;
          const price = billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
          return (
            <button key={plan.id} type="button" aria-pressed={selected} onClick={() => select({ tier: plan.id })} className={`relative rounded-2xl border p-4 text-left transition-all ${selected ? 'border-primary-600 bg-primary-50 shadow-md' : 'border-slate-200 bg-white hover:border-primary-300'}`}>
              {plan.id === 'growth' && <span className="absolute right-3 top-3 rounded-full bg-primary-700 px-2 py-1 text-[7px] font-black uppercase tracking-wider text-white">Trial plan</span>}
              <h4 className="pr-16 text-base font-black text-slate-950">{plan.name}</h4>
              <p className="mt-1 min-h-[2.5rem] text-[10px] leading-4 text-slate-500">{plan.description}</p>
              <div className="mt-3"><strong className="text-xl font-black text-slate-950">{money(price)}</strong><span className="ml-1 text-[8px] font-bold uppercase text-slate-400">/{billingInterval === 'annual' ? 'year' : 'month'}</span></div>
              <ul className="mt-3 space-y-1.5">{(plan.features || []).slice(0, 4).map(feature => <li key={feature} className="flex gap-2 text-[9px] leading-4 text-slate-600"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{feature}</li>)}</ul>
              <span className={`mt-4 flex items-center justify-center rounded-xl py-2 text-[9px] font-black uppercase tracking-wider ${selected ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{selected ? 'Selected plan' : `Choose ${plan.name.replace('Pawzzle ', '')}`}</span>
            </button>
          );
        })}
      </div>

      <label className="mx-4 mb-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:mx-5 sm:mb-5">
        <input data-field="subscriptionPreference.trialAcknowledged" aria-invalid={Boolean(error)} type="checkbox" className="mt-0.5" checked={value?.trialAcknowledged === true} onChange={event => select({ trialAcknowledged: event.target.checked })} />
        <span className="min-w-0 flex-1 text-[10px] font-semibold leading-5 text-slate-700"><strong className="flex items-center gap-1.5 text-xs text-slate-900"><ShieldCheck className="h-4 w-4 text-primary-700" />I understand the trial and payment terms.</strong> My selected plan is a preference only. I will choose whether to pay through Pawzzle after approval and before the trial ends.</span>
      </label>
      {error && <p className="px-5 pb-5 text-xs font-bold text-rose-700">{error}</p>}
    </section>
  );
};

export default StoreApplicationSubscriptionChoice;
