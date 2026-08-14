import React, { useEffect, useState } from 'react';
import { Briefcase, CheckCircle, ShieldCheck, Star, User, X } from 'lucide-react';
import { bookingService, getImageUrl } from '../../services/apiService';

const roleLabel = value => String(value || 'Specialized Staff').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const StaffProfileModal = ({ bookingId, staffId, onClose, onSelect, isCurrent }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    bookingService.getStaffProfile(bookingId, staffId)
      .then(response => setData(response.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [bookingId, staffId]);

  const staff = data?.staff;
  return (
    <div className="fixed inset-0 z-[140] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur border-b">
          <div>
            <p className="text-[9px] font-black text-primary-600 uppercase tracking-widest">Public Staff Profile</p>
            <h3 className="text-sm font-black text-slate-900">Assigned specialist</h3>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </header>
        {loading ? <div className="p-10 text-center text-xs text-slate-500">Loading profile…</div> : staff ? (
          <div className="p-4 space-y-4">
            <section className="flex gap-3 rounded-xl bg-slate-50 border p-3">
              <div className="h-14 w-14 shrink-0 rounded-xl bg-white border overflow-hidden flex items-center justify-center">
                {staff.avatar ? <img src={getImageUrl(staff.avatar)} alt="" className="h-full w-full object-cover" /> : <User className="h-5 w-5 text-slate-400" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h4 className="text-base font-black text-slate-900">{staff.firstName} {staff.lastName}</h4>{staff.verified&&<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-700"><ShieldCheck className="h-3 w-3"/>Verified</span>}</div>
                <p className="text-xs text-primary-700 font-bold">{staff.professionalTitle || roleLabel(staff.staffType)}</p>
                <p className="text-[11px] text-slate-500">{staff.specialty || 'General practice'} · {staff.experienceYears || 0} years experience</p>
                {staff.branch?.name && <p className="text-[10px] text-slate-500">Branch: {staff.branch.name}</p>}
                <p className="mt-1 text-[11px] font-bold text-slate-700 flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {staff.reviewCount ? `${staff.averageRating} / 5 · ${staff.reviewCount} review${staff.reviewCount === 1 ? '' : 's'}` : 'No reviews yet'}</p>
              </div>
            </section>

            {staff.bio && <p className="text-xs leading-relaxed text-slate-600">{staff.bio}</p>}

            <section className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border bg-slate-50 p-2 text-center"><p className="text-sm font-black text-slate-900">{staff.completedServices || 0}</p><p className="text-[8px] font-bold uppercase text-slate-400">Completed</p></div>
              <div className="rounded-xl border bg-slate-50 p-2 text-center"><p className="text-sm font-black text-slate-900">{staff.successRate == null ? 'N/A' : `${staff.successRate}%`}</p><p className="text-[8px] font-bold uppercase text-slate-400">Success rate</p></div>
              <div className="rounded-xl border bg-slate-50 p-2 text-center"><p className="text-sm font-black text-slate-900">{staff.reviewCount || 0}</p><p className="text-[8px] font-bold uppercase text-slate-400">Reviews</p></div>
            </section>

            {(staff.languages?.length > 0 || staff.licenseInformation) && <section className="rounded-xl border p-3 space-y-2">{staff.languages?.length > 0 && <p className="text-[11px] text-slate-600"><span className="font-bold">Languages:</span> {staff.languages.join(', ')}</p>}{staff.licenseInformation && <p className="text-[11px] text-slate-600"><span className="font-bold">License information provided:</span> {[staff.licenseInformation.type, staff.licenseInformation.number, staff.licenseInformation.issuingBody].filter(Boolean).join(' · ')}</p>}</section>}

            {(staff.areasOfExpertise?.length > 0 || staff.qualifications?.length > 0) && (
              <section className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border p-3"><p className="text-[9px] font-black uppercase text-slate-400 mb-2">Areas of expertise</p><div className="flex flex-wrap gap-1">{staff.areasOfExpertise?.map(item => <span key={item} className="px-2 py-1 rounded-md bg-primary-50 text-primary-700 text-[10px] font-bold">{item}</span>)}</div></div>
                <div className="rounded-xl border p-3"><p className="text-[9px] font-black uppercase text-slate-400 mb-2">Qualifications provided</p><ul className="space-y-1">{staff.qualifications?.map(item => <li key={item} className="text-[11px] text-slate-600 flex gap-1"><CheckCircle className="h-3 w-3 mt-0.5 text-emerald-500" />{item}</li>)}</ul></div>
              </section>
            )}

            {staff.certifications?.length > 0 && <section className="rounded-xl border p-3"><p className="text-[9px] font-black uppercase text-slate-400 mb-2">Certifications</p>{staff.certifications.map((item, index) => <div key={`${item.name}-${index}`} className="py-2 border-t first:border-0 text-[11px]"><p className="font-bold text-slate-800">{item.name}</p><p className="text-slate-500">{[item.issuingBody, item.year].filter(Boolean).join(' · ')} · {item.verificationStatus === 'verified' ? 'System verified' : 'Information provided; not system verified'}</p></div>)}</section>}

            {staff.credentials?.length > 0 && <section className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3"><p className="text-[9px] font-black uppercase text-emerald-700 mb-2">Verified professional credentials</p>{staff.credentials.map((item,index)=><div key={`${item.name}-${index}`} className="py-2 border-t border-emerald-100 first:border-0 text-[11px]"><p className="font-bold text-slate-800">{item.name}</p><p className="text-slate-500">{[roleLabel(item.documentType),item.issuingBody,item.credentialNumber,item.expiresAt?`Expires ${new Date(item.expiresAt).toLocaleDateString()}`:''].filter(Boolean).join(' · ')}</p></div>)}</section>}

            {staff.services?.length > 0 && <section className="rounded-xl border p-3"><p className="text-[9px] font-black uppercase text-slate-400 mb-2">Services handled</p><div className="flex flex-wrap gap-1">{staff.services.map(service => <span key={service._id} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{service.name}</span>)}</div></section>}

            <section><div className="flex items-center justify-between mb-2"><p className="text-[9px] font-black uppercase text-slate-400">Customer reviews</p><Briefcase className="h-3.5 w-3.5 text-slate-400" /></div>{data.reviews?.length ? <div className="space-y-2">{data.reviews.map(review => <article key={review._id} className="rounded-xl border bg-slate-50 p-3"><div className="flex justify-between gap-2"><p className="text-[11px] font-bold text-slate-800">{review.user ? `${review.user.firstName} ${review.user.lastName}` : 'Anonymous customer'}</p><span className="text-[10px] font-black text-amber-600">{review.rating}/5</span></div>{review.comment && <p className="text-xs text-slate-600 mt-1">{review.comment}</p>}{review.complimentTags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{review.complimentTags.map(tag => <span key={tag} className="rounded bg-white px-1.5 py-0.5 text-[8px] font-bold text-primary-700">{tag.replaceAll('_', ' ')}</span>)}</div>}</article>)}</div> : <p className="rounded-xl bg-slate-50 border p-3 text-xs text-slate-500">No reviews yet</p>}</section>

            {onSelect && !isCurrent && <button type="button" onClick={() => onSelect(staff._id)} className="w-full h-10 rounded-xl bg-primary-600 text-white text-xs font-black uppercase tracking-wider">Select this staff member</button>}
          </div>
        ) : <div className="p-10 text-center text-xs text-slate-500">This profile is unavailable.</div>}
      </div>
    </div>
  );
};

export default StaffProfileModal;
