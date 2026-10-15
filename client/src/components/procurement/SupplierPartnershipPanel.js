import React, { useCallback, useEffect, useState } from 'react';
import { supplierService } from '../../services/apiService';

const descriptions = {
  priceUpdateConditions: 'Pricing and price updates',
  inventoryResponsibilities: 'Inventory and stock responsibilities',
  deliveryArrangements: 'Delivery arrangements',
  paymentTerms: 'Payment terms',
  returnReplacementDamagePolicy: 'Returns, replacement, and damage',
  cancellationDisputeProcedure: 'Cancellation and dispute procedure',
  terminationConditions: 'Termination conditions',
  otherTerms: 'Other agreed terms'
};
const statusLabels = {
  requested: 'Partnership Requested', pending_supplier: 'Agreement Pending Supplier Review',
  revision_requested: 'Revision Requested', pending_seller: 'Agreement Pending Seller Confirmation',
  active: 'Active Partnership', rejected: 'Rejected', expired: 'Expired', terminated: 'Terminated'
};
const emptyTerms = {
  coveredSupplierProducts: [], pricingMethod: 'catalog_at_order', minimumOrderQuantity: 1,
  estimatedDeliveryDays: 3, paymentDeadlineDays: 0, effectiveFrom: '', effectiveUntil: '',
  ...Object.fromEntries(Object.keys(descriptions).map(key => [key, '']))
};
const current = agreement => agreement?.versions?.[agreement.currentVersion - 1];
const dateLabel = value => value ? new Date(value).toLocaleString() : '—';

