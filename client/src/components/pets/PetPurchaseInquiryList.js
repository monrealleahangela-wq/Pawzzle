import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MessageSquare, PawPrint, RefreshCw } from 'lucide-react';
import { adoptionService, getImageUrl } from '../../services/apiService';

const STATUS_LABELS = {
  inquiry_submitted: 'Inquiry Submitted', under_review: 'Under Review', reserved: 'Reserved',
  approved: 'Approved', pickup_scheduling: 'Pickup Scheduling', pickup_confirmed: 'Pickup Confirmed',
  completed: 'Completed', cancelled: 'Cancelled', declined: 'Declined', expired: 'Expired'
};

const PAYMENT_LABELS = {
  unpaid: 'Payment Not Requested', payment_pending: 'Payment Requested', payment_cancelled: 'Payment Cancelled',
  partially_paid: 'Partially Paid', deposit_paid: 'Deposit Paid', paid_in_full: 'Paid in Full',
  payment_failed: 'Payment Failed', refunded: 'Refunded', awaiting_confirmation: 'Payment Confirmation Pending'
};

const timestamp = request => {
  const value = new Date(request.updatedAt || request.createdAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

const formatDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
};

const PetPurchaseInquiryList = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adoptionService.getMyRequests();
      setRequests(Array.isArray(response.data?.requests) ? response.data.requests : []);
    } catch (failure) {
      setRequests([]);
      setError(failure.response?.data?.message || 'Unable to load purchase inquiries.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ordered = useMemo(
    () => [...requests].sort((left, right) => timestamp(right) - timestamp(left)),
    [requests]
  );

  return <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Purchase inquiries">
    <div>
      <h2 className="text-base font-black text-slate-900">Purchase Inquiries</h2>
      <p className="text-xs text-slate-500">Requests started from a pet listing are shown here as well as in Messages.</p>
    </div>

    {loading ? <p role="status" className="mt-4 text-sm text-slate-500">Loading purchase inquiries…</p>
      : error ? <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{error}<button type="button" onClick={load} className="ml-2 inline-flex items-center gap-1 font-bold underline"><RefreshCw className="h-3 w-3" />Retry</button></div>
        : ordered.length === 0 ? <p className="mt-4 text-sm text-slate-500">No purchase inquiries yet.</p>
          : <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ordered.map(request => {
              const pet = request.pet || {};
              const conversationId = request.conversation?._id || request.conversation;
              const paymentStatus = request.paymentDetails?.paymentStatus;
              return <article key={request._id} className="flex min-w-0 gap-3 rounded-2xl border border-slate-200 p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                  {pet.images?.[0] ? <img src={getImageUrl(pet.images[0])} alt={pet.name || 'Pet'} className="h-full w-full object-cover" /> : <PawPrint className="h-6 w-6 text-slate-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-1">
                    <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{pet.name || 'Pet listing unavailable'}</p><p className="truncate text-xs text-slate-500">{pet.breed || pet.species || 'Pet purchase inquiry'}</p></div>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-800">{STATUS_LABELS[request.status] || String(request.status || 'Pending').replaceAll('_', ' ')}</span>
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><Clock className="h-3 w-3" />Updated {formatDate(request.updatedAt || request.createdAt)}</p>
                  {paymentStatus && <p className="mt-1 text-[10px] font-semibold text-slate-600">{PAYMENT_LABELS[paymentStatus] || paymentStatus.replaceAll('_', ' ')}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {conversationId && <Link to={`/messages/${conversationId}`} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-[10px] font-bold text-white"><MessageSquare className="h-3 w-3" />Open Messages</Link>}
                    {pet._id && <Link to={`/pets/${pet._id}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-700">View Pet</Link>}
                  </div>
                </div>
              </article>;
            })}
          </div>}
  </section>;
};

export default PetPurchaseInquiryList;
