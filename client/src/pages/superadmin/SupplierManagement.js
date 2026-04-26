import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  Truck, CheckCircle, XCircle, Clock, Search, ChevronDown, Shield, Eye,
  Package, Star, TrendingUp, AlertTriangle, Settings, Users, Ban, X
} from 'lucide-react';
import { supplierService, getImageUrl } from '../../services/apiService';

const SupplierManagement = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [supplierDetails, setSupplierDetails] = useState(null);
  const [actionReason, setActionReason] = useState('');

  useEffect(() => { fetchSuppliers(); }, [filterStatus]);

  const fetchSuppliers = async () => {
    try {
      const res = await supplierService.adminGetAll({ status: filterStatus || undefined, search: searchTerm || undefined });
      setSuppliers(res.data.suppliers || []);
    } catch (e) { toast.error('Failed to load suppliers'); }
    finally { setLoading(false); }
  };

  const viewDetails = async (id) => {
    try {
      const res = await supplierService.adminGetDetails(id);
      setSupplierDetails(res.data);
      setSelectedSupplier(id);
      setShowDetailModal(true);
    } catch (e) { toast.error('Failed to load details'); }
  };

  const handleAction = async (id, action) => {
    try {
      await supplierService.adminVerify(id, { action, reason: actionReason || undefined });
      toast.success(`Supplier ${action === 'verify' ? 'verified' : action === 'reject' ? 'rejected' : 'suspended'}`);
      setActionReason('');
      fetchSuppliers();
      if (showDetailModal) {
        const res = await supplierService.adminGetDetails(id);
        setSupplierDetails(res.data);
      }
    } catch (e) { toast.error(e.response?.data?.message || 'Action failed'); }
  };

  const statusConfig = {
    pending_verification: { color: 'amber', icon: Clock, label: 'Pending' },
    verified: { color: 'emerald', icon: CheckCircle, label: 'Verified' },
    suspended: { color: 'rose', icon: Ban, label: 'Suspended' },
    rejected: { color: 'slate', icon: XCircle, label: 'Rejected' }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2" /></div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Suppliers...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-600 text-white rounded-2xl shadow-lg shadow-purple-200"><Truck className="h-4 w-4" /></div>
            <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.4em]">SUPER ADMIN : SUPPLIERS</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-[0.9] mb-3">
            Supplier <span className="text-purple-600">Management</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Verification • Performance • Audit
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending', value: suppliers.filter(s => s.status === 'pending_verification').length, icon: Clock, color: 'amber' },
          { label: 'Verified', value: suppliers.filter(s => s.status === 'verified').length, icon: CheckCircle, color: 'emerald' },
          { label: 'Suspended', value: suppliers.filter(s => s.status === 'suspended').length, icon: Ban, color: 'rose' },
          { label: 'Total', value: suppliers.length, icon: Users, color: 'indigo' }
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <s.icon className={`h-5 w-5 text-${s.color}-600 mb-3`} />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{s.label}</p>
            <p className="text-xl font-black text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-slate-900 p-2 rounded-[1.5rem] shadow-xl border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-6 relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input type="text" placeholder="SEARCH SUPPLIERS..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchSuppliers()}
              className="w-full pl-16 pr-4 py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 font-sans" />
          </div>
          <div className="md:col-span-4 relative">
            <Shield className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-500" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full h-full bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-16 pr-10 py-4 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none cursor-pointer font-sans">
              <option value="">All Statuses</option>
              <option value="pending_verification">Pending</option>
              <option value="verified">Verified</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </select>
            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Suppliers List */}
      <div className="space-y-4">
        {suppliers.map(s => {
          const cfg = statusConfig[s.status] || statusConfig.pending_verification;
          return (
            <div key={s._id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center shrink-0">
                  {s.logo ? <img src={getImageUrl(s.logo)} alt="" className="w-full h-full object-cover rounded-2xl" /> : <Truck className="h-6 w-6 text-purple-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-black text-slate-900 uppercase truncate">{s.businessName}</h3>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase bg-${cfg.color}-100 text-${cfg.color}-700 shrink-0`}>{cfg.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{s.contactPerson} • {s.email} • {s.address?.city}, {s.address?.province}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-[9px] font-bold text-slate-400"><Star className="h-3 w-3 inline text-amber-500" /> {s.ratings?.average?.toFixed(1) || '—'}</span>
                    <span className="text-[9px] font-bold text-slate-400"><TrendingUp className="h-3 w-3 inline text-emerald-500" /> {s.performance?.reliabilityScore || 100}%</span>
                    <span className="text-[9px] font-bold text-slate-400"><Package className="h-3 w-3 inline text-indigo-500" /> {s.productCategories?.length || 0} categories</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => viewDetails(s._id)}
                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-600 transition-all flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                  {s.status === 'pending_verification' && (
                    <>
                      <button onClick={() => handleAction(s._id, 'verify')}
                        className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all">Verify</button>
                      <button onClick={() => handleAction(s._id, 'reject')}
                        className="px-4 py-2.5 bg-rose-100 text-rose-600 rounded-xl text-[9px] font-black uppercase hover:bg-rose-600 hover:text-white transition-all">Reject</button>
                    </>
                  )}
                  {s.status === 'verified' && (
                    <button onClick={() => handleAction(s._id, 'suspend')}
                      className="px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl text-[9px] font-black uppercase hover:bg-amber-600 hover:text-white transition-all">Suspend</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {suppliers.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
            <Truck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-400">No suppliers found</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && supplierDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2">
          <div className="bg-white w-full max-w-3xl rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[95vh] border border-slate-200">
            <header className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-black uppercase text-slate-900 tracking-tighter">{supplierDetails.supplier?.businessName}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Supplier Details & Audit</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Supplier Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Products', value: supplierDetails.productCount },
                  { label: 'Orders', value: supplierDetails.orderCount },
                  { label: 'Reliability', value: `${supplierDetails.supplier?.performance?.reliabilityScore || 100}%` },
                  { label: 'Avg Delivery', value: `${supplierDetails.supplier?.performance?.averageDeliveryDays || 0} days` }
                ].map((s, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                    <p className="text-lg font-black text-slate-900 mt-1">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Contact Info */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Contact Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-[9px] font-bold text-slate-400 uppercase">Person:</span> <span className="font-bold text-slate-700">{supplierDetails.supplier?.contactPerson}</span></div>
                  <div><span className="text-[9px] font-bold text-slate-400 uppercase">Email:</span> <span className="font-bold text-slate-700">{supplierDetails.supplier?.email}</span></div>
                  <div><span className="text-[9px] font-bold text-slate-400 uppercase">Phone:</span> <span className="font-bold text-slate-700">{supplierDetails.supplier?.phone}</span></div>
                  <div><span className="text-[9px] font-bold text-slate-400 uppercase">Tax ID:</span> <span className="font-bold text-slate-700">{supplierDetails.supplier?.taxId || '—'}</span></div>
                </div>
              </div>

              {/* Admin Actions */}
              <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
                <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-3">Admin Actions</h4>
                <div className="space-y-3">
                  <input type="text" placeholder="Reason (optional)" value={actionReason}
                    onChange={e => setActionReason(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-purple-200 rounded-xl text-sm outline-none" />
                  <div className="flex gap-2 flex-wrap">
                    {supplierDetails.supplier?.status !== 'verified' && (
                      <button onClick={() => handleAction(supplierDetails.supplier._id, 'verify')}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase">Verify</button>
                    )}
                    {supplierDetails.supplier?.status !== 'rejected' && (
                      <button onClick={() => handleAction(supplierDetails.supplier._id, 'reject')}
                        className="px-4 py-2 bg-rose-600 text-white rounded-xl text-[9px] font-black uppercase">Reject</button>
                    )}
                    {supplierDetails.supplier?.status === 'verified' && (
                      <button onClick={() => handleAction(supplierDetails.supplier._id, 'suspend')}
                        className="px-4 py-2 bg-amber-600 text-white rounded-xl text-[9px] font-black uppercase">Suspend</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Audit Logs */}
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Recent Activity</h4>
                <div className="space-y-2">
                  {supplierDetails.recentLogs?.map((log, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-700 truncate">{log.description}</p>
                        <p className="text-[9px] text-slate-400">{log.performedBy?.firstName} {log.performedBy?.lastName} • {new Date(log.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierManagement;
