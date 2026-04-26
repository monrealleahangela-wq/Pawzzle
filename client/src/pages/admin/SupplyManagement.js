import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  Package, Plus, Edit2, Trash2, X, Search, ChevronDown, AlertTriangle,
  RefreshCw, TrendingDown, Layers, Clock, Droplets, CheckCircle, Activity
} from 'lucide-react';
import { serviceSupplyService } from '../../services/apiService';

const SupplyManagement = () => {
  const [supplies, setSupplies] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inventory');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showRestockModal, setShowRestockModal] = useState(null);
  const [restockQty, setRestockQty] = useState(0);
  const [filterCategory, setFilterCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState([]);

  const initialForm = { name: '', sku: '', category: 'grooming_supplies', description: '', currentStock: 0, minimumStock: 5, maximumStock: 500, unitOfMeasure: 'piece', costPerUnit: 0, usagePerService: 1, linkedServices: [] };
  const [form, setForm] = useState(initialForm);

  const categories = [
    { id: 'grooming_supplies', label: 'Grooming', icon: '✂️' },
    { id: 'medical_supplies', label: 'Medical', icon: '💊' },
    { id: 'cleaning_products', label: 'Cleaning', icon: '🧹' },
    { id: 'accessories', label: 'Accessories', icon: '🎀' },
    { id: 'consumables', label: 'Consumables', icon: '🧴' },
    { id: 'equipment', label: 'Equipment', icon: '🔧' },
    { id: 'other', label: 'Other', icon: '📦' }
  ];

  const units = ['piece', 'ml', 'liter', 'gram', 'kg', 'pack', 'bottle', 'tube', 'set'];

  useEffect(() => { fetchData(); }, [filterCategory]);

  const fetchData = async () => {
    try {
      const [supRes, alertRes, logRes] = await Promise.all([
        serviceSupplyService.getAll({ category: filterCategory || undefined }),
        serviceSupplyService.getAlerts(),
        serviceSupplyService.getLogs({ limit: 30 })
      ]);
      setSupplies(supRes.data.supplies || []);
      setAlerts(alertRes.data);
      setLogs(logRes.data.logs || []);
    } catch (e) { console.error('Load error:', e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await serviceSupplyService.update(editing._id, form);
        toast.success('Supply updated');
      } else {
        await serviceSupplyService.add(form);
        toast.success('Supply added');
      }
      setShowModal(false); setEditing(null); setForm(initialForm);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this supply?')) return;
    try {
      await serviceSupplyService.delete(id);
      toast.success('Supply deleted');
      fetchData();
    } catch (e) { toast.error('Failed'); }
  };

  const handleRestock = async () => {
    if (!showRestockModal || restockQty <= 0) return;
    try {
      await serviceSupplyService.restock(showRestockModal._id, { quantity: restockQty });
      toast.success(`Restocked ${restockQty} units`);
      setShowRestockModal(null); setRestockQty(0);
      fetchData();
    } catch (e) { toast.error('Restock failed'); }
  };

  const statusConfig = {
    in_stock: { color: 'emerald', label: 'In Stock', icon: CheckCircle },
    low_stock: { color: 'amber', label: 'Low Stock', icon: AlertTriangle },
    out_of_stock: { color: 'rose', label: 'Out of Stock', icon: TrendingDown },
    expired: { color: 'slate', label: 'Expired', icon: Clock },
    archived: { color: 'slate', label: 'Archived', icon: Package }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2" /></div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Supplies...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-teal-600 text-white rounded-2xl shadow-lg shadow-teal-200"><Droplets className="h-4 w-4" /></div>
            <span className="text-[10px] font-black text-teal-600 uppercase tracking-[0.4em]">SERVICE SUPPLIES</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-[0.9] mb-3">
            Supply <span className="text-teal-600">Management</span>
          </h1>
        </div>
        <button onClick={() => { setForm(initialForm); setEditing(null); setShowModal(true); }}
          className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-600 transition-all flex items-center gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Add Supply
        </button>
      </div>

      {/* Alert Banner */}
      {alerts && alerts.totalAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
          <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
          <div>
            <p className="text-xs font-black text-amber-800 uppercase">Supply Alerts</p>
            <p className="text-[10px] text-amber-600">
              {alerts.lowStock?.length > 0 && `${alerts.lowStock.length} low stock • `}
              {alerts.expiringSoon?.length > 0 && `${alerts.expiringSoon.length} expiring soon • `}
              {alerts.expired?.length > 0 && `${alerts.expired.length} expired`}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: supplies.length, icon: Package, color: 'indigo' },
          { label: 'In Stock', value: supplies.filter(s => s.status === 'in_stock').length, icon: CheckCircle, color: 'emerald' },
          { label: 'Low Stock', value: supplies.filter(s => s.status === 'low_stock').length, icon: AlertTriangle, color: 'amber' },
          { label: 'Out of Stock', value: supplies.filter(s => s.status === 'out_of_stock').length, icon: TrendingDown, color: 'rose' }
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <s.icon className={`h-5 w-5 text-${s.color}-600 mb-3`} />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{s.label}</p>
            <p className="text-xl font-black text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-slate-900 p-1.5 rounded-2xl flex gap-1 overflow-x-auto">
        {[
          { id: 'inventory', label: 'Inventory', icon: Package },
          { id: 'alerts', label: `Alerts (${alerts?.totalAlerts || 0})`, icon: AlertTriangle },
          { id: 'logs', label: 'Activity Log', icon: Activity }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow' : 'text-white/60 hover:text-white'}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: INVENTORY ── */}
      {activeTab === 'inventory' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            {categories.map(c => (
              <button key={c.id} onClick={() => setFilterCategory(prev => prev === c.id ? '' : c.id)}
                className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${filterCategory === c.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supplies.map(s => {
              const cfg = statusConfig[s.status] || statusConfig.in_stock;
              const avail = (s.currentStock || 0) - (s.reservedStock || 0);
              const pct = s.maximumStock > 0 ? Math.round((s.currentStock / s.maximumStock) * 100) : 0;
              return (
                <div key={s._id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase bg-${cfg.color}-100 text-${cfg.color}-700`}>{cfg.label}</span>
                    <span className="text-[9px] text-slate-400 font-bold">{categories.find(c => c.id === s.category)?.icon} {s.category?.replace('_', ' ')}</span>
                  </div>
                  <h4 className="text-sm font-black text-slate-900 uppercase mb-1">{s.name}</h4>
                  {s.sku && <p className="text-[9px] text-slate-400 font-mono mb-3">SKU: {s.sku}</p>}

                  {/* Stock Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
                      <span>{avail} available</span>
                      <span>{s.currentStock}/{s.maximumStock}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={`h-full rounded-full transition-all ${pct < 20 ? 'bg-rose-500' : pct < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <div className="bg-slate-50 rounded-lg py-1.5">
                      <p className="text-[8px] text-slate-400 font-bold">Cost/Unit</p>
                      <p className="text-[11px] font-black text-slate-800">₱{s.costPerUnit}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg py-1.5">
                      <p className="text-[8px] text-slate-400 font-bold">Usage/Svc</p>
                      <p className="text-[11px] font-black text-slate-800">{s.usagePerService}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg py-1.5">
                      <p className="text-[8px] text-slate-400 font-bold">Unit</p>
                      <p className="text-[11px] font-black text-slate-800">{s.unitOfMeasure}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setShowRestockModal(s)}
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-1">
                      <RefreshCw className="h-3 w-3" /> Restock
                    </button>
                    <button onClick={() => { setForm(s); setEditing(s); setShowModal(true); }}
                      className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-900 hover:text-white transition-all">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(s._id)}
                      className="px-3 py-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── TAB: ALERTS ── */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alerts?.lowStock?.map(s => (
            <div key={s._id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs font-black text-amber-800">{s.name}</p>
                  <p className="text-[9px] text-amber-600">Current: {s.currentStock} / Min: {s.minimumStock}</p>
                </div>
              </div>
              <button onClick={() => setShowRestockModal(s)}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-[9px] font-black uppercase">Restock</button>
            </div>
          ))}
          {alerts?.expired?.map(s => (
            <div key={s._id} className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-rose-600 shrink-0" />
              <div>
                <p className="text-xs font-black text-rose-800">{s.name}</p>
                <p className="text-[9px] text-rose-600">Expired: {new Date(s.expirationDate).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
          {(!alerts?.lowStock?.length && !alerts?.expired?.length) && (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
              <CheckCircle className="h-12 w-12 text-emerald-300 mx-auto mb-4" />
              <p className="text-sm font-bold text-slate-400">All supplies are healthy! No alerts.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: LOGS ── */}
      {activeTab === 'logs' && (
        <div className="space-y-2">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-3 bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0 mt-1.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-700">{log.description}</p>
                <p className="text-[9px] text-slate-400">{log.performedBy?.firstName} {log.performedBy?.lastName} ({log.userRole}) • {new Date(log.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ADD/EDIT MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
            <header className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black uppercase text-slate-900 tracking-tighter">{editing ? 'Edit Supply' : 'Add Supply'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'name', label: 'Name', span: 2 },
                  { key: 'sku', label: 'SKU' },
                  { key: 'currentStock', label: 'Current Stock', type: 'number' },
                  { key: 'minimumStock', label: 'Min Stock', type: 'number' },
                  { key: 'maximumStock', label: 'Max Stock', type: 'number' },
                  { key: 'costPerUnit', label: 'Cost/Unit (₱)', type: 'number' },
                  { key: 'usagePerService', label: 'Usage/Service', type: 'number' }
                ].map(f => (
                  <div key={f.key} className={`space-y-1 ${f.span === 2 ? 'col-span-2' : ''}`}>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{f.label}</label>
                    <input type={f.type || 'text'} value={form[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Unit of Measure</label>
                  <select value={form.unitOfMeasure} onChange={e => setForm(p => ({ ...p, unitOfMeasure: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none">
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium outline-none h-20 resize-none" />
              </div>
            </div>
            <footer className="p-5 border-t border-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setShowModal(false)} className="px-6 py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 py-3 bg-teal-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all disabled:opacity-50">
                {submitting ? 'Saving...' : editing ? 'Update Supply' : 'Add Supply'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ── RESTOCK MODAL ── */}
      {showRestockModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl">
            <h3 className="text-lg font-black uppercase text-slate-900 tracking-tighter mb-2">Restock</h3>
            <p className="text-sm font-bold text-slate-500 mb-4">{showRestockModal.name}</p>
            <p className="text-[9px] text-slate-400 mb-4">Current: {showRestockModal.currentStock} {showRestockModal.unitOfMeasure}</p>
            <div className="space-y-1 mb-6">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Add Quantity</label>
              <input type="number" value={restockQty} onChange={e => setRestockQty(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-lg font-black text-center outline-none" min="1" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRestockModal(null)} className="px-6 py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase">Cancel</button>
              <button onClick={handleRestock}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all">
                Restock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplyManagement;
