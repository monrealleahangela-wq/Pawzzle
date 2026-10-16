import React, { useMemo, useState } from 'react';
import { AlertCircle, FileImage, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrService } from '../../services/apiService';

const reasonOptions = [
  ['forgot_before_leaving', 'Forgot to clock out before leaving the Store'],
  ['device_or_internet', 'Device or internet connection problem'],
  ['application_malfunction', 'Attendance application malfunction'],
  ['other', 'Other legitimate reason']
];
const formatDateTime = value => value ? new Date(value).toLocaleString('en-PH') : '—';
const localDateTime = value => {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const AttendanceCorrectionRequestPanel = ({ records = [], requests = [], onSubmitted }) => {
  const eligible = useMemo(() => records.filter(row => !row.isDerived && row.timeIn?.at && !row.timeOut?.at), [records]);
  const pendingByAttendance = useMemo(() => new Map(requests.filter(item => item.status === 'pending').map(item => [String(item.attendance?._id || item.attendance), item])), [requests]);
  const [selectedId, setSelectedId] = useState('');
  const [reasonCategory, setReasonCategory] = useState('forgot_before_leaving');
  const [reason, setReason] = useState('');
  const [proposedTimeOut, setProposedTimeOut] = useState('');
  const [evidence, setEvidence] = useState(null);
  const [busy, setBusy] = useState(false);
  const selected = eligible.find(row => String(row._id) === selectedId);

  const choose = id => {
    const row = eligible.find(item => String(item._id) === String(id));
    setSelectedId(String(id || ''));
    setProposedTimeOut(row?.timeIn?.at ? localDateTime(new Date()) : '');
  };

  const submit = async event => {
    event.preventDefault();
    if (!selected) return toast.error('Select an incomplete attendance session.');
    if (!evidence) return toast.error('Supporting evidence is required.');
    setBusy(true);
    try {
      const data = new FormData();
      data.append('attendanceId', selected._id);
      data.append('reasonCategory', reasonCategory);
      data.append('reason', reason.trim());
      data.append('proposedTimeOut', new Date(proposedTimeOut).toISOString());
      data.append('evidence', evidence);
      const response = await hrService.requestAttendanceCorrection(data);
      toast.success(response.data.message);
      setSelectedId(''); setReason(''); setProposedTimeOut(''); setEvidence(null);
      await onSubmitted?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to submit the attendance correction request.');
    } finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900 dark:bg-amber-950/20">
    <div className="flex gap-3"><AlertCircle className="mt-0.5 shrink-0 text-amber-700" size={20} /><div><h2 className="font-bold">Forgot to Clock Out?</h2><p className="text-sm text-slate-600 dark:text-slate-300">Your original clock-in stays unchanged. A proposed clock-out affects attendance and payroll only after an authorized review.</p></div></div>
    {eligible.length > 0 && <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold sm:col-span-2">Incomplete attendance session<select required value={selectedId} onChange={event => choose(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"><option value="">Select a session</option>{eligible.map(row => <option key={row._id} value={row._id} disabled={pendingByAttendance.has(String(row._id))}>{row.workDate} · clocked in {formatDateTime(row.timeIn.at)}{pendingByAttendance.has(String(row._id)) ? ' · pending review' : ''}</option>)}</select></label>
      <label className="text-sm font-semibold">Proposed clock-out<input required type="datetime-local" value={proposedTimeOut} min={selected?.timeIn?.at ? localDateTime(selected.timeIn.at) : undefined} max={localDateTime(new Date())} onChange={event => setProposedTimeOut(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900" /></label>
      <label className="text-sm font-semibold">Reason type<select required value={reasonCategory} onChange={event => setReasonCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">{reasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-semibold sm:col-span-2">Explanation<textarea required minLength={10} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder={reasonCategory === 'other' ? 'Explain the legitimate reason' : 'Provide details for the reviewer'} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900" /></label>
      <label className="text-sm font-semibold sm:col-span-2"><span className="flex items-center gap-2"><FileImage size={16} />Supporting evidence (JPG, PNG, or WEBP; maximum 5 MB)</span><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setEvidence(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
      <button disabled={busy || !selectedId} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{busy ? <><Loader2 className="mr-2 inline animate-spin" size={15} />Submitting…</> : 'Submit for Review'}</button>
    </form>}
    {!eligible.length && <p className="mt-4 text-sm text-slate-500">There are no incomplete attendance sessions eligible for correction.</p>}
    {requests.length > 0 && <div className="mt-5 space-y-2"><h3 className="text-sm font-bold">My correction requests</h3>{requests.map(item => <article key={item._id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{item.workDate} · proposed {formatDateTime(item.proposedTimeOut)}</span><span className="capitalize">{item.status}</span></div><p className="mt-1 text-slate-600 dark:text-slate-300">{item.reason}</p>{item.rejectionReason && <p className="mt-1 text-red-700 dark:text-red-300">Rejection reason: {item.rejectionReason}</p>}{item.payrollImpact?.manualReconciliationRequired && <p className="mt-1 text-amber-700">Finalized payroll requires separate reconciliation.</p>}</article>)}</div>}
  </section>;
};

export default AttendanceCorrectionRequestPanel;
