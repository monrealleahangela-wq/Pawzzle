import React, { useEffect, useState } from 'react';
import { deliveryService } from '../../services/apiService';

const emptyExternal = { providerKey: 'mock_delivery_provider' };
let providerCache = null;
let providerRequest = null;

const loadProviders = async () => {
  if (providerCache) return providerCache;
  if (!providerRequest) providerRequest = deliveryService.getProviders().then(response => {
    providerCache = response.data.providers || [];
    return providerCache;
  }).finally(() => { providerRequest = null; });
  return providerRequest;
};

const DeliveryAssignmentFields = ({ assignmentType, onAssignmentTypeChange, riders, selectedRiderId, onRiderChange, thirdPartyRider = emptyExternal, onThirdPartyChange }) => {
  const [providers, setProviders] = useState(providerCache || []);

  useEffect(() => {
    let active = true;
    if (assignmentType === 'third_party') loadProviders().then(rows => { if (active) setProviders(rows); }).catch(() => {});
    return () => { active = false; };
  }, [assignmentType]);

  const availableProviders = providers.length ? providers : [{ key: 'mock_delivery_provider', name: 'Mock Delivery Provider', environment: 'sandbox' }];
  return <div className="space-y-3">
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Delivery method</p>
      <div className="grid grid-cols-2 gap-2">
        {[['internal', 'Pawzzle Rider'], ['third_party', 'Courier Provider']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => onAssignmentTypeChange(value)} className={`h-10 rounded-xl border text-[10px] font-black uppercase ${assignmentType === value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{label}</button>
        ))}
      </div>
    </div>
    {assignmentType === 'internal' ? (
      <select value={selectedRiderId} onChange={event => onRiderChange(event.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700">
        <option value="">Select active rider</option>
        {riders.map(rider => <option key={rider._id} value={rider._id}>{rider.firstName} {rider.lastName} · {rider.riderProfile?.staffId} · {rider.activeDeliveryCount} active · {rider.riderProfile?.deliveryZone || rider.store?.name || 'Assigned branch'}</option>)}
      </select>
    ) : (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
        <label className="block text-[9px] font-black uppercase tracking-widest text-amber-800">Courier provider</label>
        <select value={thirdPartyRider.providerKey || availableProviders[0].key} onChange={event => onThirdPartyChange({ ...thirdPartyRider, providerKey: event.target.value })} className="w-full h-10 px-3 rounded-lg border border-amber-200 bg-white text-xs font-bold">
          {availableProviders.map(provider => <option key={provider.key} value={provider.key}>{provider.name}{provider.environment === 'sandbox' ? ' (Sandbox)' : ''}</option>)}
        </select>
        <p className="text-[10px] leading-relaxed text-amber-800">Pawzzle sends the job to the provider. The provider—not Pawzzle—assigns and notifies its rider. Sandbox providers simulate this flow and are not live couriers.</p>
      </div>
    )}
  </div>;
};

export { emptyExternal };
export default DeliveryAssignmentFields;
