import React from 'react';

const DeliveryAssignmentFields = ({ riders, selectedRiderId, onRiderChange }) => (
  <div className="space-y-3">
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Pawzzle Delivery Rider</p>
      <p className="text-[10px] text-slate-500">Assign an active internal rider from this store.</p>
    </div>
    <select
      value={selectedRiderId}
      onChange={event => onRiderChange(event.target.value)}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
    >
      <option value="">Select active rider</option>
      {riders.map(rider => (
        <option key={rider._id} value={rider._id}>
          {rider.firstName} {rider.lastName} · {rider.riderProfile?.staffId} · {rider.activeDeliveryCount} active · {rider.riderProfile?.deliveryZone || rider.store?.name || 'Assigned branch'}
        </option>
      ))}
    </select>
  </div>
);

export default DeliveryAssignmentFields;
