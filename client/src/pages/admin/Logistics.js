import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, Bike, CheckCircle2, Clock3, MapPin, PackageCheck, RefreshCw, Search, Truck, Users, XCircle } from 'lucide-react';
import { getImageUrl, logisticsService, staffService } from '../../services/apiService';
import { toast } from 'react-toastify';

const statusStyle = status => ({
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  failed_attempt: 'bg-rose-50 text-rose-700 border-rose-100',
  returned_to_store: 'bg-rose-50 text-rose-700 border-rose-100',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  arrived: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  in_transit: 'bg-blue-50 text-blue-700 border-blue-100',
  picked_up: 'bg-blue-50 text-blue-700 border-blue-100',
  assigned: 'bg-amber-50 text-amber-700 border-amber-100'
}[status] || 'bg-slate-50 text-slate-600 border-slate-100');

const money = value => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const personName = person => person ? `${person.firstName || person.name || ''} ${person.lastName || ''}`.trim() : 'Unassigned';

const MiniBarChart = ({ rows }) => {
  const max = Math.max(1, ...(rows || []).map(row => row.count || row.value || 0));
  return <div className="h-32 flex items-end gap-1.5 pt-4">{(rows || []).map(row => {
    const value = row.count ?? row.value ?? 0;
    return <div key={row.date || row.key} className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0">
      <div className="w-full max-w-7 rounded-t bg-orange-500/85" style={{ height: `${Math.max(value ? 5 : 1, value / max * 92)}px` }} title={`${row.label || row.date}: ${value}`} />
      {row.date && <span className="text-[7px] text-slate-400 hidden sm:block">{row.date.slice(8)}</span>}
    </div>;
  })}</div>;
};

