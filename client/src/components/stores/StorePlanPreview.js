import React from 'react';
import { Check, Clock3, CreditCard } from 'lucide-react';

export const STORE_PLAN_PREVIEW = [
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

const StorePlanPreview = ({ plans = STORE_PLAN_PREVIEW }) => {
  const availablePlans = Array.isArray(plans) && plans.length ? plans : STORE_PLAN_PREVIEW;

  return (
    <section aria-labelledby="seller-plan-preview-title" className="overflow-hidden rounded-[2rem] border border-primary-200 bg-white shadow-xl shadow-slate-200/30">
      <div className="bg-slate-950 p-5 text-white sm:p-6">
        <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-primary-200"><CreditCard className="h-4 w-4" />Plans at a glance</p>
        <h2 id="seller-plan-preview-title" className="mt-2 text-xl font-black tracking-tight sm:text-2xl">See Pawzzle seller plans before you apply</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-300">This is a plan preview only. You do not choose or pay for a subscription during the store application. After approval, plan management remains inside your seller account settings.</p>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-[10px] leading-4 text-amber-100">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Approved stores begin with a one-month Pawzzle Growth trial. Pawzzle will remind you before it ends, and no plan is billed automatically.</span>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-3 sm:p-5">
        {availablePlans.filter(plan => ['starter', 'growth', 'professional'].includes(plan.id)).map(plan => (
          <article key={plan.id} className="relative rounded-2xl border border-slate-200 bg-white p-4">
            {plan.id === 'growth' && <span className="absolute right-3 top-3 rounded-full bg-primary-700 px-2 py-1 text-[7px] font-black uppercase tracking-wider text-white">Trial plan</span>}
            <h3 className="pr-16 text-base font-black text-slate-950">{plan.name}</h3>
            <p className="mt-1 min-h-[2.5rem] text-[10px] leading-4 text-slate-500">{plan.description}</p>
            <div className="mt-3">
              <strong className="text-xl font-black text-slate-950">{money(plan.monthlyPrice)}</strong><span className="ml-1 text-[8px] font-bold uppercase text-slate-400">/month</span>
              <p className="mt-1 text-[8px] font-bold text-slate-400">or {money(plan.annualPrice)} per year</p>
            </div>
            <ul className="mt-3 space-y-1.5">{(plan.features || []).slice(0, 4).map(feature => <li key={feature} className="flex gap-2 text-[9px] leading-4 text-slate-600"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{feature}</li>)}</ul>
          </article>
        ))}
      </div>
      <p className="border-t border-slate-100 px-5 py-4 text-center text-[10px] font-bold text-slate-500">Plan selection and payment are available later under Account settings, in Plan.</p>
    </section>
  );
};

export default StorePlanPreview;
