import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { hrService } from '../../services/apiService';
import { formatPeso } from '../../utils/paymentSummary';
import { pawzzlePrompt } from '../../utils/pawzzleDialog';

const money = formatPeso;
const statusLabel = value => String(value || 'pending').replaceAll('_', ' ');
const dataUrlForFile = file => new Promise((resolve, reject) => {
  if (!file) return resolve(undefined);
  const reader = new FileReader();
  reader.onload = () => resolve({ originalName: file.name, mimeType: file.type, base64: String(reader.result || '').split(',').at(-1) });
  reader.onerror = () => reject(new Error('Unable to read the selected payment proof.'));
  reader.readAsDataURL(file);
});

const PayrollPaymentWorkflow = ({ period, actorId, canPrepare, canConfirm, allowSelfProcessing = false, onChanged }) => {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formFor, setFormFor] = useState(null);
  const [form, setForm] = useState({ status: 'processing', externalMethod: 'bank_transfer', amount: '', referenceNumber: '', transferAt: new Date().toISOString().slice(0, 16), accountName: '', accountNumber: '', bankName: '', file: null });

  const load = useCallback(async () => {
    try {
      const response = await hrService.getPayrollPayments(period._id);
      setPayments(response.data.payments || []);
      setSummary(response.data.summary || null);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to load employee payment statuses.'); }
  }, [period._id]);
  useEffect(() => { setFormFor(null); load(); }, [load]);

  const openForm = (row, retryOf = '') => {
    setFormFor({ payslipId: row.payslip._id, retryOf });
    setForm({ status: 'processing', externalMethod: 'bank_transfer', amount: String(row.payslip.netPay || ''), referenceNumber: '', transferAt: new Date().toISOString().slice(0, 16), accountName: '', accountNumber: '', bankName: '', file: null });
  };
  const submit = async event => {
    event.preventDefault();
    if (!formFor) return;
    setBusy(true);
    try {
      const proof = await dataUrlForFile(form.file);
      const payload = {
        status: form.status,
        amount: Number(form.amount),
        externalMethod: form.externalMethod,
        referenceNumber: form.referenceNumber,
        transferAt: new Date(form.transferAt).toISOString(),
        destination: { type: form.externalMethod, bankName: form.bankName, accountName: form.accountName, accountNumber: form.accountNumber },
        proof,
        idempotencyKey: window.crypto?.randomUUID?.() || `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`
      };
      const response = formFor.retryOf
        ? await hrService.retryPayrollPayment(formFor.retryOf, payload)
        : await hrService.createPayrollPayment(period._id, formFor.payslipId, payload);
      toast.success(response.data.message);
      setFormFor(null); await load(); onChanged?.();
    } catch (error) { toast.error(error.response?.data?.message || error.message || 'Unable to record external payment.'); }
    finally { setBusy(false); }
  };
  const changeStatus = async (attempt, nextStatus) => {
    const reason = await pawzzlePrompt(`Explain why this payment is being moved to ${statusLabel(nextStatus)}.`, {
      title: 'Update payment status',
      inputLabel: 'Reason',
      required: true,
      minLength: 5,
      multiline: true,
      confirmLabel: 'Continue'
    });
    if (reason === null) return;
    setBusy(true);
    try {
      const payload = { status: nextStatus, reason };
      if (nextStatus === 'for_confirmation') {
        const fileInput = document.querySelector(`[data-payment-proof="${attempt._id}"]`);
        const proof = await dataUrlForFile(fileInput?.files?.[0]);
        if (!proof) { toast.error('Attach payment proof before requesting confirmation.'); return; }
        payload.proof = proof;
      }
      const response = await hrService.updatePayrollPayment(attempt._id, payload);
      toast.success(response.data.message); await load(); onChanged?.();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to update payment status.'); }
    finally { setBusy(false); }
  };
  const confirm = async attempt => {
    const reason = await pawzzlePrompt('Confirm that you independently verified the external bank or payment record.', {
      title: 'Confirm external payment',
      inputLabel: 'Verification basis',
      required: true,
      minLength: 5,
      multiline: true,
      confirmLabel: 'Confirm payment',
      tone: 'warning'
    });
    if (reason === null) return;
    setBusy(true);
    try {
      const response = await hrService.confirmPayrollPayment(attempt._id, { reason });
      toast.success(response.data.message); await load(); onChanged?.();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to confirm this external payment.'); }
    finally { setBusy(false); }
  };
  const downloadProof = async attempt => {
    try {
      const response = await hrService.getPayrollPaymentProof(attempt._id);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = url; link.download = attempt.proof?.originalName || 'payment-proof'; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to download protected payment proof.'); }
  };

  return <section aria-label="Employee salary payments" className="mt-5 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">External salary payments</h3><p className="text-xs text-slate-600 dark:text-slate-300">Pawzzle does not initiate bank transfers. Each employee payment is recorded and confirmed separately under Store payroll permissions.</p></div>{summary && <p className="text-right text-xs">{summary.confirmedEmployeeCount}/{summary.requiredEmployeeCount} confirmed<br />Outstanding {money(summary.outstandingAmount)}</p>}</div>
    <div className="divide-y divide-slate-200 dark:divide-slate-700">
      {payments.map(row => {
        const slip = row.payslip;
        const attempt = row.attempts?.[0];
        const isSelf = String(slip.employee?._id || slip.employee || '') === String(actorId || '');
        const canStart = canPrepare && (!isSelf || allowSelfProcessing) && ['pending', 'unpaid', 'failed'].includes(row.paymentStatus);
        return <article key={slip._id} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{slip.employeeSnapshot?.name || `${slip.employee?.firstName || ''} ${slip.employee?.lastName || ''}`.trim() || 'Employee'}</p><p className="text-xs text-slate-600 dark:text-slate-300">Approved net salary: {money(slip.netPay)} · <span className="capitalize">{statusLabel(row.paymentStatus)}</span></p>{attempt && <p className="mt-1 text-xs text-slate-500">{attempt.externalMethod?.replaceAll('_', ' ')} · ref {attempt.referenceMask || '—'} · {new Date(attempt.transferAt).toLocaleString()}</p>}{attempt?.failureReason && <p className="text-xs text-red-700">Failure: {attempt.failureReason}</p>}{attempt?.holdReason && <p className="text-xs text-amber-700">On hold: {attempt.holdReason}</p>}</div>
            <div className="flex flex-wrap gap-2">
              {canStart && <button type="button" onClick={() => openForm(row, row.paymentStatus === 'failed' ? attempt?._id : '')} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">{row.paymentStatus === 'failed' ? 'Retry as new attempt' : 'Record external payment'}</button>}
              {attempt?.proof?.available && canPrepare && <button type="button" onClick={() => downloadProof(attempt)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-600">Download proof</button>}
              {attempt?.status === 'processing' && canPrepare && (!isSelf || allowSelfProcessing) && <><button type="button" disabled={busy} onClick={() => changeStatus(attempt, 'for_confirmation')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40 dark:border-slate-600">Request confirmation</button><button type="button" disabled={busy} onClick={() => changeStatus(attempt, 'on_hold')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40 dark:border-slate-600">On hold</button><button type="button" disabled={busy} onClick={() => changeStatus(attempt, 'failed')} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40">Failed</button><input aria-label="Payment proof file" data-payment-proof={attempt._id} type="file" accept="image/jpeg,image/png,application/pdf" className="max-w-44 text-xs" /></>}
              {attempt?.status === 'for_confirmation' && canPrepare && (!isSelf || allowSelfProcessing) && <><button type="button" disabled={busy} onClick={() => changeStatus(attempt, 'on_hold')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40 dark:border-slate-600">On hold</button><button type="button" disabled={busy} onClick={() => changeStatus(attempt, 'failed')} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40">Failed</button></>}
              {attempt?.status === 'on_hold' && canPrepare && (!isSelf || allowSelfProcessing) && <button type="button" disabled={busy} onClick={() => changeStatus(attempt, 'processing')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40 dark:border-slate-600">Resume processing</button>}
              {attempt?.status === 'for_confirmation' && canConfirm && (!isSelf || allowSelfProcessing) && (allowSelfProcessing || (String(attempt.preparedBy?._id || attempt.preparedBy) !== String(actorId) && String(attempt.evidenceSubmittedBy?._id || attempt.evidenceSubmittedBy) !== String(actorId))) && <button type="button" disabled={busy} onClick={() => confirm(attempt)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Confirm external payment</button>}
              {isSelf && !allowSelfProcessing && <span className="self-center text-xs text-amber-800">Finance staff cannot process their own pay.</span>}
              {formFor?.payslipId === slip._id && <button type="button" onClick={() => setFormFor(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-600">Close form</button>}
            </div>
          </div>
          {formFor?.payslipId === slip._id && <form onSubmit={submit} className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900">
            <label className="text-xs font-semibold">External method<select value={form.externalMethod} onChange={event => setForm({ ...form, externalMethod: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-600">{['bank_transfer', 'gcash', 'maya', 'cash', 'cheque', 'other'].map(method => <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>)}</select></label>
            <label className="text-xs font-semibold">Payment state<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-600"><option value="processing">Processing — transfer is pending</option><option value="for_confirmation">For Confirmation — transfer completed externally</option></select></label>
            <label className="text-xs font-semibold">Exact approved net amount<input readOnly value={form.amount} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 p-2 dark:border-slate-600 dark:bg-slate-800" /></label>
            <label className="text-xs font-semibold">External reference<input required minLength="4" maxLength="160" value={form.referenceNumber} onChange={event => setForm({ ...form, referenceNumber: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-600" /></label>
            <label className="text-xs font-semibold">Transfer date/time<input required type="datetime-local" value={form.transferAt} onChange={event => setForm({ ...form, transferAt: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-600" /></label>
            {['bank_transfer', 'gcash', 'maya'].includes(form.externalMethod) && <><label className="text-xs font-semibold">Recipient account name<input required value={form.accountName} onChange={event => setForm({ ...form, accountName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-600" /></label><label className="text-xs font-semibold">Recipient account number<input required value={form.accountNumber} onChange={event => setForm({ ...form, accountNumber: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-600" /></label><label className="text-xs font-semibold">Bank / provider name (optional)<input value={form.bankName} onChange={event => setForm({ ...form, bankName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-600" /></label></>}
            <label className="text-xs font-semibold sm:col-span-2">Protected payment proof {form.status === 'for_confirmation' ? '(required)' : '(optional)'}<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={event => setForm({ ...form, file: event.target.files?.[0] || null })} className="mt-1 block w-full text-xs" /></label>
            <p className="text-xs text-slate-500 sm:col-span-2">Account details and evidence are encrypted at rest. References are masked in review. No transfer is made by Pawzzle.</p>
            <button disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50 sm:col-span-2">{form.status === 'for_confirmation' ? 'Submit for Independent Confirmation' : 'Record as Processing'}</button>
          </form>}
        </article>;
      })}
      {!payments.length && <p className="py-4 text-sm text-slate-500">No employee payslips exist in this approved payroll period.</p>}
    </div>
  </section>;
};

export default PayrollPaymentWorkflow;