export default function Logistics() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get('tab') === 'issues' ? 'issues' : 'deliveries');
  const [dashboard, setDashboard] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [issues, setIssues] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: '', riderType: '', rider: '', from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, deliveryRows, issueRows, riderRows] = await Promise.all([
        logisticsService.getDashboard(),
        logisticsService.getDeliveries({ ...appliedFilters, page, limit: 25 }),
        logisticsService.getIssues(),
        staffService.getEligibleRiders()
      ]);
      setDashboard(summary.data);
      setDeliveries(deliveryRows.data.deliveries || []);
      setPagination(deliveryRows.data.pagination || { page: 1, pages: 1, total: 0 });
      setIssues((issueRows.data.issues || []).map(issue => ({
        ...issue,
        photo: issue.photo ? getImageUrl(issue.photo) : ''
      })));
      setRiders(riderRows.data.riders || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to load Logistics.');
    } finally { setLoading(false); }
  }, [appliedFilters, page]);
  useEffect(() => { load(); }, [load]);

  const cards = [
    ['Total Deliveries', dashboard?.summary?.total, Truck, 'text-slate-700'],
    ['Pending Assignment', dashboard?.summary?.pendingAssignment, Clock3, 'text-amber-600'],
    ['Assigned', dashboard?.summary?.assigned, Users, 'text-indigo-600'],
    ['Out for Delivery', dashboard?.summary?.outForDelivery, Bike, 'text-blue-600'],
    ['Arrived', dashboard?.summary?.arrived, MapPin, 'text-violet-600'],
    ['Delivered', dashboard?.summary?.delivered, CheckCircle2, 'text-emerald-600'],
    ['Failed', dashboard?.summary?.failed, AlertTriangle, 'text-rose-600'],
    ['Active Riders', dashboard?.summary?.activeInternalRiders, Activity, 'text-orange-600']
  ];

  const clearFilters = () => { const empty = { search: '', status: '', riderType: '', rider: '', from: '', to: '' }; setFilters(empty); setPage(1); setAppliedFilters({}); };
  const resolveIssue = async issue => {
    const notes = window.prompt('Resolution notes:');
    if (!notes?.trim()) return;
    try {
      await logisticsService.resolveIssue(issue.deliveryId, issue.type, issue._id, { notes });
      toast.success('Delivery issue resolved.'); await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to resolve issue.'); }
  };

  return <div className="min-h-screen bg-slate-50 p-3 sm:p-5 space-y-4 pb-24">
    <header className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[9px] font-black uppercase tracking-[.25em] text-orange-600">Operations</p><h1 className="text-xl sm:text-2xl font-black text-slate-900">Logistics</h1><p className="text-xs text-slate-500">Central delivery assignment, tracking, proof, issues, and rider coordination.</p></div>
      <button onClick={load} disabled={loading} className="h-9 px-3 border rounded-lg bg-white text-xs font-bold flex items-center gap-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh</button>
    </header>

    <section className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">{cards.map(([label, value, Icon, color]) => <div key={label} className="bg-white border border-slate-100 rounded-xl p-3"><Icon size={15} className={`${color} mb-2`}/><p className="text-[8px] font-black uppercase text-slate-400 leading-tight">{label}</p><p className="text-lg font-black text-slate-900 mt-0.5">{value ?? '—'}</p></div>)}</section>

    <section className="grid lg:grid-cols-3 gap-3">
      <div className="lg:col-span-2 bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest">Deliveries over the last 14 days</h2>{dashboard?.charts?.deliveriesOverTime?.some(row => row.count) ? <MiniBarChart rows={dashboard.charts.deliveriesOverTime}/> : <p className="py-14 text-center text-xs text-slate-400">No delivery activity in this period.</p>}</div>
      <div className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest">Delivery performance</h2><div className="grid grid-cols-2 gap-3 mt-5"><div className="rounded-xl bg-emerald-50 p-4"><PackageCheck size={16} className="text-emerald-600"/><p className="text-[9px] text-emerald-700 mt-2">Completed</p><b className="text-xl text-emerald-900">{dashboard?.charts?.performance?.completed || 0}</b></div><div className="rounded-xl bg-rose-50 p-4"><XCircle size={16} className="text-rose-600"/><p className="text-[9px] text-rose-700 mt-2">Failed</p><b className="text-xl text-rose-900">{dashboard?.charts?.performance?.failed || 0}</b></div></div></div>
    </section>

    <section className="grid lg:grid-cols-3 gap-3">
      <div className="lg:col-span-2 bg-white border rounded-2xl p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-xs font-black uppercase tracking-widest">Active internal riders</h2><span className="text-[9px] font-bold text-slate-400">Current workload</span></div>{riders.length?<div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-3">{riders.slice(0,9).map(rider=><div key={rider._id} className="border rounded-xl p-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black truncate">{personName(rider)}</p><p className="text-[9px] text-slate-400 truncate">{rider.riderProfile?.staffId} · {rider.riderProfile?.deliveryZone || rider.store?.name || 'Assigned branch'}</p></div><span className={`shrink-0 px-2 py-1 rounded-lg text-[8px] font-black uppercase ${rider.activeDeliveryCount?'bg-blue-50 text-blue-700':'bg-emerald-50 text-emerald-700'}`}>{rider.activeDeliveryCount ? `${rider.activeDeliveryCount} active` : 'Available'}</span></div>)}</div>:<p className="py-8 text-center text-xs text-slate-400">No active internal riders are configured for this store.</p>}</div>
      <div className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest">Assignment coverage</h2><div className="space-y-3 mt-4">{(dashboard?.charts?.byAssignment||[]).map(row=>{const total=Math.max(1,dashboard?.summary?.total||0);return <div key={row.key}><div className="flex justify-between text-[10px] font-bold"><span>{row.label}</span><span>{row.value}</span></div><div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{width:`${row.value/total*100}%`}}/></div></div>;})}</div></div>
    </section>

    <div className="flex gap-1 bg-slate-900 p-1 rounded-xl w-fit">{[['deliveries','Deliveries'],['issues',`Issues (${issues.filter(issue => issue.resolutionStatus !== 'resolved').length})`]].map(([key,label])=><button key={key} onClick={()=>setTab(key)} className={`h-8 px-4 rounded-lg text-[10px] font-black uppercase ${tab===key?'bg-white text-slate-900':'text-white/60'}`}>{label}</button>)}</div>

    {tab === 'deliveries' ? <>
      <section className="bg-white border rounded-2xl p-3 space-y-3">
        <form onSubmit={event => { event.preventDefault(); setPage(1); setAppliedFilters(Object.fromEntries(Object.entries(filters).filter(([,value]) => value))); }} className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          <label className="col-span-2 relative"><Search size={14} className="absolute left-3 top-3 text-slate-400"/><input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Tracking, order, customer, rider" className="w-full h-9 pl-9 pr-3 rounded-lg border text-xs"/></label>
          <select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})} className="h-9 px-2 rounded-lg border text-xs"><option value="">All statuses</option>{['pending','unassigned','assigned','accepted','declined','picked_up','in_transit','arrived','delivered','failed_attempt','returned_to_store','cancelled'].map(value=><option key={value} value={value}>{value.replace(/_/g,' ')}</option>)}</select>
          <select value={filters.riderType} onChange={e=>setFilters({...filters,riderType:e.target.value})} className="h-9 px-2 rounded-lg border text-xs"><option value="">All rider types</option><option value="internal">Internal</option><option value="third_party">Third-party</option><option value="unassigned">Unassigned</option></select>
          <select value={filters.rider} onChange={e=>setFilters({...filters,rider:e.target.value})} className="h-9 px-2 rounded-lg border text-xs"><option value="">All riders</option>{riders.map(rider=><option key={rider._id} value={rider._id}>{personName(rider)}</option>)}</select>
          <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} className="h-9 px-2 rounded-lg border text-xs"/><input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} className="h-9 px-2 rounded-lg border text-xs"/>
          <div className="col-span-2 md:col-span-4 xl:col-span-7 flex justify-end gap-2"><button type="button" onClick={clearFilters} className="h-8 px-3 text-[10px] font-bold text-slate-500">Clear Filters</button><button className="h-8 px-4 rounded-lg bg-orange-600 text-white text-[10px] font-black uppercase">Apply Filters</button></div>
        </form>
      </section>
      <section className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-left text-xs min-w-[1080px]"><thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Tracking / Order','Customer','Address','Delivery Type','Rider','Rider Type','COD / Fee','Status','Created / Expected',''].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{deliveries.map(delivery => {
        const source = delivery.order || delivery.booking; const customer = source?.customer; const address = delivery.order?.shippingAddress || delivery.booking?.serviceAddress; const riderPerson = delivery.assignmentType === 'internal' ? delivery.assignedRider : delivery.thirdPartyRider; const cod = ['cod','cash_on_delivery'].includes(source?.paymentMethod);
        return <tr key={delivery._id} className="border-t hover:bg-slate-50"><td className="p-3"><b>{delivery.deliveryNumber}</b><p className="text-[9px] text-slate-400">{delivery.order?.orderNumber || `Booking ${String(delivery.booking?._id || '').slice(-8).toUpperCase()}`}</p></td><td className="p-3 font-bold">{personName(customer)}</td><td className="p-3 max-w-56"><p className="truncate">{[address?.street,address?.barangay,address?.city].filter(Boolean).join(', ') || 'Pickup / not provided'}</p></td><td className="p-3 capitalize">{delivery.order ? (delivery.order.deliveryMethod || 'delivery') : 'service booking'}</td><td className="p-3"><b>{personName(riderPerson)}</b>{delivery.assignmentType==='internal'&&<p className="text-[9px] text-slate-400">{delivery.assignedRider?.riderProfile?.staffId}</p>}</td><td className="p-3 capitalize">{delivery.assignmentType?.replace('_',' ')}</td><td className="p-3"><b>{cod ? money(source?.totalAmount || source?.totalPrice) : 'Prepaid'}</b><p className="text-[9px] text-slate-400">Fee {money(delivery.order?.shippingFee || delivery.feeCalculation?.totalFee)}</p></td><td className="p-3"><span className={`px-2 py-1 rounded-lg border text-[8px] font-black uppercase ${statusStyle(delivery.status)}`}>{delivery.statusLabel}</span><p className="text-[8px] text-slate-400 mt-1 capitalize">Link: {delivery.linkStatus.replace('_',' ')}</p></td><td className="p-3 text-[10px]">{new Date(delivery.createdAt).toLocaleDateString()}{delivery.estimatedDelivery&&<p className="text-[9px] text-slate-400 mt-1">Expected {new Date(delivery.estimatedDelivery).toLocaleDateString()}</p>}</td><td className="p-3"><button onClick={()=>navigate(`/admin/logistics/${delivery._id}`)} className="h-8 px-3 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase">View Delivery</button></td></tr>;
      })}</tbody></table>{!loading && !deliveries.length && <p className="p-10 text-center text-xs text-slate-400">No deliveries match these filters.</p>}</section>
      <div className="flex items-center justify-between gap-3 px-1"><p className="text-[10px] text-slate-500">{pagination.total} delivery record{pagination.total === 1 ? '' : 's'}</p><div className="flex items-center gap-2"><button disabled={page <= 1 || loading} onClick={()=>setPage(value=>Math.max(1,value-1))} className="h-8 px-3 border rounded-lg text-[9px] font-black uppercase disabled:opacity-40">Previous</button><span className="text-[10px] font-bold">Page {pagination.page} of {Math.max(1,pagination.pages)}</span><button disabled={page >= pagination.pages || loading} onClick={()=>setPage(value=>value+1)} className="h-8 px-3 border rounded-lg text-[9px] font-black uppercase disabled:opacity-40">Next</button></div></div>
    </> : <section className="space-y-2">{issues.map(issue=><div key={`${issue.type}-${issue._id}`} className="bg-white border rounded-xl p-4 flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><AlertTriangle size={15} className="text-rose-600"/><b className="text-xs">{issue.deliveryNumber} · {issue.orderNumber}</b></div><p className="text-[10px] text-slate-500 mt-1">{personName(issue.customer)} · {personName(issue.rider)} · {new Date(issue.date).toLocaleString()}</p><p className="text-xs font-bold text-rose-700 mt-2 capitalize">{String(issue.reason || 'delivery issue').replace(/_/g,' ')}</p><p className="text-xs text-slate-600 mt-1">{issue.notes || 'No additional notes.'}</p>{issue.photo&&<a href={issue.photo} target="_blank" rel="noreferrer" className="inline-block text-[10px] font-bold text-orange-600 mt-2">View supporting evidence</a>}{issue.resolutionNotes&&<p className="text-[10px] text-emerald-700 mt-2">Resolution: {issue.resolutionNotes}</p>}</div><div className="flex gap-2"><button onClick={()=>navigate(`/admin/logistics/${issue.deliveryId}`)} className="h-8 px-3 border rounded-lg text-[9px] font-black uppercase">View Delivery</button>{issue.resolutionStatus!=='resolved'&&<button onClick={()=>resolveIssue(issue)} className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase">Resolve</button>}</div></div>)}{!issues.length&&<p className="bg-white border rounded-xl p-10 text-center text-xs text-slate-400">No delivery issues have been recorded.</p>}</section>}
  </div>;
}
