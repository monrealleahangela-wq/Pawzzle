import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, Clock3, FileText, Image, Loader2, MessageCircle, RefreshCw, Send, Shield, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { adminBookingService, getImageUrl, petCareService } from '../../services/apiService';
import socket from '../../utils/socket';

const stageLabels = {
  proposal_received: 'Proposal received',
  staff_assigned: 'Specialist assigned',
  proposal_confirmed: 'Proposal confirmed',
  payment_completed: 'Payment completed',
  booking_confirmed: 'Booking confirmed',
  scheduled: 'Scheduled',
  pet_arrived: 'Pet arrived',
  assessed: 'Assessed',
  service_started: 'Service started',
  in_progress: 'In progress',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Completed',
  aftercare: 'Aftercare instructions',
  cancelled: 'Cancelled',
  incident: 'Important update',
  general: 'Service update'
};

const formatDateTime = value => value
  ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '';

const senderName = sender => sender
  ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Service team'
  : 'Pawzzle';

const quickCareUpdates = [
  ['Examination Started', 'assessed'],
  ['Grooming Started', 'in_progress'],
  ['Bath Finished', 'in_progress'],
  ['Nail Trimming Completed', 'in_progress'],
  ['Vaccination Completed', 'in_progress'],
  ['Treatment Ongoing', 'in_progress'],
  ['Resting', 'in_progress'],
  ['Preparing for Pickup', 'in_progress']
];

