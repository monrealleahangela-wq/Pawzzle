import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Clock3, CreditCard, Crown, ExternalLink, Package, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { storeService } from '../../services/apiService';

const money = value => Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const dateTime = value => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set';

const UsageBar = ({ icon: Icon, label, value, limit }) => {
  const unlimited = limit === null;
  const percent = unlimited ? 0 : Math.min(100, Math.round((Number(value || 0) / Math.max(1, limit)) * 100));
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
    <div className="mb-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold text-slate-200"><Icon className="h-4 w-4 text-primary-300" />{label}</span><span className="text-sm font-black text-white">{value} / {unlimited ? 'Unlimited' : limit}</span></div>
    {!unlimited && <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary-400 transition-all" style={{ width: `${percent}%` }} /></div>}
  </div>;
};

const statusStyle = status => ({
  paid: 'bg-emerald-50 text-emerald-700', pending_payment: 'bg-amber-50 text-amber-700',
  failed: 'bg-rose-50 text-rose-700', cancelled: 'bg-slate-100 text-slate-600', expired: 'bg-slate-100 text-slate-600'
}[status] || 'bg-slate-100 text-slate-600');

const SubscriptionPlanSettings = ({ canManage = false }) => {
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const summaryResponse = await storeService.getMySubscription();
      const paymentResponse = canManage
        ? await storeService.getSubscriptionPayments()
        : { data: { payments: [] } };
      setData(summaryResponse.data);
      setPayments(paymentResponse.data.payments || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load the store plan.');
    } finally { setLoading(false); }
  }, [canManage]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const result = query.get('subscription');
    const paymentId = query.get('id');
    if (!canManage || !result || !paymentId) return;
    const cleanReturnUrl = () => {
      query.delete('subscription'); query.delete('id');
      const suffix = query.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}`);
    };
    if (result === 'cancelled') {
      toast.info('PayMongo checkout was closed. Your plan was not changed.');
      cleanReturnUrl();
      return;
    }
    setBusy(paymentId);
    storeService.verifySubscriptionPayment(paymentId)
      .then(response => {
        if (response.data.status === 'paid') toast.success('Payment confirmed. Your store plan is active.');
        else toast.info('PayMongo has not confirmed the payment yet. You can verify it again from this page.');
        return load();
      })
      .catch(requestError => toast.error(requestError.response?.data?.message || 'Unable to verify the PayMongo payment.'))
      .finally(() => { setBusy(''); cleanReturnUrl(); });
  }, [canManage, load]);

  const pending = useMemo(() => payments.find(row => row.status === 'pending_payment'), [payments]);

  const startCheckout = async tier => {
    setBusy(tier);
    try {
      const response = await storeService.createSubscriptionCheckout(tier);
      window.location.assign(response.data.checkoutUrl);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to open PayMongo checkout.');
      if (requestError.response?.data?.payment) await load();
      setBusy('');
    }
  };

  const cancelPending = async () => {
    if (!pending) return;
    setBusy(pending.id);
    try {
      await storeService.cancelSubscriptionPayment(pending.id);
      toast.success('Pending checkout cancelled. Your current plan was not changed.');
      await load();
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to cancel this checkout.');
      await load();
    } finally { setBusy(''); }
  };

  const verifyPending = async () => {
    if (!pending) return;
    setBusy(pending.id);
    try {
      const response = await storeService.verifySubscriptionPayment(pending.id);
      if (response.data.status === 'paid') toast.success('Payment confirmed. Your plan is active.');
      else toast.info('Payment is still awaiting PayMongo confirmation.');
      await load();
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to verify this payment.');
    } finally { setBusy(''); }
  };

  if (loading) return <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-sm font-bold text-slate-500">Loading plan and payments...</div>;
  if (error) return <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>;

  const { subscription, plans } = data;
  return <section className="space-y-5 animate-in slide-in-from-right-4">
    <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl sm:p-7">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-primary-300"><Crown className="h-4 w-4" />Current store plan</div><h2 className="text-3xl font-black">{subscription.plan.name}</h2><p className="mt-2 max-w-xl text-sm text-slate-300">{subscription.plan.description}</p>{subscription.expiresAt && <p className="mt-3 flex items-center gap-2 text-xs font-bold text-primary-200"><Clock3 className="h-4 w-4" />Access through {dateTime(subscription.expiresAt)}</p>}</div><div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left sm:text-right"><div className="text-2xl font-black">{money(subscription.plan.monthlyPrice)}</div><div className="text-xs font-bold uppercase tracking-widest text-slate-400">per 30-day term</div></div></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><UsageBar icon={Package} label="Active listings" value={subscription.usage.activeListings} limit={subscription.allowances.listings} /><UsageBar icon={Users} label="Active staff" value={subscription.usage.activeStaff} limit={subscription.allowances.staff} /></div>
    </div>

    {pending && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="flex items-center gap-2 font-black text-amber-950"><Clock3 className="h-5 w-5" />{pending.plan.name} checkout is pending</p><p className="mt-1 text-sm text-amber-800">PayMongo must confirm {money(pending.amount)} before Pawzzle changes your plan.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => window.location.assign(pending.checkoutUrl)} disabled={!pending.checkoutUrl || busy} className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Continue payment <ExternalLink className="h-4 w-4" /></button><button type="button" onClick={verifyPending} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-black text-amber-900 disabled:opacity-50">Verify payment</button><button type="button" onClick={cancelPending} disabled={busy} className="rounded-xl px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">Cancel checkout</button></div></div></div>}

    {!canManage && <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700">Only the Store Owner can purchase, renew, or review payments for a Store plan.</div>}

    <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-4 text-sm text-slate-700"><div className="flex items-start gap-3"><CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" /><div><strong>Secure PayMongo payment, with no marketplace platform fee.</strong> Each paid plan covers 30 days and does not renew automatically. Pay again before expiry to extend the same plan; if a paid term expires, the Free limits apply without deleting existing listings.</div></div></div>

    <div><div className="mb-4"><h3 className="text-xl font-black text-slate-900">Choose a plan</h3><p className="text-sm text-slate-500">Every listed allowance below is enforced by Pawzzle. All plans use one Store location.</p></div><div className="grid gap-4 md:grid-cols-2">{plans.map(plan => {
      const current = plan.id === subscription.tier;
      const paid = plan.monthlyPrice > 0;
      return <article key={plan.id} className={`rounded-[1.75rem] border p-5 ${current ? 'border-primary-500 bg-primary-50/60 shadow-md' : 'border-slate-200 bg-white'}`}><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h4 className="text-xl font-black text-slate-900">{plan.name}</h4>{current && <span className="rounded-full bg-primary-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">Current</span>}</div><p className="mt-1 text-sm text-slate-500">{plan.description}</p></div><div className="text-right"><div className="text-lg font-black text-slate-900">{money(plan.monthlyPrice)}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{paid ? '30 days' : 'no charge'}</div></div></div><ul className="mt-5 space-y-2.5">{plan.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{feature}</li>)}</ul>{paid ? <button type="button" disabled={!canManage || Boolean(pending) || Boolean(busy)} onClick={() => startCheckout(plan.id)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"><CreditCard className="h-4 w-4" />{canManage ? (current ? 'Renew with PayMongo' : `Choose ${plan.name}`) : 'Store Owner approval required'}</button> : <p className="mt-5 rounded-xl bg-slate-100 px-4 py-3 text-center text-xs font-bold text-slate-600">Applied automatically when no paid term is active</p>}</article>;
    })}</div></div>

    {canManage && <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black text-slate-900">Payment history</h3><div className="mt-3 divide-y divide-slate-100">{payments.length ? payments.slice(0, 8).map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold text-slate-900">{row.plan.name} · {money(row.amount)}</p><p className="text-xs text-slate-500">Started {dateTime(row.createdAt)}{row.periodEnd ? ` · access through ${dateTime(row.periodEnd)}` : ''}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${statusStyle(row.status)}`}>{row.status.replace('_', ' ')}</span></div>) : <p className="py-4 text-sm text-slate-500">No subscription payments yet.</p>}</div></div>}

    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" /><p>Plan access is activated only after PayMongo confirms payment. Pawzzle never trusts a browser redirect as proof of payment, and duplicate webhook deliveries cannot activate the same payment twice.</p></div>
  </section>;
};

export default SubscriptionPlanSettings;
