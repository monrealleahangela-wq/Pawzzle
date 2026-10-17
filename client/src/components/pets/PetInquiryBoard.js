import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import petInquiryService from '../../services/petInquiryService';
import { getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_LABELS = {
  submitted: 'Submitted', awaiting_seller_response: 'Awaiting Seller Response',
  seller_responded: 'Seller Responded', additional_information_required: 'Additional Information Required',
  resolved: 'Resolved', cancelled: 'Cancelled'
};
const ACTION_LABELS = {
  seller_reply: 'Reply to Customer', information_requested: 'Request More Information',
  customer_follow_up: 'Send Follow-up', resolved: 'Mark Resolved', cancelled: 'Cancel Inquiry'
};
const newKey = () => (window.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
const formattedDate = date => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
};

const PetInquiryBoard = ({
  mode = 'customer', petId, petAvailable = false, petName, focusId, onLogin,
  title = 'Pet Inquiries',
  description = 'Questions and seller responses are tracked separately from chat and purchase requests.'
}) => {
  const { user } = useAuth();
  const viewerId = user?._id;
  const [inquiries, setInquiries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadedViewerId, setLoadedViewerId] = useState(null);
  const [page, setPage] = useState(1);
  const [sellerFilter, setSellerFilter] = useState('needs_response');
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const request = useRef(0);
  const submitKey = useRef(null);
  const actionKey = useRef(null);

  useEffect(() => {
    setInquiries([]); setSelected(null); setPage(1); setNotice(''); setError('');
    setSubject(''); setQuestion(''); setBody(''); setShowForm(false);
    submitKey.current = null; actionKey.current = null;
  }, [viewerId]);

  useEffect(() => {
    const sequence = ++request.current;
    setLoading(true);
    setError('');
    petInquiryService.list({ page, limit: 10, ...(petId ? { pet: petId } : {}),
      ...(mode === 'seller' && sellerFilter !== 'all' ? { status: sellerFilter } : {}) })
      .then(({ data }) => {
        if (request.current !== sequence) return;
        setInquiries(data.inquiries || []);
        setLoadedViewerId(viewerId);
        setPages(Math.max(1, data.pagination?.totalPages || 1));
      })
      .catch(() => { if (request.current === sequence) setError('Unable to load pet inquiries. Please retry.'); })
      .finally(() => { if (request.current === sequence) setLoading(false); });
    return () => { request.current += 1; };
  }, [mode, petId, page, refresh, sellerFilter, viewerId]);

  useEffect(() => {
    if (!focusId) return;
    let active = true;
    petInquiryService.get(focusId).then(({ data }) => { if (active) setSelected(data.inquiry); })
      .catch(() => { if (active) setError('This inquiry is unavailable or you do not have access.'); });
    return () => { active = false; };
  }, [focusId, viewerId]);

  const submit = async event => {
    event.preventDefault();
    if (!petId) return;
    if (!submitKey.current) submitKey.current = newKey();
    setSaving(true); setError(''); setNotice('');
    try {
      const { data } = await petInquiryService.create({ petId, subject, question, requestKey: submitKey.current });
      setSelected(data.inquiry);
      setShowForm(false); setSubject(''); setQuestion(''); submitKey.current = null;
      setNotice(data.replayed ? 'Your inquiry was already received.' : 'Your question was sent to the Store.');
      setPage(1); setRefresh(value => value + 1);
    } catch (failure) { setError(failure.response?.data?.message || 'Unable to send your inquiry. Please retry.'); }
    finally { setSaving(false); }
  };

  const act = async action => {
    if (!selected) return;
    const text = body.trim();
    if (['seller_reply', 'information_requested', 'customer_follow_up'].includes(action) && !text) {
      setError('Enter a message before continuing.'); return;
    }
    const signature = `${selected._id}:${action}:${text}`;
    if (actionKey.current?.signature !== signature) actionKey.current = { signature, key: newKey() };
    setSaving(true); setError(''); setNotice('');
    try {
      const { data } = await petInquiryService.act(selected._id, { action, body: text, requestKey: actionKey.current.key });
      setSelected(data.inquiry); setBody(''); actionKey.current = null;
      setNotice(data.replayed ? 'This update was already saved.' : 'Inquiry updated.');
      setRefresh(value => value + 1);
    } catch (failure) { setError(failure.response?.data?.message || 'Unable to update the inquiry. Please retry.'); }
    finally { setSaving(false); }
  };

  const visibleInquiries = loadedViewerId === viewerId ? inquiries : [];
  const visibleSelected = loadedViewerId === viewerId ? selected : null;
  const active = visibleSelected && !['resolved', 'cancelled'].includes(visibleSelected.status);
  const actions = mode === 'seller'
    ? ['seller_reply', 'information_requested', 'resolved']
    : ['customer_follow_up', 'cancelled'];
  return <section id="pet-inquiries" className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Pet inquiries">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-base font-black text-slate-900">{title}</h2><p className="text-xs text-slate-500">{description}</p></div>
      {mode === 'customer' && petId && <div className="flex flex-wrap items-center gap-2"><Link to="/pet-inquiries" className="text-xs font-semibold text-primary-700 underline">View all my inquiries</Link>{petAvailable && <button type="button" onClick={() => onLogin ? onLogin() : setShowForm(value => !value)} className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white">Ask About This Pet</button>}</div>}
    </div>
    {mode === 'seller' && <label className="mt-3 flex items-center gap-2 text-xs font-semibold">Show
      <select aria-label="Filter pet inquiries" value={sellerFilter} onChange={event => { setSellerFilter(event.target.value); setPage(1); }} className="rounded-lg border border-slate-200 p-2">
        <option value="needs_response">Needs Seller Response</option><option value="all">All Inquiries</option>
        <option value="additional_information_required">Awaiting Customer Information</option><option value="resolved">Resolved</option>
      </select>
    </label>}
    {showForm && <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-semibold">Ask about {petName || 'this pet'}</p>
      <label className="grid gap-1 text-xs font-semibold">Subject<input aria-label="Inquiry subject" required minLength={3} maxLength={160} value={subject} onChange={event => { setSubject(event.target.value); submitKey.current = null; }} className="rounded-lg border p-2" /></label>
      <label className="grid gap-1 text-xs font-semibold">Question<textarea aria-label="Inquiry question" required minLength={10} maxLength={2000} value={question} onChange={event => { setQuestion(event.target.value); submitKey.current = null; }} className="min-h-24 rounded-lg border p-2" /></label>
      <button type="submit" disabled={saving} className="justify-self-start rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Sending…' : 'Send Inquiry'}</button>
    </form>}
    {error && <div role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{error}<button type="button" onClick={() => setRefresh(value => value + 1)} className="ml-2 underline">Retry</button></div>}
    {notice && <p role="status" className="mt-3 text-xs text-emerald-700">{notice}</p>}
    {loading ? <p role="status" className="mt-4 text-sm text-slate-500">Loading inquiries…</p>
      : visibleInquiries.length === 0 && !visibleSelected ? <p className="mt-4 text-sm text-slate-500">{mode === 'seller' && sellerFilter === 'needs_response' ? 'No inquiries need a seller response.' : 'No inquiries yet.'}</p>
        : <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className="max-h-96 space-y-2 overflow-y-auto" aria-label="Inquiry list">{visibleInquiries.map(inquiry => <button type="button" key={inquiry._id} onClick={() => setSelected(inquiry)} className={`flex w-full min-w-0 gap-2 rounded-xl border p-3 text-left ${visibleSelected?._id === inquiry._id ? 'border-primary-500 bg-primary-50' : 'border-slate-200'}`}>
            {inquiry.petSnapshot?.image && <img src={getImageUrl(inquiry.petSnapshot.image)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
            <span className="min-w-0"><span className="block truncate text-sm font-bold">{inquiry.subject}</span><span className="block text-xs text-slate-500">{inquiry.petSnapshot?.name} · {STATUS_LABELS[inquiry.status] || inquiry.status}</span>{mode === 'seller' && ['submitted', 'awaiting_seller_response'].includes(inquiry.status) && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Needs response</span>}<span className="block text-xs text-slate-400">{formattedDate(inquiry.lastActivityAt)}</span></span>
          </button>)}</div>
          {visibleSelected && <div className="min-w-0 rounded-xl border border-slate-200 p-3" aria-label="Inquiry details">
            <h3 className="break-words text-sm font-bold">{visibleSelected.subject}</h3>
            <p className="text-xs text-slate-500">Reference {visibleSelected._id} · {STATUS_LABELS[visibleSelected.status] || visibleSelected.status}</p>
            <Link to={`/pets/${visibleSelected.pet}`} className="text-xs font-semibold text-primary-700 underline">View pet listing</Link>
            <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto">{(visibleSelected.events || []).map(event => <li key={event._id || event.createdAt} className="rounded-lg bg-slate-50 p-2"><p className="text-xs font-semibold">{STATUS_LABELS[event.status] || event.status} · {formattedDate(event.createdAt)}</p>{event.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{event.body}</p>}</li>)}</ol>
            {active && <div className="mt-3 grid gap-2"><label className="grid gap-1 text-xs font-semibold">{mode === 'seller' ? 'Reply or information request' : 'Follow-up question'}<textarea aria-label="Inquiry response" maxLength={2000} value={body} onChange={event => { setBody(event.target.value); actionKey.current = null; }} className="min-h-20 rounded-lg border p-2" /></label><div className="flex flex-wrap gap-2">{actions.map(action => <button key={action} type="button" disabled={saving} onClick={() => act(action)} className="rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700 disabled:opacity-50">{ACTION_LABELS[action]}</button>)}</div></div>}
          </div>}
        </div>}
    <div className="mt-3 flex items-center justify-end gap-2 text-xs"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button></div>
  </section>;
};

export default PetInquiryBoard;
