import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrService } from '../../services/apiService';
import { pawzzleConfirm, pawzzlePrompt } from '../../utils/pawzzleDialog';

const formatDateTime = value => value ? new Date(value).toLocaleString('en-PH') : '—';

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

  return <section className="mb-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
    <div><h2 className="font-bold text-amber-950 dark:text-amber-100">Attendance correction review</h2><p className="text-xs text-amber-800 dark:text-amber-200">Employee-proposed times remain separate from attendance until approval. Evidence links are private and short-lived.</p></div>
    {requests.map(request => <article key={request._id} className="rounded-xl bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{request.employee?.firstName} {request.employee?.lastName} · {request.workDate}</p><p className="text-xs text-slate-500">Submitted {formatDateTime(request.submittedAt)}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold capitalize text-amber-800">{request.status}</span></div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Original clock-in</dt><dd>{formatDateTime(request.originalTimeIn)}</dd></div><div><dt className="text-xs text-slate-500">Proposed clock-out</dt><dd>{formatDateTime(request.proposedTimeOut)}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Employee reason</dt><dd>{request.reason}</dd></div>{request.reviewedBy && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Reviewed by</dt><dd>{request.reviewedBy.firstName} {request.reviewedBy.lastName} · {formatDateTime(request.reviewedAt)}</dd></div>}{request.rejectionReason && <div className="sm:col-span-2 text-red-700"><dt className="text-xs">Rejection reason</dt><dd>{request.rejectionReason}</dd></div>}</dl>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busyId === request._id} onClick={() => viewEvidence(request)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700"><ExternalLink className="mr-1 inline" size={14} />View evidence</button>{canReview && request.status === 'pending' && <><button type="button" disabled={!!busyId} onClick={() => review(request, 'approve')} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">Approve</button><button type="button" disabled={!!busyId} onClick={() => review(request, 'reject')} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700">Reject</button></>}{busyId === request._id && <Loader2 className="animate-spin" size={16} />}</div>
    </article>)}
    {!requests.length && <p className="rounded-xl bg-white p-5 text-center text-sm text-slate-500 dark:bg-slate-900">No attendance correction requests.</p>}
  </section>;
};

export default AttendanceCorrectionReviewPanel;
