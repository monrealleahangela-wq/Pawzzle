import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, BarChart3, Calendar, CheckCircle2, ChevronRight,
  DollarSign, Package, RefreshCw, ShoppingBag, Truck, UserRound,
  Users, Wallet, Zap, UserPlus, ShieldCheck
} from 'lucide-react';
import { storeService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import RiderDashboard from '../../components/admin/RiderDashboard';
import SpecializedStaffDashboard from '../../components/admin/SpecializedStaffDashboard';
import {
  OPERATIONAL_ROLES, PLATFORM_ADMIN_ROLES, STORE_ADMIN_ROLES,
  effectiveStaffType, hasUiPermission, isCareProfessional
} from '../../utils/authorization';
import { getUserFacingError } from '../../utils/userFacingError';

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const number = value => Number(value || 0).toLocaleString('en-PH');
const titleCase = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const Panel = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const MetricCard = ({ label, value, icon: Icon, tone = 'primary', detail }) => {
  const tones = {
    primary: 'bg-primary/10 text-primary', emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-primary-50 text-primary-700', slate: 'bg-slate-100 text-slate-700'
  };
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 truncate text-xl font-bold tracking-tight text-slate-950">{value}</p>
          {detail && <p className="mt-1 text-[11px] text-slate-500">{detail}</p>}
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.primary}`}>
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
};

const BarChart = ({ rows = [], labelKey = 'label', valueKey = 'value', formatter = number, empty = 'No data yet.' }) => {
  const max = Math.max(...rows.map(row => Number(row[valueKey] || 0)), 1);
  if (!rows.length) return <p className="py-8 text-center text-xs text-slate-400">{empty}</p>;
  return (
    <div className="space-y-2.5" role="img" aria-label="Bar chart">
      {rows.map((row, index) => (
        <div key={row.key || row.id || index} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-slate-600">{row[labelKey]}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(2, Number(row[valueKey] || 0) / max * 100)}%` }} />
          </span>
          <span className="min-w-8 text-right font-semibold text-slate-800">{formatter(row[valueKey])}</span>
        </div>
      ))}
    </div>
  );
};

const LineChart = ({ rows = [] }) => {
  const values = rows.map(row => Number(row.revenue || 0));
  const max = Math.max(...values, 1);
  const points = rows.map((row, index) => {
    const x = rows.length <= 1 ? 50 : (index / (rows.length - 1)) * 100;
    const y = 92 - (Number(row.revenue || 0) / max) * 78;
    return `${x},${y}`;
  }).join(' ');
  if (!rows.length) return <p className="py-12 text-center text-xs text-slate-400">No paid transaction data yet.</p>;
  return (
    <div role="img" aria-label="Sales revenue trend">
      <svg viewBox="0 0 100 100" className="h-36 w-full overflow-visible" preserveAspectRatio="none">
        <line x1="0" y1="92" x2="100" y2="92" stroke="#e2e8f0" strokeWidth="1" />
        <polyline points={points} fill="none" stroke="currentColor" className="text-primary" strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {rows.map((row, index) => {
          const [x, y] = points.split(' ')[index].split(',');
          return <circle key={row.key || index} cx={x} cy={y} r="1.7" fill="currentColor" className="text-primary"><title>{row.label}: {peso(row.revenue)}</title></circle>;
        })}
      </svg>
      <div className="mt-1 flex justify-between gap-1 text-[10px] text-slate-400">
        {rows.map((row, index) => <span key={row.key || index} className="truncate">{row.label}</span>)}
      </div>
    </div>
  );
};

const Donut = ({ rows = [] }) => {
  const total = rows.reduce((value, row) => value + Number(row.value || 0), 0);
  let cursor = 0;
  const colors = ['#8B4513', '#BFA6A0', '#475569'];
  const slices = rows.map((row, index) => {
    const start = cursor;
    cursor += total ? Number(row.value || 0) / total * 360 : 0;
    return `${colors[index % colors.length]} ${start}deg ${cursor}deg`;
  });
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: total ? `conic-gradient(${slices.join(',')})` : '#e2e8f0' }} role="img" aria-label="Revenue breakdown">
        <div className="absolute inset-5 flex items-center justify-center rounded-full bg-white text-center text-[10px] font-semibold text-slate-500">{peso(total)}<span className="sr-only"> total</span></div>
      </div>
      <div className="w-full space-y-2">
        {rows.map((row, index) => <div key={row.key} className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index] }} />{row.label}</span><strong className="text-slate-900">{peso(row.value)}</strong></div>)}
      </div>
    </div>
  );
};

