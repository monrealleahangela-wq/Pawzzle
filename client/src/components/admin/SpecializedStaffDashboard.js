import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Calendar, CheckCircle2, Clock3, FileBadge2, PawPrint,
  RefreshCw, ShieldCheck, Star, UserRound
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { adminBookingService, getImageUrl, staffService } from '../../services/apiService';
import { effectiveStaffType } from '../../utils/authorization';
import { getStaffWorkspaceConfig, readableRole } from '../../utils/staffWorkspace';
import { getUserFacingError } from '../../utils/userFacingError';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'no_show', 'confirmation_expired']);
const ACTIVE_STATUSES = new Set(['confirmed', 'approved', 'processing', 'finished']);
const dateKey = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const formatDate = value => value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Schedule pending';
const formatTime = value => {
  if (!value) return '';
  const [hours, minutes] = String(value).split(':');
  if (hours === undefined || minutes === undefined) return value;
  return new Date(2000, 0, 1, Number(hours), Number(minutes)).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

const Metric = ({ label, value, icon: Icon, tone }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon size={16} /></div>
    <p className="text-xl font-black text-slate-950 dark:text-white">{value}</p>
    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
  </article>
);

const SpecializedStaffDashboard = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [professional, setProfessional] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const role = effectiveStaffType(user);
  const config = getStaffWorkspaceConfig(role);

  const loadWorkspace = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [bookingResponse, profileResponse] = await Promise.all([
        adminBookingService.getAllBookings({ limit: 100 }),
        staffService.getMyProfessionalProfile()
      ]);
      setBookings(bookingResponse.data.bookings || []);
      setProfessional(profileResponse.data || null);
      setError('');
    } catch (requestError) {
      setError(getUserFacingError(requestError, 'Your assigned workspace could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const summary = useMemo(() => {
    const today = dateKey(new Date());
    const current = bookings.filter(booking => ACTIVE_STATUSES.has(booking.status));
    const upcoming = bookings
      .filter(booking => !TERMINAL_STATUSES.has(booking.status) && dateKey(booking.bookingDate) >= today)
      .sort((a, b) => new Date(a.bookingDate) - new Date(b.bookingDate));
    const departuresToday = bookings.filter(booking => dateKey(booking.serviceDetails?.checkOutDate) === today).length;
    return {
      today: bookings.filter(booking => dateKey(booking.bookingDate) === today && !TERMINAL_STATUSES.has(booking.status)).length,
      active: current.length,
      upcoming,
      completed: bookings.filter(booking => booking.status === 'completed').length,
      departuresToday
    };
  }, [bookings]);

  const profile = professional?.staff?.professionalProfile || {};
  const performance = professional?.performance || {};
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const todaySchedule = profile.availability?.[weekday];
  const isUnavailable = profile.temporaryUnavailable?.active || profile.emergencyUnavailable?.active;
  const availabilityLabel = isUnavailable ? 'Unavailable' : !todaySchedule ? 'Schedule not set' : todaySchedule.available === false ? 'Off today' : 'Available';
  const credentialExpiry = profile.registration?.expiresAt
    || (profile.credentialDocuments || []).filter(item => item.status !== 'archived' && item.expiresAt).sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))[0]?.expiresAt;

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-primary" /><span className="ml-2 text-sm font-semibold text-slate-500">Loading your work…</span></div>;

  const metricRows = role === 'boarding_staff' ? [
    [config.todayLabel, summary.today, Calendar, 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'],
    [config.activeLabel, summary.active, PawPrint, 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'],
    ['Departures today', summary.departuresToday, Clock3, 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'],
    ['Care tasks', summary.active, CheckCircle2, 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300']
  ] : [
    [config.todayLabel, summary.today, Calendar, 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'],
    [config.activeLabel, summary.active, Activity, 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'],
    [config.upcomingLabel, summary.upcoming.length, Clock3, 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'],
    ['Average rating', performance.reviewCount ? `${performance.averageRating}/5` : '—', Star, 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300']
  ];

  return (
    <div className="space-y-4 pb-28 lg:pb-8">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-primary">
            {user?.avatar || user?.profilePicture ? <img src={getImageUrl(user.avatar || user.profilePicture)} alt="" className="h-full w-full object-cover" /> : <UserRound size={22} />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{config.eyebrow}</p>
            <h1 className="truncate text-xl font-black text-slate-950 dark:text-white">{config.title}</h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{readableRole(role)} · {user?.store?.name || professional?.staff?.store?.name || 'Assigned branch'}</p>
          </div>
        </div>
        <button type="button" onClick={() => { setRefreshing(true); loadWorkspace({ quiet: true }); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200" aria-label="Refresh my workspace">
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}

      <section aria-label="My work summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricRows.map(([label, value, icon, tone]) => <Metric key={label} label={label} value={value} icon={icon} tone={tone} />)}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-black text-slate-950 dark:text-white">Next assigned appointments</h2><p className="text-xs text-slate-500 dark:text-slate-400">Only bookings assigned to you are returned by the server.</p></div>
            <Link to="/admin/bookings" className="shrink-0 text-xs font-bold text-primary">View all</Link>
          </div>
          {summary.upcoming.length ? <div className="space-y-2">
            {summary.upcoming.slice(0, 6).map(booking => <article key={booking._id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{booking.pet?.name || 'Pet'} · {booking.service?.name || 'Service appointment'}</p><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{formatDate(booking.bookingDate)}{booking.startTime ? ` · ${formatTime(booking.startTime)}` : ''}</p><p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{booking.customer?.firstName} {booking.customer?.lastName} · {String(booking.status || '').replaceAll('_', ' ')}</p></div>
                <Link to={`/admin/bookings?id=${booking._id}`} className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-slate-900 px-3 text-[11px] font-bold text-white dark:bg-primary">Open</Link>
              </div>
            </article>)}
          </div> : <div className="rounded-xl bg-slate-50 p-8 text-center dark:bg-slate-800"><Calendar className="mx-auto mb-2 h-7 w-7 text-slate-300" /><p className="text-xs text-slate-500 dark:text-slate-400">{config.empty}</p></div>}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-950 dark:text-white">Today’s availability</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${availabilityLabel === 'Available' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>{availabilityLabel}</span></div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{todaySchedule?.available === false ? 'No working hours scheduled today.' : todaySchedule?.start && todaySchedule?.end ? `${formatTime(todaySchedule.start)}–${formatTime(todaySchedule.end)}` : 'Working hours have not been set.'}</p>
            {(todaySchedule?.breaks || []).map((item, index) => <p key={index} className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Break: {formatTime(item.start)}–{formatTime(item.end)}</p>)}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileBadge2 size={17} /></div><div><h2 className="text-sm font-black text-slate-950 dark:text-white">Professional status</h2><p className="mt-1 text-xs capitalize text-slate-500 dark:text-slate-400">{String(professional?.staff?.professionalVerificationStatus || 'pending verification').replaceAll('_', ' ')}</p></div></div>
            {credentialExpiry && <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><ShieldCheck size={14} /> Credential expiry: {formatDate(credentialExpiry)}</p>}
            <Link to="/profile?tab=professional" className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">View my profile</Link>
          </section>

          {(professional?.recentReviews || []).length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="mb-3 text-sm font-black text-slate-950 dark:text-white">Recent feedback</h2>{professional.recentReviews.slice(0, 2).map(review => <div key={review._id} className="mb-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800"><p className="font-bold text-amber-600">★ {review.rating}/5</p><p className="mt-1 line-clamp-2 text-slate-600 dark:text-slate-300">{review.comment || 'Customer rating'}</p></div>)}</section>}
        </div>
      </div>
    </div>
  );
};

export default SpecializedStaffDashboard;
