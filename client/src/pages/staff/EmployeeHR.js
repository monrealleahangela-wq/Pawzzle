import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CalendarOff, ReceiptText, MapPin, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrService } from '../../services/apiService';

const tabs = [
  { id: 'attendance', label: 'Attendance', path: '/staff/attendance', icon: Clock },
  { id: 'leave', label: 'Leave', path: '/staff/leave', icon: CalendarOff },
  { id: 'payslips', label: 'Payslips', path: '/staff/payslips', icon: ReceiptText }
];
const formatDate = value => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const formatTime = value => value ? new Date(value).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '—';
const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusClass = status => status === 'approved' || status === 'present' || status === 'recorded_paid'
  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  : status === 'rejected' || status === 'cancelled'
    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';

const EmployeeHR = ({ initialTab = 'attendance' }) => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attendance, setAttendance] = useState({ today: null, schedule: null, records: [] });
  const [leaveData, setLeaveData] = useState({ leaves: [], leaveTypes: [] });
  const [payslips, setPayslips] = useState([]);
  const [leaveForm, setLeaveForm] = useState({ leaveTypeKey: '', startDate: '', endDate: '', reason: '', attachmentUrl: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (initialTab === 'attendance') setAttendance((await hrService.getMyAttendance()).data);
      if (initialTab === 'leave') setLeaveData((await hrService.getMyLeaves()).data);
      if (initialTab === 'payslips') setPayslips((await hrService.getMyPayslips()).data.payslips || []);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to load your employment records.'); }
    finally { setLoading(false); }
  }, [initialTab]);
  useEffect(() => { load(); }, [load]);

  const captureLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'));
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => reject(new Error('Allow location access to record attendance.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
  const recordAttendance = async action => {
    setBusy(true);
    try {
      const location = await captureLocation();
      const response = action === 'in' ? await hrService.timeIn(location) : await hrService.timeOut(location);
      toast.success(response.data.message); await load();
    } catch (error) { toast.error(error.response?.data?.message || error.message || 'Unable to record attendance.'); }
    finally { setBusy(false); }
  };
  const submitLeave = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const response = await hrService.requestLeave(leaveForm); toast.success(response.data.message);
      setLeaveForm({ leaveTypeKey: '', startDate: '', endDate: '', reason: '', attachmentUrl: '' }); await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to submit leave request.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 text-slate-900 dark:text-slate-100">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">My Employment</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Attendance, leave requests, and finalized payslips for your Store.</p>
      </div>
      <nav className="mb-5 flex gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => <Link key={tab.id} to={tab.path} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${initialTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}><tab.icon size={16} />{tab.label}</Link>)}
      </nav>
      {loading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="animate-spin text-primary" /></div> : null}

      {!loading && initialTab === 'attendance' && <div className="space-y-5">
        <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today</p><h2 className="mt-1 text-lg font-bold capitalize">{attendance.today?.status?.replaceAll('_', ' ') || 'Not timed in'}</h2></div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Server time recorded</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-slate-500">Shift</p><p className="font-semibold">{attendance.schedule?.isWorkDay ? `${attendance.schedule.start}–${attendance.schedule.end}` : 'Rest day'}</p></div>
              <div><p className="text-slate-500">Time In</p><p className="font-semibold">{formatTime(attendance.today?.timeIn?.at)}</p></div>
              <div><p className="text-slate-500">Time Out</p><p className="font-semibold">{formatTime(attendance.today?.timeOut?.at)}</p></div>
              <div><p className="text-slate-500">Hours Worked</p><p className="font-semibold">{((attendance.today?.workedMinutes || 0) / 60).toFixed(2)}</p></div>
            </div>
            <div className="mt-5 flex gap-3">
              <button disabled={busy || !!attendance.today?.timeIn?.at} onClick={() => recordAttendance('in')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Time In</button>
              <button disabled={busy || !attendance.today?.timeIn?.at || !!attendance.today?.timeOut?.at} onClick={() => recordAttendance('out')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold dark:border-slate-700 disabled:opacity-40">Time Out</button>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <MapPin className="text-primary" size={22} /><h2 className="mt-3 font-bold">Workplace check</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Your device location is sent only when you tap Time In or Time Out. The backend verifies distance from your assigned Store.</p>
            <p className="mt-3 text-xs text-slate-500">GPS can be inaccurate or spoofed. Low accuracy and out-of-area attempts are rejected or flagged under Store policy.</p>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="font-bold">Attendance History</h2></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60"><tr>{['Date','Shift','Time In','Time Out','Hours','Late','Undertime','Status'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{attendance.records.map(row => <tr key={row._id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-3">{row.workDate}</td><td className="px-4 py-3">{row.schedule?.start || '—'}–{row.schedule?.end || '—'}</td><td className="px-4 py-3">{formatTime(row.timeIn?.at)}</td><td className="px-4 py-3">{formatTime(row.timeOut?.at)}</td><td className="px-4 py-3">{(row.workedMinutes / 60).toFixed(2)}</td><td className="px-4 py-3">{row.lateMinutes}m</td><td className="px-4 py-3">{row.undertimeMinutes}m</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table></div>
          {!attendance.records.length && <p className="p-6 text-center text-sm text-slate-500">No attendance records yet.</p>}
        </section>
      </div>}

      {!loading && initialTab === 'leave' && <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <form onSubmit={submitLeave} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div><h2 className="font-bold">Request Leave</h2><p className="text-sm text-slate-500">Paid or unpaid treatment comes from your Store policy.</p></div>
          <label className="block text-sm font-semibold">Leave type<select required value={leaveForm.leaveTypeKey} onChange={e => setLeaveForm({ ...leaveForm, leaveTypeKey: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"><option value="">Select leave type</option>{leaveData.leaveTypes.map(type => <option key={type.key} value={type.key}>{type.name} ({type.isPaid ? 'Paid' : 'Unpaid'})</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Start date<input required type="date" value={leaveForm.startDate} onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700" /></label><label className="text-sm font-semibold">End date<input required type="date" value={leaveForm.endDate} onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700" /></label></div>
          <label className="block text-sm font-semibold">Reason<textarea required minLength={5} rows={3} value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700" /></label>
          <label className="block text-sm font-semibold">Supporting document link <span className="font-normal text-slate-500">(optional)</span><input type="url" value={leaveForm.attachmentUrl} onChange={e => setLeaveForm({ ...leaveForm, attachmentUrl: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700" /></label>
          <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Submit Leave Request</button>
        </form>
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="font-bold">My Requests</h2></div><div className="divide-y divide-slate-100 dark:divide-slate-800">{leaveData.leaves.map(item => <article key={item._id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{item.leaveTypeName} · {item.isPaid ? 'Paid' : 'Unpaid'}</p><p className="text-sm text-slate-500">{formatDate(item.startDate)} – {formatDate(item.endDate)}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClass(item.status)}`}>{item.status}</span></div><p className="mt-2 text-sm">{item.reason}</p>{item.reviewComment && <p className="mt-2 text-xs text-slate-500">Reviewer note: {item.reviewComment}</p>}{item.status === 'pending' && <button onClick={async () => { try { await hrService.cancelLeave(item._id, {}); toast.success('Leave request cancelled.'); load(); } catch (error) { toast.error(error.response?.data?.message || 'Unable to cancel request.'); } }} className="mt-3 text-xs font-bold text-red-600">Cancel request</button>}</article>)}</div>{!leaveData.leaves.length && <p className="p-6 text-center text-sm text-slate-500">No leave requests yet.</p>}</section>
      </div>}

      {!loading && initialTab === 'payslips' && <section className="space-y-3">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><AlertCircle className="mr-2 inline text-primary" size={17} />Payslips appear after payroll is finalized and recorded as paid. Pawzzle does not claim an external bank transfer occurred.</div>
        {payslips.map(slip => <article key={slip._id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{slip.store?.name}</h2><p className="text-sm text-slate-500">{formatDate(slip.payrollPeriod?.periodStart)} – {formatDate(slip.payrollPeriod?.periodEnd)} · Pay date {formatDate(slip.payrollPeriod?.payDate)}</p></div><div className="text-right"><p className="text-xs text-slate-500">Net Pay</p><p className="text-xl font-bold text-primary">{money(slip.netPay)}</p></div></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><p className="text-slate-500">Base Pay</p><p className="font-semibold">{money(slip.basePay)}</p></div><div><p className="text-slate-500">Gross Pay</p><p className="font-semibold">{money(slip.grossPay)}</p></div><div><p className="text-slate-500">Days Present</p><p className="font-semibold">{slip.attendanceSummary?.daysPresent || 0}</p></div><div><p className="text-slate-500">Paid / Unpaid Leave</p><p className="font-semibold">{slip.attendanceSummary?.paidLeaveDays || 0} / {slip.attendanceSummary?.unpaidLeaveDays || 0}</p></div></div></article>)}
        {!payslips.length && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700"><ReceiptText className="mx-auto text-slate-400" /><p className="mt-3 font-semibold">No finalized payslips yet</p><p className="text-sm text-slate-500">Your Store will publish a payslip after payroll is approved and recorded as paid.</p></div>}
      </section>}
    </main>
  );
};

export default EmployeeHR;
