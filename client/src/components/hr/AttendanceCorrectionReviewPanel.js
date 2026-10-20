import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrService } from '../../services/apiService';
import { pawzzleConfirm, pawzzlePrompt } from '../../utils/pawzzleDialog';

const formatDateTime = value => value ? new Date(value).toLocaleString('en-PH') : '—';
const statusTone = status => status === 'approved'
  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  : status === 'rejected'
    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';

const AttendanceCorrectionReviewPanel = ({ requests = [], canReview, onChanged }) => {
  const [busyId, setBusyId] = useState('');

  const viewEvidence = async request => {
    setBusyId(request._id);
    try {
      const { data } = await hrService.getAttendanceCorrectionEvidence(request._id);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to open supporting evidence.'); }
    finally { setBusyId(''); }
  };

  const review = async (request, action) => {
    const reviewerNote = await pawzzlePrompt(action === 'reject'
      ? 'Explain why this attendance correction is being rejected.'
      : 'Enter the review basis for approving this attendance correction.', {
      title: action === 'reject' ? 'Reject attendance correction' : 'Approve attendance correction',
      inputLabel: action === 'reject' ? 'Rejection reason' : 'Review basis',
      required: true,
      minLength: 3,
      multiline: true,
      confirmLabel: 'Continue',
      tone: action === 'reject' ? 'danger' : 'warning'
    });
    if (reviewerNote === null) return;
    if (action === 'approve' && !await pawzzleConfirm(`Apply ${formatDateTime(request.proposedTimeOut)} as the employee's clock-out? This may invalidate draft payroll calculations.`, {
      title: 'Apply corrected clock-out?',
      confirmLabel: 'Approve and apply',
      tone: 'warning'
    })) return;
    setBusyId(request._id);
    try {
      const { data } = await hrService.reviewAttendanceCorrection(request._id, { action, reviewerNote: reviewerNote.trim() });
      toast.success(data.message);
      await onChanged?.();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to review the attendance correction.'); }
    finally { setBusyId(''); }
  };

  const pendingRequests = requests.filter(request => request.status === 'pending');
  const reviewedRequests = requests.filter(request => request.status !== 'pending');

  const requestDetails = (request, includeEvidence = true) => <>
    <dl className="grid gap-2 text-xs sm:grid-cols-2">
      <div><dt className="text-slate-500">Original clock-in</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{formatDateTime(request.originalTimeIn)}</dd></div>
      <div><dt className="text-slate-500">Proposed clock-out</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{formatDateTime(request.proposedTimeOut)}</dd></div>
      <div className="sm:col-span-2"><dt className="text-slate-500">Employee reason</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{request.reason}</dd></div>
      {request.reviewedBy && <div className="sm:col-span-2"><dt className="text-slate-500">Reviewed by</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{request.reviewedBy.firstName} {request.reviewedBy.lastName} · {formatDateTime(request.reviewedAt)}</dd></div>}
      {request.rejectionReason && <div className="sm:col-span-2 text-red-700 dark:text-red-300"><dt>Rejection reason</dt><dd className="font-medium">{request.rejectionReason}</dd></div>}
    </dl>
    {includeEvidence && <button type="button" disabled={busyId === request._id} onClick={() => viewEvidence(request)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700">
      <ExternalLink className="mr-1 inline" size={14} />View evidence
    </button>}
  </>;

  return <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
      <div><h2 className="font-bold text-slate-950 dark:text-white">Attendance correction review</h2><p className="text-xs text-slate-500">Review employee-proposed clock-out times and private evidence.</p></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pendingRequests.length ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>{pendingRequests.length} pending</span>
    </div>

    {!!pendingRequests.length && <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {pendingRequests.map(request => <article key={request._id} className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{request.employee?.firstName} {request.employee?.lastName} · {request.workDate}</p><p className="text-[11px] text-slate-500">Submitted {formatDateTime(request.submittedAt)}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busyId === request._id} onClick={() => viewEvidence(request)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700"><ExternalLink className="mr-1 inline" size={14} />View evidence</button>
            {canReview && <><button type="button" disabled={!!busyId} onClick={() => review(request, 'approve')} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">Approve</button><button type="button" disabled={!!busyId} onClick={() => review(request, 'reject')} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700 dark:text-red-300">Reject</button></>}
            {busyId === request._id && <Loader2 className="animate-spin" size={16} />}
          </div>
        </div>
        <details className="mt-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <summary className="cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-300">View request details</summary>
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">{requestDetails(request, false)}</div>
        </details>
      </article>)}
    </div>}

    {!pendingRequests.length && !reviewedRequests.length && <p className="p-5 text-center text-sm text-slate-500">No attendance correction requests.</p>}
    {!pendingRequests.length && !!reviewedRequests.length && <p className="px-4 py-3 text-sm text-slate-500">No corrections are waiting for approval.</p>}

    {!!reviewedRequests.length && <details className="border-t border-slate-100 dark:border-slate-800">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200">
        <span>Reviewed history</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">{reviewedRequests.length}</span>
      </summary>
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
        {reviewedRequests.map(request => <article key={request._id} className="px-4 py-3">
          <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{request.employee?.firstName} {request.employee?.lastName} · {request.workDate}</p><p className="text-[11px] text-slate-500">Reviewed {formatDateTime(request.reviewedAt)}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${statusTone(request.status)}`}>{request.status}</span></div>
          <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-slate-500">View details</summary><div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">{requestDetails(request)}</div></details>
        </article>)}
      </div>
    </details>}
  </section>;
};

export default AttendanceCorrectionReviewPanel;
