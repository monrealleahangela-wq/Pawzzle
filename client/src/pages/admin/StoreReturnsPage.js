import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ReturnCard } from '../../components/returns/ReturnTracker';
import { returnService } from '../../services/returnService';

export default function StoreReturnsPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await returnService.store();
      setRecords(response.data.returns || []);
      setRiders(response.data.riders || []);
    } catch (failure) { setError(failure.response?.data?.message || 'Unable to load Store returns.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id, action, note, riderId) => {
    setBusy(true); setError('');
    try { await returnService.transition(id, action, note, riderId); await load(); return true; }
    catch (failure) { setError(failure.response?.data?.message || 'Unable to update this return.'); return false; }
    finally { setBusy(false); }
  };
  const attachEvidence = async (id, file) => {
    setBusy(true); setError('');
    try { await returnService.uploadEvidence(id, file); await load(); return true; }
    catch (failure) { setError(failure.response?.data?.message || 'Unable to attach return evidence.'); return false; }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-5xl space-y-4 p-4 pb-16">
    <Link to="/admin/dashboard" className="text-xs font-bold text-primary-700">Back to dashboard</Link>
    <h1 className="text-2xl font-black text-slate-900">Customer Returns to Seller</h1>
    {loading && <p role="status">Loading Store returns…</p>}
    {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}
      <button type="button" onClick={load} className="ml-3 underline">Retry</button></div>}
    {!loading && !error && !records.length && <p className="text-sm text-slate-600">No customer returns for your Store.</p>}
    {records.map(record => <div key={record._id} className="space-y-2">
      {['admin', 'store_owner'].includes(user?.role)
        ? <Link to={`/admin/orders/${record.order}`} className="text-xs font-semibold text-primary-700 underline">Order {String(record.order).slice(-8).toUpperCase()}</Link>
        : <p className="text-xs font-semibold text-slate-700">Order {String(record.order).slice(-8).toUpperCase()}</p>}
      <ReturnCard record={record} user={user} riders={riders.filter(row => String(row.store) === String(record.store))}
        onAction={act} onEvidence={attachEvidence} busy={busy} />
    </div>)}
  </main>;
}
