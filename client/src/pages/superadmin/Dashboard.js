import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, BarChart3, Building2, ChevronRight, ClipboardCheck, DollarSign,
  RefreshCw, ShieldCheck, ShoppingBag, Store, Users, Wallet
} from 'lucide-react';
import { dssService } from '../../services/apiService';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const number = value => Number(value || 0).toLocaleString('en-PH');
const titleCase = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const Metric = ({ label, value, icon: Icon, note }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1.5 truncate text-xl font-bold tracking-tight text-slate-950">{value}</p>{note && <p className="mt-1 text-[10px] text-slate-400">{note}</p>}</div><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={16} /></span></div>
  </article>
);

const Panel = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}</div>{action}</div>{children}</section>
);

const Bars = ({ rows = [], valueKey = 'count', label = row => row.label || row._id || 'Unknown', formatter = number }) => {
  const max = Math.max(...rows.map(row => Number(row[valueKey] || 0)), 1);
  if (!rows.length) return <p className="py-8 text-center text-xs text-slate-400">No data yet.</p>;
  return <div className="space-y-2.5" role="img" aria-label="Analytics bar chart">{rows.map((row, index) => <div key={`${label(row)}-${index}`} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-xs"><span className="truncate text-slate-600">{label(row)}</span><span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Number(row[valueKey] || 0) / max * 100)}%` }} /></span><strong className="min-w-8 text-right text-slate-800">{formatter(row[valueKey])}</strong></div>)}</div>;
};

const RevenueChart = ({ rows = [] }) => {
  const max = Math.max(...rows.map(row => Number(row.revenue || 0)), 1);
  if (!rows.length) return <p className="py-12 text-center text-xs text-slate-400">No paid revenue data yet.</p>;
  return <div className="flex h-40 items-end gap-2" role="img" aria-label="Monthly platform revenue">{rows.map((row, index) => <div key={`${row._id?.year}-${row._id?.month}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px] font-semibold text-slate-500">{peso(row.revenue)}</span><span className="w-full max-w-10 rounded-t-md bg-primary/80 transition-all hover:bg-primary" style={{ height: `${Math.max(4, Number(row.revenue || 0) / max * 120)}px` }} title={peso(row.revenue)} /><span className="text-[10px] text-slate-400">{new Date(row._id?.year || 2020, Number(row._id?.month || 1) - 1).toLocaleDateString('en-PH', { month: 'short' })}</span></div>)}</div>;
};

const SuperAdminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await dssService.getSuperAdminInsights();
      setData(response.data);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Platform analytics could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) fetchDashboard({ quiet: true });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [fetchDashboard]);
  const liveRefresh = useCallback(() => fetchDashboard({ quiet: true }), [fetchDashboard]);
  useRealTimeUpdates({ onInventoryUpdate: liveRefresh, onOrderUpdate: liveRefresh, onNewOrder: liveRefresh, onServiceUpdate: liveRefresh, onBookingUpdate: liveRefresh, onDeliveryUpdate: liveRefresh, onPaymentUpdate: liveRefresh, onNotification: liveRefresh, onDashboardUpdate: liveRefresh });

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><div className="flex items-center gap-3 text-sm font-medium text-slate-500"><RefreshCw className="h-5 w-5 animate-spin text-primary" />Loading platform operations…</div></div>;

  const platform = data?.platform || {};
  const revenue = data?.revenue || {};
  const deliveries = data?.deliveries || {};
  const platformDss = data?.platformDecisionSupport || {};
  const quickActions = [
    ['/superadmin/account-management', 'Accounts', Users],
    ['/superadmin/store-applications', 'Applications', ClipboardCheck],
    ['/superadmin/transaction-history', 'Transactions', DollarSign],
    ['/superadmin/payouts', 'Payouts', Wallet],
    ['/superadmin/reports', 'Reports', BarChart3],
    ['/superadmin/insights', 'Decision support', Activity]
  ];

  return (
    <div className="space-y-5 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Platform operations</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Super Admin Dashboard</h1><p className="mt-1 text-xs text-slate-500">Platform growth, revenue, stores, customers and fulfillment in one view.</p></div><button type="button" onClick={() => { setRefreshing(true); fetchDashboard({ quiet: true }); }} className="inline-flex h-9 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Refresh</button></header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" aria-label="Platform key performance indicators">
        <Metric label="Total stores" value={number(platform.totalStores)} icon={Store} />
        <Metric label="Verified stores" value={number(platform.verifiedStores)} icon={ShieldCheck} />
        <Metric label="Pending applications" value={number(platform.pendingApplications)} icon={ClipboardCheck} />
        <Metric label="Platform revenue" value={peso(revenue.totalPlatformFees)} icon={Wallet} note="Recorded platform fees" />
        <Metric label="Total orders" value={number(data?.orders?.total)} icon={ShoppingBag} />
        <Metric label="Total bookings" value={number(data?.bookings?.total)} icon={BarChart3} />
        <Metric label="Active customers" value={number(platform.totalCustomers)} icon={Users} />
        <Metric label="Active suppliers" value={number(platform.activeSuppliers)} icon={Building2} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel title="Platform revenue trend" subtitle="Paid orders and bookings · gross transaction value" className="xl:col-span-2"><RevenueChart rows={data?.monthlyRevenue || []} /></Panel>
        <Panel title="Application status" subtitle="Actual store application records"><Bars rows={data?.applicationStatus || []} label={row => titleCase(row._id)} /></Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Store growth" subtitle="New stores over six months"><Bars rows={data?.storeGrowth || []} label={row => new Date(row._id?.year || 2020, Number(row._id?.month || 1) - 1).toLocaleDateString('en-PH', { month: 'short' })} /></Panel>
        <Panel title="Customer growth" subtitle="New customer accounts"><Bars rows={data?.customerGrowth || []} label={row => new Date(row._id?.year || 2020, Number(row._id?.month || 1) - 1).toLocaleDateString('en-PH', { month: 'short' })} /></Panel>
        <Panel title="Platform activity" subtitle="Orders and bookings processed"><div className="grid grid-cols-3 gap-2 text-center">{[['24 hours', data?.throughput?.daily], ['7 days', data?.throughput?.weekly], ['30 days', data?.throughput?.monthly]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-2.5"><strong className="block text-lg text-slate-900">{number(value)}</strong><span className="text-[10px] text-slate-500">{label}</span></div>)}</div><p className="mt-3 flex justify-between text-xs text-slate-500"><span>Velocity change</span><strong className={Number(data?.velocity?.trend || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{Number(data?.velocity?.trend || 0) >= 0 ? '+' : ''}{data?.velocity?.trend || 0}%</strong></p></Panel>
        <Panel title="Delivery network" subtitle="Platform-wide logistics performance"><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-primary-50 p-2"><strong className="block text-lg text-primary-700">{number(deliveries.active)}</strong><span className="text-[10px] text-primary-700">Active</span></div><div className="rounded-xl bg-emerald-50 p-2"><strong className="block text-lg text-emerald-700">{number(deliveries.completed)}</strong><span className="text-[10px] text-emerald-700">Done</span></div><div className="rounded-xl bg-rose-50 p-2"><strong className="block text-lg text-rose-700">{number(deliveries.failed)}</strong><span className="text-[10px] text-rose-700">Failed</span></div></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><p className="rounded-lg border border-slate-100 p-2 text-slate-500">Internal / 3rd party<strong className="block text-slate-900">{number(deliveries.internal)} / {number(deliveries.thirdParty)}</strong></p><p className="rounded-lg border border-slate-100 p-2 text-slate-500">Average time<strong className="block text-slate-900">{number(deliveries.averageMinutes)} min</strong></p></div></Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4" aria-label="Platform decision support">
        <Panel title="Highest-performing stores" subtitle="Delivered-order revenue with evidence">
          {(platformDss.highestPerformingStores || []).slice(0, 4).map(storeRow => <div key={storeRow._id} className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-2.5"><span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{storeRow.storeName}</strong><span className="text-[10px] text-slate-500">{number(storeRow.orderCount)} delivered orders</span></span><strong className="text-xs text-emerald-700">{peso(storeRow.revenue)}</strong></div>)}
          {!(platformDss.highestPerformingStores || []).length && <p className="py-6 text-center text-xs text-slate-400">No delivered-order benchmark yet.</p>}
        </Panel>
        <Panel title="Stores needing intervention" subtitle="Status and booking-risk evidence">
          {(platformDss.storesNeedingIntervention || []).slice(0, 4).map(row => <div key={row.store.id} className="mb-2 rounded-xl border border-slate-100 p-2.5"><div className="flex justify-between gap-2"><strong className="truncate text-xs text-slate-900">{row.store.name}</strong><span className={`text-[10px] font-semibold ${row.severity === 'high' ? 'text-rose-600' : 'text-amber-600'}`}>{titleCase(row.severity)}</span></div><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{row.why}</p></div>)}
          {!(platformDss.storesNeedingIntervention || []).length && <p className="py-6 text-center text-xs text-slate-400">No store intervention signal detected.</p>}
        </Panel>
        <Panel title="Supplier reliability" subtitle="Delivery, timing, and price consistency">
          {(platformDss.supplierReliability || []).slice(0, 4).map(row => <div key={row.supplier.id} className="mb-2 rounded-xl bg-slate-50 p-2.5"><div className="flex justify-between gap-2"><strong className="truncate text-xs text-slate-900">{row.supplier.name}</strong><span className="text-xs font-bold text-primary">{row.score}/100</span></div><p className="mt-1 text-[10px] text-slate-500">{row.evidence.orders} POs · {row.evidence.averageDeliveryDays ?? '—'} avg days · {row.confidenceLabel} confidence</p></div>)}
          {!(platformDss.supplierReliability || []).length && <p className="py-6 text-center text-xs text-slate-400">No supplier delivery history yet.</p>}
        </Panel>
        <Panel title="Platform booking forecast" subtitle={`${platformDss.bookingDemand?.confidenceLabel || 'Limited'} confidence · 90-day history`}>
          <p className="text-xs leading-relaxed text-slate-600">{platformDss.bookingDemand?.why}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><p className="rounded-lg bg-slate-50 p-2 text-slate-500">Busiest day<strong className="block text-slate-900">{platformDss.bookingDemand?.busiestDays?.[0]?.label || 'No data'}</strong></p><p className="rounded-lg bg-slate-50 p-2 text-slate-500">Peak hour<strong className="block text-slate-900">{platformDss.bookingDemand?.busiestHours?.[0]?.label || 'No data'}</strong></p></div><p className="mt-3 text-[10px] leading-relaxed text-slate-500">{platformDss.bookingDemand?.recommendedAction}</p>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Panel title="Quick actions" subtitle="Platform administration"><div className="grid grid-cols-2 gap-2">{quickActions.map(([to, label, Icon]) => <Link key={to} to={to} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-primary hover:bg-primary/5 hover:text-primary"><Icon size={15} />{label}</Link>)}</div></Panel>
        <Panel title="Recent platform activity" subtitle="Newest paid orders" action={<Link to="/superadmin/transaction-history" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Transactions <ChevronRight size={13} /></Link>}>
          {(data?.orders?.recent || []).length ? <div className="divide-y divide-slate-100">{data.orders.recent.slice(0, 6).map(order => <div key={order._id} className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-xs"><span className="min-w-0"><strong className="block truncate text-slate-900">#{String(order.orderNumber || order._id).slice(-8).toUpperCase()}</strong><span className="text-slate-500">{order.customer ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() : 'Customer'} · {new Date(order.createdAt).toLocaleDateString()}</span></span><strong className="text-slate-900">{peso(order.totalAmount)}</strong></div>)}</div> : <p className="rounded-xl bg-slate-50 py-8 text-center text-xs text-slate-400">No paid orders yet.</p>}
        </Panel>
      </section>

      <Panel title="Recent accounts" subtitle="Latest registered identities" action={<Link to="/superadmin/account-management" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Manage <ChevronRight size={13} /></Link>}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{(data?.recentUsers || []).map(user => <div key={user._id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400"><Users size={14} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{user.firstName} {user.lastName}</strong><span className="block truncate text-[10px] text-slate-500">{titleCase(user.role)}</span></span><span className={`h-2 w-2 rounded-full ${user.isActive === false ? 'bg-rose-500' : 'bg-emerald-500'}`} title={user.isActive === false ? 'Inactive' : 'Active'} /></div>)}</div>
      </Panel>
    </div>
  );
};

export default SuperAdminDashboard;