export default function SupplierPartnershipPanel({ side, suppliers = [] }) {
  const [agreements, setAgreements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [supplierId, setSupplierId] = useState('');
  const [offers, setOffers] = useState([]);
  const [terms, setTerms] = useState(emptyTerms);
  const [editing, setEditing] = useState(false);
  const [revisionFor, setRevisionFor] = useState(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await supplierService.getPartnerships(side);
      setAgreements(response.data || []);
      const linkedId = new URLSearchParams(window.location.search).get('partnership');
      if (linkedId && (response.data || []).some(agreement => agreement._id === linkedId)) {
        setSelectedId(previous => previous || linkedId);
      }
      setError('');
    } catch (failure) {
      setError(failure.response?.data?.message || 'Unable to load partnerships.');
    } finally { setLoading(false); }
  }, [side]);
  useEffect(() => { reload(); }, [reload]);

  const selected = agreements.find(item => item._id === selectedId);
  const chooseSupplier = async id => {
    setSupplierId(id);
    setOffers([]);
    if (!id) return;
    try {
      const response = await supplierService.getCatalog(id, { limit: 100 });
      setOffers(response.data.products || []);
      setError('');
    } catch (failure) { setError(failure.response?.data?.message || 'Unable to load supplier offers.'); }
  };
  const beginRevision = async agreement => {
    setRevisionFor(agreement._id);
    setSelectedId(agreement._id);
    setTerms({ ...current(agreement).terms,
      effectiveFrom: current(agreement).terms.effectiveFrom.slice(0, 10),
      effectiveUntil: current(agreement).terms.effectiveUntil.slice(0, 10) });
    await chooseSupplier(agreement.supplier?._id || agreement.supplier);
    setEditing(true);
  };
  const update = (key, value) => setTerms(previous => ({ ...previous, [key]: value }));

  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      if (revisionFor) {
        const agreement = agreements.find(item => item._id === revisionFor);
        await supplierService.actOnPartnership('seller', revisionFor, {
          action: 'revise', version: agreement.currentVersion, hash: current(agreement).hash, terms
        });
      } else await supplierService.requestPartnership(supplierId, terms);
      setSuccess(revisionFor ? 'Revised agreement submitted for Supplier review.' : 'Partnership request submitted.');
      setEditing(false); setRevisionFor(null); setTerms(emptyTerms); setSupplierId(''); setOffers([]);
      await reload();
    } catch (failure) { setError(failure.response?.data?.message || 'Unable to submit the agreement.'); }
    finally { setBusy(false); }
  };
  const act = async action => {
    const version = current(selected);
    if (!version || !window.confirm(`Confirm ${action.replace('_', ' ')} for agreement version ${version.number}?`)) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await supplierService.actOnPartnership(side, selected._id, {
        action, version: version.number, hash: version.hash, note
      });
      setSuccess('Partnership updated.'); setNote(''); await reload();
    } catch (failure) { setError(failure.response?.data?.message || 'Unable to update the agreement.'); }
    finally { setBusy(false); }
  };
  const pending = selected && ['requested', 'pending_supplier', 'pending_seller'].includes(selected.effectiveStatus);
  const accepted = current(selected)?.[side === 'seller' ? 'sellerAcceptance' : 'supplierAcceptance'];

  return <section aria-label="Supplier partnerships" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-bold text-slate-900">Supplier partnerships</h2>
        <p className="text-xs text-slate-500">Both parties must accept the same terms before an agreement becomes active.</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={reload} className="rounded-lg border px-3 py-2 text-xs" aria-label="Retry loading partnerships">Refresh</button>
        {side === 'seller' && <button type="button" onClick={() => { setEditing(true); setRevisionFor(null); setTerms(emptyTerms); setSupplierId(''); setOffers([]); setSelectedId(null); }}
          className="rounded-lg bg-indigo-700 px-3 py-2 text-xs text-white">Request partnership</button>}
      </div>
    </div>
    {loading && <p role="status" className="mt-3 text-xs">Loading partnerships…</p>}
    {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
    {success && <p role="status" className="mt-3 text-xs text-emerald-700">{success}</p>}
    {!loading && !agreements.length && <p className="mt-4 text-xs text-slate-500">No partnership agreements yet.</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {agreements.map(agreement => <button type="button" key={agreement._id} onClick={() => { setSelectedId(agreement._id); setEditing(false); setNote(''); }}
        className={`rounded-lg border px-3 py-2 text-left text-xs ${selectedId === agreement._id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}>
        {side === 'seller' ? agreement.supplier?.businessName : agreement.store?.name} · {statusLabels[agreement.effectiveStatus] || agreement.effectiveStatus} · v{agreement.currentVersion}
      </button>)}
    </div>
    {editing && side === 'seller' && <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-indigo-100 p-4">
      <h3 className="text-sm font-semibold">{revisionFor ? 'Submit revised agreement' : 'Propose partnership terms'}</h3>
      {!revisionFor && <label className="block text-xs">Supplier
        <select required value={supplierId} onChange={event => chooseSupplier(event.target.value)} className="mt-1 w-full rounded-lg border p-2">
          <option value="">Choose an eligible Supplier</option>
          {suppliers.filter(item => item.selectable && !agreements.some(agreement => String(agreement.supplier?._id || agreement.supplier) === String(item._id)))
            .map(item => <option key={item._id} value={item._id}>{item.businessName}</option>)}
        </select></label>}
      <fieldset className="rounded-lg border p-3"><legend className="px-1 text-xs">Covered Supplier offers</legend>
        {!offers.length && <p className="text-xs text-slate-500">Choose a Supplier to load its active offers.</p>}
        <div className="max-h-40 space-y-1 overflow-y-auto">{offers.map(offer => <label key={offer._id} className="flex gap-2 text-xs">
          <input type="checkbox" checked={terms.coveredSupplierProducts.some(id => String(id) === String(offer._id))}
            onChange={event => update('coveredSupplierProducts', event.target.checked
              ? [...terms.coveredSupplierProducts, offer._id]
              : terms.coveredSupplierProducts.filter(id => String(id) !== String(offer._id)))} />{offer.name} ({offer.sku})
        </label>)}</div></fieldset>
      <p className="text-xs text-slate-600">Pricing method: supplier catalog price at order submission; changes require the Store to review its cart.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[['minimumOrderQuantity', 'Minimum quantity per covered offer line'], ['estimatedDeliveryDays', 'Estimated delivery days'], ['paymentDeadlineDays', 'Payment deadline days']].map(([key, label]) =>
          <label key={key} className="text-xs">{label}<input required type="number" min={key === 'minimumOrderQuantity' ? 1 : 0} value={terms[key]}
            onChange={event => update(key, event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{[['effectiveFrom', 'Effective from'], ['effectiveUntil', 'Effective until']].map(([key, label]) =>
        <label key={key} className="text-xs">{label}<input required type="date" value={terms[key]}
          onChange={event => update(key, event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{Object.entries(descriptions).map(([key, label]) =>
        <label key={key} className="text-xs">{label}<textarea required minLength={3} maxLength={2000} value={terms[key]}
          onChange={event => update(key, event.target.value)} rows={2} className="mt-1 w-full rounded-lg border p-2" /></label>)}</div>
      <div className="flex gap-2"><button disabled={busy || !terms.coveredSupplierProducts.length} type="submit" className="rounded-lg bg-indigo-700 px-4 py-2 text-xs text-white disabled:opacity-50">Submit for review</button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2 text-xs">Cancel</button></div>
    </form>}
    {selected && !editing && <div className="mt-4 space-y-4 rounded-xl border p-4">
      <div><h3 className="text-sm font-bold">Agreement v{selected.currentVersion} · {statusLabels[selected.effectiveStatus] || selected.effectiveStatus}</h3>
        <p className="break-all text-[10px] text-slate-500">Integrity hash: {current(selected)?.hash}</p>
        <p className="text-xs">Seller accepted: {dateLabel(current(selected)?.sellerAcceptance?.acceptedAt)} · Supplier accepted: {dateLabel(current(selected)?.supplierAcceptance?.acceptedAt)}</p></div>
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        {selected.versions.map(version => <details key={version.number} open={version.number === selected.currentVersion} className="rounded-lg border p-3">
          <summary className="cursor-pointer font-semibold">Version {version.number} · {dateLabel(version.createdAt)}</summary>
          <p className="mt-2">Covered offers: {version.terms.coveredSupplierProducts.length}</p>
          {(version.terms.catalogPriceAtProposal || []).map(offer => <p key={offer.supplierProduct}>
            {offer.name} ({offer.sku}): ₱{Number(offer.unitPrice).toLocaleString()} / {offer.unitOfMeasure} at proposal
          </p>)}
          <p>Catalog price at order · Minimum {version.terms.minimumOrderQuantity} per covered offer line</p>
          <p>Delivery estimate {version.terms.estimatedDeliveryDays} days · Payment deadline {version.terms.paymentDeadlineDays} days</p>
          <p>Effective {dateLabel(version.terms.effectiveFrom)} to {dateLabel(version.terms.effectiveUntil)}</p>
          {Object.entries(descriptions).map(([key, label]) => <p key={key} className="mt-1 break-words"><strong>{label}:</strong> {version.terms[key]}</p>)}
          <p className="mt-2">Seller acceptance: {dateLabel(version.sellerAcceptance?.acceptedAt)} · Supplier acceptance: {dateLabel(version.supplierAcceptance?.acceptedAt)}</p>
        </details>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {pending && !accepted && <button disabled={busy} onClick={() => act('accept')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white">Accept this version</button>}
        {side === 'seller' && ['requested', 'pending_supplier', 'pending_seller', 'revision_requested', 'rejected', 'active'].includes(selected.effectiveStatus)
          && <button disabled={busy} onClick={() => beginRevision(selected)} className="rounded-lg border px-3 py-2 text-xs">Revise terms</button>}
        {side === 'supplier' && pending && <button disabled={busy || !note.trim()} onClick={() => act('request_revision')} className="rounded-lg border px-3 py-2 text-xs">Request revision</button>}
        {side === 'supplier' && ['requested', 'pending_supplier', 'pending_seller', 'revision_requested'].includes(selected.effectiveStatus)
          && <button disabled={busy || !note.trim()} onClick={() => act('reject')} className="rounded-lg border border-rose-300 px-3 py-2 text-xs text-rose-700">Reject</button>}
        {selected.effectiveStatus === 'active' && <button disabled={busy || !note.trim()} onClick={() => act('terminate')} className="rounded-lg border border-rose-300 px-3 py-2 text-xs text-rose-700">Terminate</button>}
      </div>
      {((side === 'supplier' && selected.effectiveStatus !== 'active') || selected.effectiveStatus === 'active')
        && <label className="block text-xs">Reason for revision, rejection, or termination<textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>}
      <div><h4 className="text-xs font-semibold">Activity history</h4><ol className="mt-1 space-y-1 text-xs">{selected.history.map((event, index) =>
        <li key={`${event.at}-${index}`}>{dateLabel(event.at)} · {event.action.replaceAll('_', ' ')} · v{event.version}
          {event.actor?.firstName ? ` · ${event.actor.firstName} ${event.actor.lastName || ''}` : ''}
          {event.note ? ` · ${event.note}` : ''}</li>)}</ol></div>
    </div>}
  </section>;
}
