import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Package, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import { orderReturnService } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { formatPeso } from '../../utils/paymentSummary';

const label = value => String(value || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const STATUS_TONE = status => ['resolved','refund_completed','refunded'].includes(status)
  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
  : ['rejected','cancelled'].includes(status) ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-amber-200 bg-amber-50 text-amber-800';

export default function ReturnsManagement({ adminMode = false }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = adminMode ? await orderReturnService.listForAdmin() : await orderReturnService.listForStore();
      setRows(response.data.returns || []);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to load return cases.'); }
    finally { setLoading(false); }
  }, [adminMode]);
  useEffect(() => { load(); }, [load]);
  const statuses = useMemo(() => [...new Set(rows.map(row=>row.status))], [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    const text = `${row.caseId} ${row.order?.orderNumber} ${row.itemSnapshot?.name} ${row.customer?.firstName} ${row.customer?.lastName}`.toLowerCase();
    return (status === 'all' || row.status === status) && text.includes(query.toLowerCase());
  }), [rows, query, status]);
  const openCount = rows.filter(row=>!['resolved','closed','cancelled','refunded'].includes(row.status)).length;
  const disputed = rows.filter(row=>row.status==='disputed').length;

  return <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
    <header className="rounded-3xl bg-slate-950 p-6 text-white"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-black uppercase tracking-[.25em] text-primary-300">{adminMode?'Platform operations':'Store operations'}</p><h1 className="mt-1 text-3xl font-black">Returns & Refunds</h1><p className="mt-2 max-w-2xl text-sm text-white/65">Review item-specific complaints, return pickup, inspection, payment refunds, replacements, and disputes from one synchronized case record.</p></div><button onClick={load} className="flex h-11 w-fit items-center gap-2 rounded-xl bg-white px-4 text-xs font-black text-slate-900"><RefreshCw size={16}/> Refresh</button></div></header>
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">All cases</p><p className="text-2xl font-black">{rows.length}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">Open workflow</p><p className="text-2xl font-black">{openCount}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">Admin disputes</p><p className="text-2xl font-black">{disputed}</p></div></section>
    <section className="rounded-3xl border bg-white p-4"><div className="grid gap-3 sm:grid-cols-[1fr_240px]"><label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400"/><input aria-label="Search return cases" className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm" placeholder="Search case, order, product, or customer" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter by status" className="h-11 rounded-xl border border-slate-300 px-3 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></div></section>
    {loading?<div className="flex min-h-48 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-primary-700"/></div>:filtered.length===0?<div className="rounded-3xl border border-dashed bg-white p-12 text-center"><Package className="mx-auto h-10 w-10 text-slate-300"/><p className="mt-3 font-bold text-slate-500">No return cases match this view.</p></div>:<div className="grid gap-4">{filtered.map(row=><article key={row._id} className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-lg font-black text-slate-900">{row.caseId}</p><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${STATUS_TONE(row.status)}`}>{label(row.status)}</span>{row.status==='disputed'&&<span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase text-white"><ShieldCheck size={12}/> Intervention needed</span>}</div><p className="mt-1 truncate text-sm font-bold text-slate-700">{row.itemSnapshot?.name} · Qty {row.requestedQuantity}</p><p className="mt-1 text-xs text-slate-500">Order {row.order?.orderNumber} · {row.customer?.firstName} {row.customer?.lastName} · {label(row.issueType)}</p></div><div className="flex flex-wrap items-center gap-3 lg:justify-end"><div className="min-w-28 text-left lg:text-right"><p className="text-[10px] uppercase text-slate-400">Requested</p><p className="text-sm font-black">{label(row.requestedResolution)}</p>{row.refund?.amount!=null&&<p className="text-xs text-emerald-700">Refund {formatPeso(row.refund.amount)}</p>}</div><Link to={`/returns/${row._id}`} className="flex h-11 items-center gap-2 rounded-xl bg-primary-700 px-4 text-xs font-black text-white"><CheckCircle2 size={16}/> Review Case</Link></div></div>{row.decision?.reason&&<div className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><AlertCircle size={15} className="shrink-0"/><span><b>Decision note:</b> {row.decision.reason}</span></div>}</article>)}</div>}
    <p className="text-xs text-slate-400">Signed in as {user?.firstName || user?.email}. Completed cases are read-only during normal operations.</p>
  </div>;
}
