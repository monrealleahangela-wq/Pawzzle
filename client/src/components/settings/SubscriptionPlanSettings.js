import React, { useEffect, useState } from 'react';
import { AlertCircle, Building2, Check, Crown, Package, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { storeService } from '../../services/apiService';

const money = value => Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

const UsageBar = ({ icon: Icon, label, value, limit }) => {
  const unlimited = limit === null;
  const percent = unlimited ? 0 : Math.min(100, Math.round((Number(value || 0) / Math.max(1, limit)) * 100));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><Icon className="h-4 w-4 text-primary-600" />{label}</span>
        <span className="text-sm font-black text-slate-900 dark:text-white">{value} / {unlimited ? 'Unlimited' : limit}</span>
      </div>
      {!unlimited && <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${percent}%` }} /></div>}
    </div>
  );
};

const SubscriptionPlanSettings = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    storeService.getMySubscription()
      .then(response => { if (active) setData(response.data); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.message || 'Unable to load the store plan.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-sm font-bold text-slate-500">Loading plan and usage...</div>;
  if (error) return <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>;

  const { subscription, plans } = data;
  return (
    <section className="space-y-5 animate-in slide-in-from-right-4">
      <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-primary-300"><Crown className="h-4 w-4" />Current store plan</div>
            <h2 className="text-3xl font-black">{subscription.plan.name}</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-300">{subscription.plan.description}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left sm:text-right">
            <div className="text-2xl font-black">{money(subscription.plan.monthlyPrice)}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">per month</div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <UsageBar icon={Package} label="Active listings" value={subscription.usage.activeListings} limit={subscription.allowances.listings} />
          <UsageBar icon={Users} label="Active staff" value={subscription.usage.activeStaff} limit={subscription.allowances.staff} />
        </div>
      </div>

      <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-4 text-sm text-slate-700 dark:border-primary-900 dark:bg-primary-950/30 dark:text-slate-200">
        <div className="flex items-start gap-3"><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" /><div><strong>{subscription.allowances.locations} store location{subscription.allowances.locations === 1 ? '' : 's'} included.</strong> Pawzzle currently operates one inventory and staff location per store account. Additional branch activation will be introduced only with separate branch inventory, staff, and delivery controls so records never mix.</div></div>
      </div>

      <div>
        <div className="mb-4 flex items-end justify-between gap-4"><div><h3 className="text-xl font-black text-slate-900 dark:text-white">Compare plans</h3><p className="text-sm text-slate-500">Security, verification, FDA review, and payment protection remain available on every plan.</p></div><Sparkles className="h-6 w-6 text-primary-600" /></div>
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map(plan => {
            const current = plan.id === subscription.tier;
            return <article key={plan.id} className={`rounded-[1.75rem] border p-5 ${current ? 'border-primary-500 bg-primary-50/60 shadow-md dark:bg-primary-950/20' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
              <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h4 className="text-xl font-black text-slate-900 dark:text-white">{plan.name}</h4>{current && <span className="rounded-full bg-primary-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">Current</span>}</div><p className="mt-1 text-sm text-slate-500">{plan.description}</p></div><div className="text-right"><div className="text-lg font-black text-slate-900 dark:text-white">{money(plan.monthlyPrice)}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">monthly</div></div></div>
              <ul className="mt-5 space-y-2.5">{plan.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{feature}</li>)}</ul>
            </article>;
          })}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" /><p>Plan changes are activated by Pawzzle after billing and account review. Existing listings are never deleted on downgrade; a store above its allowance must hide listings before publishing new ones.</p></div>
    </section>
  );
};

export default SubscriptionPlanSettings;