const Empty = ({ children = 'No records yet.' }) => <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">{children}</p>;

const Dashboard = () => {
  const { user, refreshUserRole } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [trendRange, setTrendRange] = useState('daily');
  const isOwner = PLATFORM_ADMIN_ROLES.has(user?.role) || STORE_ADMIN_ROLES.has(user?.role);
  const isProfessionalWorkspace = isCareProfessional(user);
  const hasPerm = useCallback(resource => hasUiPermission(user, resource), [user]);

  const fetchDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (effectiveStaffType(user) === 'delivery_rider' || isProfessionalWorkspace) return;
    if (quiet && document.hidden) return;
    if (!quiet) setLoading(true);
    try {
      const response = await storeService.getDashboardStats();
      setData(response.data);
      setError('');
    } catch (requestError) {
      setError(getUserFacingError(requestError, 'The dashboard could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isProfessionalWorkspace, user]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useEffect(() => {
    if (!user || effectiveStaffType(user) === 'delivery_rider' || isProfessionalWorkspace) return undefined;
    const timer = window.setInterval(() => fetchDashboard({ quiet: true }), 60000);
    return () => window.clearInterval(timer);
  }, [fetchDashboard, isProfessionalWorkspace, user]);

  const refreshFromEvent = useCallback(() => fetchDashboard({ quiet: true }), [fetchDashboard]);
  useRealTimeUpdates({
    onInventoryUpdate: refreshFromEvent,
    onOrderUpdate: refreshFromEvent,
    onNewOrder: refreshFromEvent,
    onServiceUpdate: refreshFromEvent,
    onBookingUpdate: refreshFromEvent,
    onDeliveryUpdate: refreshFromEvent,
    onPaymentUpdate: refreshFromEvent,
    onNotification: refreshFromEvent,
    onDashboardUpdate: refreshFromEvent
  });

  const handleSessionRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshUserRole();
      if (result.roleChanged) window.location.reload();
      else await fetchDashboard({ quiet: true });
    } catch (refreshError) {
      setRefreshing(false);
    }
  };

  const quickActions = useMemo(() => [
    { to: '/admin/staff', label: 'Add Staff', icon: UserPlus, show: isOwner || hasPerm('staff') },
    { to: '/admin/roles', label: 'Role Management', icon: ShieldCheck, show: isOwner },
    { to: '/admin/bookings', label: 'Bookings', icon: Calendar, show: isOwner || hasPerm('bookings') || hasPerm('services') },
    { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, show: isOwner || hasPerm('orders') },
    { to: '/admin/inventory', label: 'Inventory', icon: Package, show: isOwner || hasPerm('inventory') },
    { to: '/admin/purchase-orders', label: 'Procurement', icon: Zap, show: isOwner || hasPerm('procurement') },
    { to: '/admin/finance', label: 'Finance', icon: Wallet, show: isOwner || hasPerm('finance') },
    { to: '/admin/logistics', label: 'Logistics', icon: Truck, show: isOwner || hasPerm('logistics') }
  ].filter(action => action.show), [hasPerm, isOwner]);

  if (isProfessionalWorkspace) return <SpecializedStaffDashboard />;
  if (effectiveStaffType(user) === 'delivery_rider') return <RiderDashboard />;
  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><div className="flex items-center gap-3 text-sm font-medium text-slate-500"><RefreshCw className="h-5 w-5 animate-spin text-primary" />Loading operations…</div></div>;

  const kpis = data?.kpis || {};
  const finance = data?.finance;
  const dss = data?.decisionSupport;
  const trendRows = data?.sales?.trends?.[trendRange] || [];
  const statusRows = data?.bookings?.status || [];

  return (
    <div className="space-y-5 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Operations overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{data?.store?.name || user?.store?.name || 'Store'} Dashboard</h1>
          <p className="mt-1 text-xs text-slate-500">Live store health, sales, bookings, stock, staff and fulfillment.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-400 md:inline">Updated {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
          <button type="button" onClick={handleSessionRefresh} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-primary hover:text-primary" aria-label="Refresh dashboard">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Refresh
          </button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {OPERATIONAL_ROLES.has(user?.role) && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">
            {user.avatar || user.profilePicture ? <img src={getImageUrl(user.avatar || user.profilePicture)} alt="" className="h-full w-full object-cover" /> : <UserRound size={18} />}
          </div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{user.firstName} {user.lastName}</p><p className="truncate text-xs text-slate-500">{titleCase(effectiveStaffType(user) || 'Store professional')}</p></div>
          <Link to="/profile" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary">Profile</Link>
        </div>
      )}

      <section aria-label="Today's priorities">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Today</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Bookings" value={number(kpis.bookingsToday)} icon={Calendar} tone="primary" />
          <MetricCard label="Pending orders" value={number(kpis.pendingOrders)} icon={ShoppingBag} tone="blue" />
          <MetricCard label="Staff available" value={number(data?.workforce?.available)} icon={Users} tone="emerald" detail={`${number(data?.workforce?.busy)} busy · ${number(data?.workforce?.onBreak)} on break`} />
          <MetricCard label="Inventory alerts" value={number(kpis.lowStockItems)} icon={AlertTriangle} tone={kpis.lowStockItems ? 'rose' : 'emerald'} />
        </div>
      </section>

      <section aria-label="This week's operations">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">This Week</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Revenue" value={peso(data?.weekly?.revenue)} icon={DollarSign} tone="emerald" />
          <MetricCard label="Bookings" value={number(data?.weekly?.bookings)} icon={BarChart3} tone="primary" />
          <MetricCard label="Active workload" value={number(data?.weekly?.activeWorkload)} icon={Activity} tone="amber" detail="Current staff assignments" />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel title="Sales trend" subtitle="Paid product orders and service bookings" className="xl:col-span-2" action={<div className="flex rounded-lg bg-slate-100 p-0.5">{['daily', 'weekly', 'monthly'].map(range => <button key={range} type="button" onClick={() => setTrendRange(range)} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize ${trendRange === range ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{range}</button>)}</div>}>
          <LineChart rows={trendRows} />
        </Panel>
        <Panel title="Revenue mix" subtitle="Actual paid transaction snapshots"><Donut rows={data?.sales?.breakdown || []} /></Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Booking activity" subtitle={`${number(data?.bookings?.today)} today · ${number(data?.bookings?.upcoming)} upcoming`}>
          <BarChart rows={statusRows} />
        </Panel>

        <Panel title="Specialist performance" subtitle={`${number(data?.specialists?.availableToday)} of ${number(data?.specialists?.active)} available today`} action={<Link to="/admin/staff" className="text-xs font-semibold text-primary">View staff</Link>}>
          {(data?.specialists?.topRated || []).length ? <div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Top rated</p>{data.specialists.topRated.slice(0, 3).map(staff => <div key={staff.id} className="mb-1.5 flex items-center gap-2 rounded-lg bg-slate-50 p-2"><div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-white text-slate-400">{staff.photo ? <img src={getImageUrl(staff.photo)} alt="" className="h-full w-full object-cover" /> : <UserRound size={14} />}</div><span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-slate-900">{staff.name}</strong><span className="block truncate text-[9px] text-slate-500">{titleCase(staff.role)}</span></span><b className="text-[11px] text-amber-600">★ {staff.rating || '—'}</b></div>)}</div><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Most completed</p>{(data.specialists.mostCompleted || []).slice(0, 3).map(staff => <div key={staff.id} className="mb-1.5 flex items-center justify-between rounded-lg bg-slate-50 p-2 text-[11px]"><span className="truncate font-semibold text-slate-800">{staff.name}</span><b className="text-primary">{number(staff.completedServices)}</b></div>)}</div></div> : <Empty>No specialist performance data yet.</Empty>}
        </Panel>

        {isOwner && <Panel title="Workforce operations" subtitle={`${number(data?.workforce?.available)} available · ${number(data?.workforce?.activeWorkload)} active assignments`} action={<Link to="/admin/staff" className="text-xs font-semibold text-primary">Manage</Link>}>
          <div className="grid grid-cols-4 gap-2 text-center">{[
            ['Available', data?.workforce?.available, 'bg-emerald-50 text-emerald-700'],
            ['Busy', data?.workforce?.busy, 'bg-primary-50 text-primary-700'],
            ['On leave', data?.workforce?.onLeave, 'bg-amber-50 text-amber-700'],
            ['Pending', data?.workforce?.pendingVerification, 'bg-slate-100 text-slate-700']
          ].map(([label,value,tone])=><div key={label} className={`rounded-xl p-2 ${tone}`}><strong className="block text-base">{number(value)}</strong><span className="text-[9px]">{label}</span></div>)}</div>
          <div className="mt-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Staff distribution</p><BarChart rows={(data?.workforce?.distribution || []).slice(0, 4)} labelKey="role" valueKey="count" /></div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-100 p-2 text-[11px] text-slate-500"><span>Configured role policies</span><Link to="/admin/roles" className="font-bold text-primary">{number(data?.workforce?.configuredRolePolicies)} · Review</Link></div>
          {(data?.workforce?.upcomingLeave || []).length > 0 && <p className="mt-2 truncate text-[10px] text-slate-500">Upcoming leave: <b>{data.workforce.upcomingLeave.map(row=>row.name).join(', ')}</b></p>}
        </Panel>}

        <Panel title="Inventory DSS" subtitle="Deterministic stock movement indicators" action={<Link to="/admin/inventory" className="text-xs font-semibold text-primary">Manage</Link>}>
          <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-amber-50 p-2"><strong className="block text-lg text-amber-700">{number(data?.inventory?.low)}</strong><span className="text-[10px] text-amber-700">Low</span></div><div className="rounded-xl bg-rose-50 p-2"><strong className="block text-lg text-rose-700">{number(data?.inventory?.critical)}</strong><span className="text-[10px] text-rose-700">Critical</span></div><div className="rounded-xl bg-primary-50 p-2"><strong className="block text-lg text-primary-700">{number(data?.inventory?.reorderRequired)}</strong><span className="text-[10px] text-primary-700">Reorder</span></div></div>
          <div className="mt-3"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fast moving (30 days)</p><BarChart rows={(data?.inventory?.fastMoving || []).slice(0, 4)} labelKey="name" valueKey="quantity" /></div>
          {(data?.inventory?.slowMoving || []).length > 0 && <p className="mt-3 truncate text-[11px] text-slate-500">Slow moving: <strong className="text-slate-700">{data.inventory.slowMoving.map(row => row.name).slice(0, 3).join(', ')}</strong></p>}
        </Panel>

        {isOwner && <Panel title="Procurement" subtitle="Purchase order and supplier health" action={<Link to="/admin/purchase-orders" className="text-xs font-semibold text-primary">Open</Link>}>
          <div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Pending POs</p><strong className="text-lg text-slate-900">{number(data?.procurement?.pendingPurchaseOrders)}</strong></div><div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Delivered</p><strong className="text-lg text-slate-900">{number(data?.procurement?.deliveredPurchaseOrders)}</strong></div><div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Monthly cost</p><strong className="text-sm text-slate-900">{peso(data?.procurement?.monthlyCost)}</strong></div></div>
          <div className="mt-3"><BarChart rows={(data?.procurement?.supplierPerformance || []).slice(0, 4)} labelKey="name" valueKey="delivered" /></div>
        </Panel>}

        {isOwner && <Panel title="Finance" subtitle="Current month, based on recorded transactions" action={<Link to="/admin/finance" className="text-xs font-semibold text-primary">Open</Link>}>
          <div className="grid grid-cols-2 gap-2">{[
            ['Revenue', finance?.revenue, 'text-emerald-700'], ['Expenses', finance?.expenses, 'text-rose-700'],
            ['Profit', finance?.profit, Number(finance?.profit || 0) >= 0 ? 'text-slate-900' : 'text-rose-700'], ['VAT collected', finance?.vatCollected, 'text-slate-900']
          ].map(([label, value, tone]) => <div key={label} className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">{label}</p><strong className={`text-sm ${tone}`}>{peso(value)}</strong></div>)}</div>
          <p className="mt-3 flex justify-between text-xs text-slate-500"><span>Pending procurement payments</span><strong className="text-slate-900">{peso(finance?.pendingProcurementPayments)}</strong></p>
        </Panel>}

        <Panel title="Logistics" subtitle="Delivery execution and rider workload" action={<Link to="/admin/logistics" className="text-xs font-semibold text-primary">Open</Link>}>
          <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-primary-50 p-2"><strong className="block text-lg text-primary-700">{number(data?.logistics?.active)}</strong><span className="text-[10px] text-primary-700">Active</span></div><div className="rounded-xl bg-emerald-50 p-2"><strong className="block text-lg text-emerald-700">{number(data?.logistics?.completed)}</strong><span className="text-[10px] text-emerald-700">Completed</span></div><div className="rounded-xl bg-rose-50 p-2"><strong className="block text-lg text-rose-700">{number(data?.logistics?.failed)}</strong><span className="text-[10px] text-rose-700">Failed</span></div></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><p className="rounded-lg border border-slate-100 p-2 text-slate-500">Avg. time<strong className="block text-slate-900">{number(data?.logistics?.averageDeliveryMinutes)} min</strong></p><p className="rounded-lg border border-slate-100 p-2 text-slate-500">Completion<strong className="block text-slate-900">{Number(data?.logistics?.completionRate || 0).toFixed(1)}%</strong></p><p className="rounded-lg border border-slate-100 p-2 text-slate-500">Internal / 3rd party<strong className="block text-slate-900">{number(data?.logistics?.internal)} / {number(data?.logistics?.thirdParty)}</strong></p><p className="rounded-lg border border-slate-100 p-2 text-slate-500">Active rider workload<strong className="block text-slate-900">{number(data?.logistics?.activeRiderWorkload)} deliveries</strong></p></div>
          <p className="mt-2 flex justify-between text-[11px] text-slate-500"><span>Rider earnings today</span><strong className="text-slate-900">{peso(data?.logistics?.riderEarningsToday)}</strong></p>
        </Panel>

        <Panel title="Customer insights" subtitle="Derived from actual store transactions">
          <div className="mb-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">New customers</p><strong className="text-lg text-slate-900">{number(data?.customers?.newCustomers)}</strong></div><div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Returning</p><strong className="text-lg text-slate-900">{number(data?.customers?.returningCustomers)}</strong></div></div>
          <BarChart rows={(data?.customers?.popularServices || []).slice(0, 4)} labelKey="name" valueKey="count" empty="No paid service data yet." />
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><p className="rounded-lg border border-slate-100 p-2 text-slate-500">Top product<strong className="block truncate text-slate-900">{data?.customers?.topProducts?.[0]?.name || 'No data'}</strong></p><p className="rounded-lg border border-slate-100 p-2 text-slate-500">Peak booking hour<strong className="block text-slate-900">{data?.customers?.peakBookingHours?.[0] ? `${String(data.customers.peakBookingHours[0].hour).padStart(2, '0')}:00` : 'No data'}</strong></p></div>
        </Panel>
      </section>

      {isOwner && <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4" aria-label="Decision support">
        <Panel title="Store health score" subtitle="Explainable weighted operational indicators">
          <div className="flex items-center gap-4"><div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-8 ${Number(dss?.healthScore?.overallScore || 0) >= 80 ? 'border-emerald-100 text-emerald-700' : Number(dss?.healthScore?.overallScore || 0) >= 60 ? 'border-amber-100 text-amber-700' : 'border-rose-100 text-rose-700'}`}><strong className="text-2xl">{dss?.healthScore?.overallScore ?? '—'}</strong></div><div className="min-w-0"><p className="text-xs font-semibold text-slate-900">{titleCase(dss?.healthScore?.rating || 'Insufficient data')}</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{dss?.healthScore?.why}</p></div></div>
          {(dss?.healthScore?.areasNeedingAttention || []).length > 0 && <p className="mt-3 text-[11px] text-slate-500">Focus: <strong className="text-slate-800">{dss.healthScore.areasNeedingAttention.map(row => row.label).join(', ')}</strong></p>}
        </Panel>
        <Panel title="Booking forecast" subtitle={`${dss?.bookingDemand?.confidenceLabel || 'Limited'} confidence · ${number(dss?.bookingDemand?.sampleSize)} bookings`}>
          <p className="text-xs leading-relaxed text-slate-600">{dss?.bookingDemand?.why}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><p className="rounded-lg bg-slate-50 p-2 text-slate-500">Busiest day<strong className="block text-slate-900">{dss?.bookingDemand?.busiestDays?.[0]?.label || 'No data'}</strong></p><p className="rounded-lg bg-slate-50 p-2 text-slate-500">Peak hour<strong className="block text-slate-900">{dss?.bookingDemand?.busiestHours?.[0]?.label || 'No data'}</strong></p><p className="col-span-2 rounded-lg bg-slate-50 p-2 text-slate-500">Recommended coverage<strong className="block text-slate-900">{number(dss?.bookingDemand?.recommendedStaffing?.specialists)} specialist(s)</strong></p></div>
        </Panel>
        <Panel title="Inventory risk forecast" subtitle="Usage, days remaining, quantity and confidence">
          {(dss?.inventoryRecommendations || []).filter(row => row.decision?.shouldReorder).slice(0, 3).map(row => <div key={row.product.id} className="mb-2 rounded-xl bg-slate-50 p-2.5"><div className="flex justify-between gap-2"><strong className="truncate text-xs text-slate-900">{row.product.name}</strong><span className="text-[10px] font-semibold text-rose-600">{row.inventoryPosition.daysRemaining ?? '—'} days</span></div><p className="mt-1 text-[10px] text-slate-500">Reorder {number(row.decision.suggestedReorderQuantity)} · {titleCase(row.confidenceLabel)} confidence</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{row.forecastReason}</p></div>)}
          {!(dss?.inventoryRecommendations || []).some(row => row.decision?.shouldReorder) && <Empty>No forecast inventory risks detected.</Empty>}
        </Panel>
        <Panel title="Recommended actions" subtitle="Highest-priority explainable DSS alerts" action={<Link to="/admin/insights" className="text-xs font-semibold text-primary">DSS details</Link>}>
          {(dss?.recommendedActions || []).length ? <div className="space-y-2">{dss.recommendedActions.slice(0, 4).map((action, index) => <div key={`${action.title}-${index}`} className="flex gap-2 rounded-xl border border-slate-100 p-2.5"><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${action.severity === 'critical' ? 'bg-rose-50 text-rose-700' : action.severity === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-primary-50 text-primary-700'}`}>{action.severity === 'critical' ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}</span><span className="min-w-0"><strong className="block text-[11px] text-slate-900">{action.title}</strong><span className="block text-[10px] leading-relaxed text-slate-500">{action.recommendedAction}</span></span></div>)}</div> : <Empty>No operational interventions are currently indicated.</Empty>}
        </Panel>
      </section>}

      <section className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <Panel title="Quick actions" subtitle="Common operational destinations">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">{quickActions.map(action => <Link key={action.to} to={action.to} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary/5 hover:text-primary"><action.icon size={15} />{action.label}</Link>)}</div>
        </Panel>
        <Panel title="Recent orders" subtitle="Latest store order activity" action={<Link to="/admin/orders" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">All orders <ChevronRight size={13} /></Link>}>
          {(data?.recentOrders || []).length ? <div className="divide-y divide-slate-100">{data.recentOrders.map(order => <Link key={order._id} to={`/admin/orders?id=${order._id}`} className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-xs transition hover:bg-slate-50"><span className="min-w-0"><strong className="block truncate text-slate-900">#{String(order.orderNumber || order._id).slice(-8).toUpperCase()}</strong><span className="text-slate-500">{new Date(order.createdAt).toLocaleDateString()} · {titleCase(order.status)}</span></span><span className="text-right"><strong className="block text-slate-900">{peso(order.totalAmount)}</strong><span className={order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}>{titleCase(order.paymentStatus)}</span></span></Link>)}</div> : <Empty>No customer orders yet.</Empty>}
        </Panel>
      </section>
    </div>
  );
};

export default Dashboard;