const ServiceCommunicationPanel = ({ booking, staffMode = false, onBookingUpdated }) => {
  const [timeline, setTimeline] = useState([]);
  const [summary, setSummary] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [staffText, setStaffText] = useState('');
  const [entryType, setEntryType] = useState('update');
  const [category, setCategory] = useState('general');
  const [photoCategory, setPhotoCategory] = useState('during');
  const [photoMessage, setPhotoMessage] = useState('');
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [aftercareInstructions, setAftercareInstructions] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const fileRef = useRef(null);

  const loadTimeline = useCallback(async (quiet = false) => {
    if (!booking?._id) return;
    if (!quiet) setLoading(true);
    try {
      const response = await petCareService.getServiceTimeline(booking._id);
      setTimeline(response.data.timeline || []);
      setSummary(response.data.summary || null);
      setPermissions(response.data.permissions || {});
    } catch (error) {
      if (!quiet) toast.error(error.response?.data?.message || 'Unable to load service updates.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [booking?._id]);

  useEffect(() => {
    loadTimeline();
    const timer = setInterval(() => {
      if (!document.hidden) loadTimeline(true);
    }, 30000);
    const handleServiceUpdate = event => {
      if (String(event?.bookingId) === String(booking?._id)) loadTimeline(true);
    };
    socket.on('serviceUpdate', handleServiceUpdate);
    if (!socket.connected) socket.connect();
    return () => {
      clearInterval(timer);
      socket.off('serviceUpdate', handleServiceUpdate);
    };
  }, [loadTimeline]);

  useEffect(() => () => photoPreviews.forEach(preview => URL.revokeObjectURL(preview)), [photoPreviews]);

  useEffect(() => {
    setAftercareInstructions(summary?.serviceSummary?.aftercareInstructions || '');
    setServiceNotes(summary?.serviceSummary?.notes || '');
  }, [summary?.serviceSummary?.aftercareInstructions, summary?.serviceSummary?.notes]);

  const publicPhotos = useMemo(() => timeline.flatMap(item => {
    const urls = item.media?.map(media => media.url) || item.mediaUrls || [];
    return urls.map(url => ({ url, item }));
  }), [timeline]);

  const choosePhoto = event => {
    const files = [...(event.target.files || [])].slice(0, 5);
    if (!files.length) return;
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))) {
      toast.error('Use a JPEG, PNG, WebP, or GIF image.');
      event.target.value = '';
      return;
    }
    if (files.some(file => file.size > 5 * 1024 * 1024)) {
      toast.error('Each photo must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    photoPreviews.forEach(preview => URL.revokeObjectURL(preview));
    setPhotoFiles(files);
    setPhotoPreviews(files.map(file => URL.createObjectURL(file)));
  };

  const clearPhoto = () => {
    photoPreviews.forEach(preview => URL.revokeObjectURL(preview));
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setUploadProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submitStaffUpdate = async event => {
    event.preventDefault();
    if (!staffText.trim()) return toast.info(entryType === 'internal_note' ? 'Enter an internal note.' : 'Enter an update for the pet owner.');
    setSending(true);
    try {
      const response = await petCareService.addServiceUpdate(booking._id, {
        entryType,
        category,
        stage: booking.serviceProgress?.status || (booking.status === 'finished' ? 'ready_for_pickup' : 'in_progress'),
        message: staffText.trim()
      });
      toast.success(entryType === 'internal_note' ? 'Internal note saved.' : 'Update sent to the pet owner.');
      if (entryType !== 'internal_note' && response.data.notificationDelivered === false) toast.warning('The update was saved, but the notification could not be delivered.');
      setStaffText('');
      await loadTimeline(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Update failed. Your text has been kept so you can retry.');
    } finally {
      setSending(false);
    }
  };

  const submitPhoto = async event => {
    event.preventDefault();
    if (!photoFiles.length) return toast.info('Choose at least one service photo first.');
    setSending(true);
    setUploadProgress(1);
    try {
      const formData = new FormData();
      photoFiles.forEach(file => formData.append('images', file));
      formData.append('category', photoCategory);
      formData.append('message', photoMessage.trim());
      const response = await petCareService.uploadServicePhoto(booking._id, formData, progressEvent => {
        if (progressEvent.total) setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
      });
      toast.success(`${photoFiles.length} photo${photoFiles.length === 1 ? '' : 's'} shared with the pet owner.`);
      if (response.data.notificationDelivered === false) toast.warning('The photo was saved, but the notification could not be delivered.');
      clearPhoto();
      setPhotoMessage('');
      await loadTimeline(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Photo upload failed. The preview remains available so you can retry.');
    } finally {
      setSending(false);
    }
  };

  const submitMessage = async event => {
    event.preventDefault();
    const saved = message.trim();
    if (!saved) return;
    setSending(true);
    try {
      const response = await petCareService.sendServiceMessage(booking._id, saved);
      setMessage('');
      if (response.data.notificationDelivered === false) toast.warning('The message was saved, but one notification could not be delivered.');
      await loadTimeline(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Message failed to send. Your text has been kept so you can retry.');
    } finally {
      setSending(false);
    }
  };

  const postQuickCareUpdate = async ([label, stage]) => {
    setSending(true);
    try {
      await petCareService.addServiceUpdate(booking._id, { entryType: 'update', category: 'general', stage, message: label });
      toast.success(`${label} shared with the pet owner.`);
      await loadTimeline(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to send this care update.');
    } finally {
      setSending(false);
    }
  };

  const runLifecycleAction = async action => {
    setSending(true);
    try {
      if (action === 'check_in') await adminBookingService.checkIn(booking._id);
      else await adminBookingService.updateBookingStatus(booking._id, action);
      const refreshed = await adminBookingService.getBookingById(booking._id);
      onBookingUpdated?.(refreshed.data.booking);
      toast.success(action === 'processing' ? 'Service started.' : action === 'finished' ? 'Pet marked ready for pickup.' : action === 'completed' ? 'Service completed.' : 'Pet checked in.');
      await loadTimeline(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to update the booking lifecycle.');
    } finally {
      setSending(false);
    }
  };

  const submitAftercare = async event => {
    event.preventDefault();
    if (!aftercareInstructions.trim()) return toast.info('Enter aftercare instructions for the pet owner.');
    setSending(true);
    try {
      await petCareService.saveAftercare(booking._id, { aftercareInstructions: aftercareInstructions.trim(), serviceNotes: serviceNotes.trim() });
      toast.success('Aftercare instructions shared.');
      await loadTimeline(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save aftercare instructions.');
    } finally {
      setSending(false);
    }
  };

  const activeForUpdates = ['confirmed', 'approved', 'processing', 'finished'].includes(booking.status);
  const messageAvailable = ['confirmed', 'approved', 'processing', 'finished', 'completed'].includes(booking.status);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary-600">Service communication</p>
          <h3 className="text-base font-black text-slate-900 dark:text-white">{booking.pet?.name || 'Pet'}'s service timeline</h3>
          <p className="mt-1 text-xs text-slate-500">Status, photos, updates, and booking-specific messages.</p>
        </div>
        <button type="button" onClick={() => loadTimeline()} disabled={loading} className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 grid place-items-center text-slate-500 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh service timeline">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {summary && ['completed', 'ready_for_pickup'].includes(summary.status) && (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
          <div className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><div><p className="font-black">{summary.status === 'completed' ? 'Service completed' : 'Ready for pickup'}</p><p>{summary.service?.name}{summary.staff ? ` · ${senderName(summary.staff)}` : ''}{summary.completedAt ? ` · ${formatDateTime(summary.completedAt)}` : ''}</p></div></div>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto pr-1 space-y-0" aria-live="polite">
        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading service timeline…</div>
        ) : timeline.length === 0 ? (
          <div className="py-7 text-center text-xs text-slate-500">Updates will appear here once the paid service begins.</div>
        ) : timeline.map((item, index) => {
          const isInternal = item.visibility === 'internal';
          const isMessage = item.entryType === 'message';
          const isPhoto = item.entryType === 'photo' || (item.mediaUrls?.length > 0);
          const photoLabel = item.media?.[0]?.category
            ? `${item.media[0].category.charAt(0).toUpperCase()}${item.media[0].category.slice(1)} photo`
            : 'Service photo';
          const Icon = isInternal ? Shield : isPhoto ? Image : isMessage ? MessageCircle : CheckCircle2;
          return (
            <div key={item.id || item._id || `${item.entryType}-${item.createdAt}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`h-7 w-7 rounded-full grid place-items-center ${isInternal ? 'bg-amber-100 text-amber-700' : isMessage ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}><Icon size={14} /></div>
                {index < timeline.length - 1 && <div className="w-px min-h-8 flex-1 bg-slate-200 dark:bg-slate-700" />}
              </div>
              <div className="min-w-0 flex-1 pb-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100">{isInternal ? 'Internal staff note' : isMessage ? senderName(item.sender) : isPhoto ? photoLabel : stageLabels[item.stage] || 'Service update'}</p>
                  {isInternal && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-700">Staff only</span>}
                  <span className="text-[10px] text-slate-400">{formatDateTime(item.createdAt)}</span>
                </div>
                {item.sender && !isMessage && <p className="text-[9px] text-slate-400">By {senderName(item.sender)}</p>}
                {item.message && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.message}</p>}
                {(item.media?.length > 0 || item.mediaUrls?.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(item.media?.map(media => media.url) || item.mediaUrls || []).map((url, photoIndex) => <a key={`${url}-${photoIndex}`} href={getImageUrl(url)} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200"><img src={getImageUrl(url)} alt={`${stageLabels[item.stage] || 'Service'} update`} className="h-full w-full object-cover" /></a>)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {publicPhotos.length > 0 && <p className="mb-3 text-[10px] text-slate-400">{publicPhotos.length} service photo{publicPhotos.length === 1 ? '' : 's'} shared</p>}

      {staffMode && permissions.canPostStaffUpdate && (
        <div className="mb-4 rounded-xl border border-primary-100 bg-primary-50/40 p-3">
          <div className="mb-2 flex items-center gap-2"><Sparkles size={14} className="text-primary-600" /><p className="text-[10px] font-black uppercase tracking-widest text-primary-700">Quick Update</p></div>
          <div className="flex flex-wrap gap-2">
            {['confirmed', 'approved'].includes(booking.status) && booking.serviceProgress?.status !== 'pet_arrived' && <button type="button" disabled={sending} onClick={() => runLifecycleAction('check_in')} className="h-8 rounded-lg bg-white px-3 text-[10px] font-bold text-slate-700 border">Check In</button>}
            {['confirmed', 'approved'].includes(booking.status) && booking.serviceProgress?.status === 'pet_arrived' && <button type="button" disabled={sending} onClick={() => runLifecycleAction('processing')} className="h-8 rounded-lg bg-emerald-600 px-3 text-[10px] font-bold text-white">Start Service</button>}
            {activeForUpdates && <button type="button" onClick={() => setEntryType('photo')} className="h-8 rounded-lg bg-white px-3 text-[10px] font-bold text-slate-700 border">Upload Photo</button>}
            {activeForUpdates && <button type="button" onClick={() => setEntryType('update')} className="h-8 rounded-lg bg-white px-3 text-[10px] font-bold text-slate-700 border">Send Update</button>}
            {booking.status === 'processing' && <button type="button" disabled={sending} onClick={() => runLifecycleAction('finished')} className="h-8 rounded-lg bg-sky-600 px-3 text-[10px] font-bold text-white">Ready for Pickup</button>}
            {booking.status === 'finished' && <button type="button" disabled={sending} onClick={() => runLifecycleAction('completed')} className="h-8 rounded-lg bg-slate-900 px-3 text-[10px] font-bold text-white">Complete Service</button>}
          </div>
          {['processing', 'finished'].includes(booking.status) && <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{quickCareUpdates.map(action => <button key={action[0]} type="button" disabled={sending} onClick={() => postQuickCareUpdate(action)} className="h-8 shrink-0 rounded-lg border border-primary-100 bg-white px-2.5 text-[9px] font-bold text-primary-700">{action[0]}</button>)}</div>}
        </div>
      )}

      {staffMode && permissions.canPostStaffUpdate && activeForUpdates && (
        <div className="border-t border-slate-100 pt-4 dark:border-slate-700">
          <div className="mb-3 flex gap-2" role="tablist">
            {[['update', 'Owner update'], ['photo', 'Photo'], ['internal_note', 'Internal note']].map(([value, label]) => <button key={value} type="button" onClick={() => setEntryType(value)} className={`h-8 rounded-lg px-3 text-[10px] font-black ${entryType === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
          </div>
          {entryType === 'photo' ? (
            <form onSubmit={submitPhoto} className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                <select value={photoCategory} onChange={event => setPhotoCategory(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none">
                  <option value="before">Before service</option><option value="during">During service</option><option value="after">After service</option><option value="result">Service result</option><option value="documentation">Documentation</option><option value="other">Other</option>
                </select>
                <input value={photoMessage} onChange={event => setPhotoMessage(event.target.value)} maxLength={2000} placeholder="Optional caption for the owner" className="h-10 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-primary-400" />
              </div>
              {photoPreviews.length ? <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2"><div className="flex max-w-[180px] gap-1 overflow-x-auto">{photoPreviews.map((preview, index) => <img key={preview} src={preview} alt={`Upload preview ${index + 1}`} className="h-14 w-14 shrink-0 rounded-lg object-cover" />)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{photoFiles.length} photo{photoFiles.length === 1 ? '' : 's'} selected</p><p className="text-[10px] text-slate-400">{Math.round(photoFiles.reduce((sum, file) => sum + file.size, 0) / 1024)} KB total{uploadProgress ? ` · ${uploadProgress}% uploaded` : ''}</p></div><button type="button" onClick={clearPhoto} disabled={sending} className="h-8 w-8 grid place-items-center rounded-lg text-rose-600 hover:bg-rose-50" aria-label="Remove selected photos"><Trash2 size={15} /></button></div> : <label className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-600 hover:border-primary-400"><Camera size={17} /> Choose up to 5 photos<input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={choosePhoto} className="hidden" /></label>}
              <button type="submit" disabled={sending || !photoFiles.length} className="h-10 rounded-lg bg-primary-600 px-4 text-xs font-black text-white disabled:opacity-50">{sending ? `Uploading ${uploadProgress || 0}%` : `Share ${photoFiles.length || ''} photo${photoFiles.length === 1 ? '' : 's'}`}</button>
            </form>
          ) : (
            <form onSubmit={submitStaffUpdate} className="space-y-2">
              {entryType === 'update' && <select value={category} onChange={event => setCategory(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="general">General update</option><option value="observation">Observation</option><option value="pickup">Pickup information</option><option value="follow_up">Follow-up information</option><option value="incident">Important update</option></select>}
              <textarea value={staffText} onChange={event => setStaffText(event.target.value)} maxLength={2000} rows={2} placeholder={entryType === 'internal_note' ? 'Visible only to authorized staff' : 'Short update for the pet owner'} className="w-full resize-none rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-primary-400" />
              <button type="submit" disabled={sending} className={`h-10 rounded-lg px-4 text-xs font-black text-white disabled:opacity-50 ${entryType === 'internal_note' ? 'bg-amber-600' : 'bg-primary-600'}`}>{sending ? 'Saving…' : entryType === 'internal_note' ? 'Save internal note' : 'Send owner update'}</button>
            </form>
          )}
        </div>
      )}

      {staffMode && permissions.canPostStaffUpdate && ['finished', 'completed'].includes(booking.status) && (
        <form onSubmit={submitAftercare} className="mt-4 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
          <div className="flex items-center gap-2"><FileText size={14} className="text-emerald-700" /><p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Aftercare</p></div>
          <textarea rows={2} maxLength={4000} value={aftercareInstructions} onChange={event => setAftercareInstructions(event.target.value)} placeholder="Custom aftercare instructions for the owner" className="w-full resize-none rounded-lg border border-emerald-100 bg-white p-3 text-xs outline-none focus:border-emerald-400" />
          <textarea rows={2} maxLength={4000} value={serviceNotes} onChange={event => setServiceNotes(event.target.value)} placeholder="Customer-friendly service notes (optional)" className="w-full resize-none rounded-lg border border-emerald-100 bg-white p-3 text-xs outline-none focus:border-emerald-400" />
          <button type="submit" disabled={sending || !aftercareInstructions.trim()} className="h-9 rounded-lg bg-emerald-700 px-4 text-[10px] font-black text-white disabled:opacity-50">Share Aftercare</button>
        </form>
      )}

      {summary?.serviceSummary && ['finished', 'completed'].includes(booking.status) && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex items-center gap-2"><FileText size={14} className="text-primary-600" /><div><p className="text-[9px] font-black uppercase tracking-widest text-primary-700">Digital Service Summary</p><p className="text-xs font-black text-slate-900">{summary.service?.name} · {summary.pet?.name}</p></div></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-white p-2"><p className="text-[8px] font-bold uppercase text-slate-400">Specialist</p><p className="text-[10px] font-bold text-slate-700">{senderName(summary.staff)}</p></div>
            <div className="rounded-lg bg-white p-2"><p className="text-[8px] font-bold uppercase text-slate-400">Branch</p><p className="text-[10px] font-bold text-slate-700">{summary.store?.name || 'Branch'}</p></div>
            <div className="rounded-lg bg-white p-2"><p className="text-[8px] font-bold uppercase text-slate-400">Duration</p><p className="text-[10px] font-bold text-slate-700">{summary.serviceSummary.actualDurationMinutes ?? summary.serviceSummary.estimatedDurationMinutes ?? '—'} min</p></div>
            <div className="rounded-lg bg-white p-2"><p className="text-[8px] font-bold uppercase text-slate-400">Photos</p><p className="text-[10px] font-bold text-slate-700">{summary.serviceSummary.photoCount || 0}</p></div>
          </div>
          {summary.serviceSummary.notes && <div className="mt-2 rounded-lg bg-white p-2"><p className="text-[8px] font-bold uppercase text-slate-400">Service notes</p><p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-700">{summary.serviceSummary.notes}</p></div>}
          {summary.serviceSummary.aftercareInstructions && <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 p-2"><p className="text-[8px] font-bold uppercase text-emerald-700">Aftercare instructions</p><p className="mt-1 whitespace-pre-wrap text-[11px] text-emerald-900">{summary.serviceSummary.aftercareInstructions}</p></div>}
          <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 text-[10px] text-slate-600"><span>{new Date(summary.serviceSummary.bookingDate).toLocaleDateString()} · {summary.serviceSummary.startTime}</span><span className="font-bold">PayMongo {summary.serviceSummary.paymentStatus} · ₱{Number(summary.serviceSummary.totalPrice || 0).toFixed(2)} · VAT ₱{Number(summary.serviceSummary.pricingBreakdown?.vatAmount || 0).toFixed(2)}</span></div>
        </section>
      )}

      {permissions.canMessage && messageAvailable && (
        <form onSubmit={submitMessage} className="mt-4 flex gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <div className="relative min-w-0 flex-1"><MessageCircle size={14} className="absolute left-3 top-3 text-slate-400" /><input value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} placeholder={staffMode ? 'Message the pet owner' : 'Message the service team'} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-primary-400" /></div>
          <button type="submit" disabled={sending || !message.trim()} className="h-10 w-10 shrink-0 rounded-lg bg-slate-900 text-white grid place-items-center disabled:opacity-40" aria-label="Send service message">{sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</button>
        </form>
      )}

      {!messageAvailable && <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500"><Clock3 size={14} /> Communication opens after the paid booking is confirmed.</div>}
      {staffMode && !permissions.canPostStaffUpdate && <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800"><AlertCircle size={14} /> Only the assigned service team or store owner can post updates.</div>}
    </section>
  );
};

export default ServiceCommunicationPanel;
