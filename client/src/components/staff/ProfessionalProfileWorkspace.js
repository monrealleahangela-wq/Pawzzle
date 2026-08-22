import React from 'react';
import { Briefcase, CalendarDays, Clock3, FileBadge2, Languages, ShieldCheck, Star, UserRound } from 'lucide-react';
import { getImageUrl } from '../../services/apiService';
import { readableRole } from '../../utils/staffWorkspace';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const readable = value => String(value || 'Not set').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const formatDate = value => value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';
const time = value => {
  if (!value) return '';
  const [hours, minutes] = value.split(':');
  return new Date(2000, 0, 1, Number(hours), Number(minutes)).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

const Stat = ({ label, value }) => <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{value ?? 0}</p></div>;

const ProfessionalProfileWorkspace = ({ details, form, onFormChange, onSave, saving }) => {
  if (!details?.staff) return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">Professional profile is unavailable.</div>;
  const staff = details.staff;
  const profile = staff.professionalProfile || {};
  const performance = details.performance || {};
  const role = staff.effectiveRole || staff.staffType || staff.role;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const scheduleToday = profile.availability?.[today];
  const unavailable = profile.temporaryUnavailable?.active || profile.emergencyUnavailable?.active;
  const availabilityLabel = unavailable ? 'Unavailable' : !scheduleToday ? 'Schedule not set' : scheduleToday.available === false ? 'Off today' : 'Available';
  const available = availabilityLabel === 'Available';
  const license = profile.registration || {};
  const credentials = (profile.credentialDocuments || []).filter(document => document.status !== 'archived');
  const nextExpiry = [license.expiresAt, ...credentials.map(item => item.expiresAt)].filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0];
  const daysUntilExpiry = nextExpiry ? Math.ceil((new Date(nextExpiry) - new Date()) / 86400000) : null;
  const roleSpecialtyLabel = role === 'groomer' ? 'Grooming specialties' : role === 'trainer' ? 'Training specialties' : role === 'boarding_staff' ? 'Boarding specialization' : 'Areas of veterinary expertise';
  const experienceLabel = role === 'groomer' ? 'Years of grooming experience' : role === 'trainer' ? 'Years of training experience' : role === 'boarding_staff' ? 'Years of boarding care experience' : 'Years of practice';

  return <div className="space-y-4">
    <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-primary">{staff.avatar || staff.profilePicture ? <img src={getImageUrl(staff.avatar || staff.profilePicture)} alt="" className="h-full w-full object-cover" /> : <UserRound size={30}/>}</div>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-widest text-primary">My professional profile</p><h2 className="truncate text-2xl font-black text-slate-950 dark:text-white">{staff.firstName} {staff.lastName}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{profile.professionalTitle || readableRole(role)}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Staff ID {profile.staffId || 'Pending'}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{staff.store?.name || 'Assigned branch'}</span><span className={`rounded-full px-2.5 py-1 ${available ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>{availabilityLabel}</span></div></div>
        <div className="grid grid-cols-2 gap-2 text-center sm:w-48"><div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><p className="text-[8px] uppercase text-slate-400">Account status</p><p className="mt-1 text-xs font-black text-slate-800 dark:text-white">{readable(staff.staffStatus || (staff.isActive === false ? 'inactive' : 'active'))}</p></div><div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><p className="text-[8px] uppercase text-slate-400">Verification</p><p className="mt-1 text-xs font-black text-slate-800 dark:text-white">{readable(staff.professionalVerificationStatus)}</p></div></div>
      </div>
    </header>

    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Completed services" value={performance.completedServices}/><Stat label="Average rating" value={performance.reviewCount ? `${performance.averageRating}/5` : '—'}/><Stat label="Customer reviews" value={performance.reviewCount}/><Stat label="Upcoming bookings" value={performance.upcomingBookings}/></section>

    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><Briefcase size={16} className="text-primary"/>Professional details</h3>
        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          <div><dt className="text-slate-400">Professional role</dt><dd className="mt-1 font-bold text-slate-800 dark:text-slate-200">{profile.professionalTitle || readableRole(role)}</dd></div>
          <div><dt className="text-slate-400">{experienceLabel}</dt><dd className="mt-1 font-bold text-slate-800 dark:text-slate-200">{profile.experienceYears || 0} years</dd></div>
          <div><dt className="text-slate-400">Assigned branch</dt><dd className="mt-1 font-bold text-slate-800 dark:text-slate-200">{staff.store?.name || 'Not assigned'}</dd></div>
          <div><dt className="text-slate-400">Services handled</dt><dd className="mt-1 font-bold text-slate-800 dark:text-slate-200">{(staff.assignedServices || []).map(service => service.name).join(', ') || 'No services assigned'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-400">{roleSpecialtyLabel}</dt><dd className="mt-1 font-bold text-slate-800 dark:text-slate-200">{[profile.specialty, ...(profile.areasOfExpertise || []), ...(profile.specializations || [])].filter(Boolean).join(', ') || 'Not provided'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-400">Professional biography</dt><dd className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">{profile.bio || 'No biography added yet.'}</dd></div>
          <div className="sm:col-span-2"><dt className="flex items-center gap-1 text-slate-400"><Languages size={13}/>Languages</dt><dd className="mt-1 font-bold text-slate-800 dark:text-slate-200">{(profile.languages || []).join(', ') || 'Not provided'}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><CalendarDays size={16} className="text-primary"/>Working schedule</h3>
        <div className="space-y-1.5">{DAYS.map(day => { const item=profile.availability?.[day]; return <div key={day} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${day===today?'bg-primary/10':'bg-slate-50 dark:bg-slate-800'}`}><span className="font-bold capitalize text-slate-700 dark:text-slate-200">{day}</span><span className="text-slate-500 dark:text-slate-400">{item?.available === false ? 'Off' : item?.start && item?.end ? `${time(item.start)}–${time(item.end)}` : 'Not set'}{item?.breaks?.length ? ` · ${item.breaks.length} break${item.breaks.length===1?'':'s'}` : ''}</span></div>;})}</div>
        {(profile.leaveSchedule || []).length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><Clock3 size={14} className="mb-1"/>Upcoming leave: {profile.leaveSchedule.slice(0,2).map(item=>`${formatDate(item.startDate)}–${formatDate(item.endDate)}`).join(', ')}</div>}
      </section>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><FileBadge2 size={16} className="text-primary"/>Credentials and verification</h3>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="text-[9px] uppercase text-slate-400">License number</p><p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">{license.number || 'Not provided'}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="text-[9px] uppercase text-slate-400">License expiration</p><p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">{formatDate(license.expiresAt)}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="text-[9px] uppercase text-slate-400">Verification status</p><p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">{readable(staff.professionalVerificationStatus)}</p></div></div>
      {daysUntilExpiry !== null && daysUntilExpiry <= 30 && <p className={`mt-3 rounded-xl p-3 text-xs ${daysUntilExpiry < 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'}`}><ShieldCheck size={14} className="mr-1 inline"/>{daysUntilExpiry < 0 ? 'A credential has expired. Contact your Store Owner/Admin.' : `A credential expires in ${daysUntilExpiry} day${daysUntilExpiry===1?'':'s'}. Prepare renewal details.`}</p>}
      {credentials.length > 0 && <div className="mt-3 space-y-2">{credentials.map(document=><div key={document._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-xs dark:border-slate-700"><div className="min-w-0"><p className="truncate font-bold text-slate-800 dark:text-slate-200">{document.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{readable(document.documentType)} · {formatDate(document.expiresAt)}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{readable(document.status)}</span></div>)}</div>}
      <p className="mt-3 text-[10px] text-slate-400">Credential files remain private. This view shows status and renewal information only.</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><h3 className="mb-3 text-sm font-black text-slate-950 dark:text-white">Update my public professional information</h3><div className="space-y-3"><label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Professional biography<textarea value={form.bio} maxLength="3000" onChange={event=>onFormChange(current=>({...current,bio:event.target.value}))} className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"/></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600 dark:text-slate-300">Areas of expertise<input value={form.areasOfExpertise} onChange={event=>onFormChange(current=>({...current,areasOfExpertise:event.target.value}))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Comma-separated"/></label><label className="text-xs font-bold text-slate-600 dark:text-slate-300">Languages spoken<input value={form.languages} onChange={event=>onFormChange(current=>({...current,languages:event.target.value}))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Comma-separated"/></label></div><button onClick={onSave} disabled={saving} className="min-h-11 w-full rounded-xl bg-primary px-4 text-xs font-black text-white disabled:opacity-50 sm:w-auto">{saving?'Saving…':'Save professional profile'}</button></div></section>

    {(details.recentReviews || []).length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><Star size={16} className="text-amber-500"/>Recent customer reviews</h3><div className="grid gap-2 sm:grid-cols-2">{details.recentReviews.slice(0,4).map(review=><article key={review._id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs font-bold text-amber-600">★ {review.rating}/5</p><p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{review.comment || 'Customer rating'}</p></article>)}</div></section>}
  </div>;
};

export default ProfessionalProfileWorkspace;
