import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ReturnCard } from '../components/returns/ReturnTracker';
import { returnService } from '../services/returnService';

export default function RiderReturnsPage() {
  const { user } = useAuth();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await returnService.mine(); setReturns(response.data.returns || []); }
    catch (failure) { setError(failure.response?.data?.message || 'Unable to load assigned returns.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id, action, note) => {
    setBusy(true); setError('');
    try { await returnService.transition(id, action, note); await load(); return true; }
    catch (failure) { setError(failure.response?.data?.message || 'Unable to update this return.'); return false; }
    finally { setBusy(false); }
  };
  const attachEvidence = async (id, file) => {
    setBusy(true); setError('');
    try { await returnService.uploadEvidence(id, file); await load(); return true; }
    catch (failure) { setError(failure.response?.data?.message || 'Unable to attach return evidence.'); return false; }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-4xl space-y-4 p-4 pb-16">
    <Link to="/admin/dashboard" className="text-xs font-bold text-primary-700">Back to dashboard</Link>
    <h1 className="text-2xl font-black text-slate-900">Assigned Returns to Seller</h1>
    {loading && <p role="status">Loading assigned returns…</p>}
    {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}
      <button type="button" onClick={load} className="ml-3 underline">Retry</button></div>}
    {!loading && !error && returns.length === 0 && <p className="text-sm text-slate-600">No returns assigned to you.</p>}
    {returns.map(record => <ReturnCard key={record._id} record={record} user={user} onAction={act} onEvidence={attachEvidence} busy={busy} />)}
  </main>;
}
