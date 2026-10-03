import React from 'react';

const DeliveryAssignmentFields = ({ parcel, onParcelChange, riders = [] }) => (
  <div className="space-y-3">
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">System Rider Assignment</p>
      <p className="text-[10px] text-slate-500">Pawzzle selects an on-duty internal rider using remaining vehicle capacity and workload.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Measured parcel weight (kg)</span><input required type="number" min="0.001" max="10000" step="0.001" value={parcel.weightKg} onChange={event=>onParcelChange({...parcel,weightKg:event.target.value})} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold"/></label>
      <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Parcel count</span><input required type="number" min="1" max="10000" step="1" value={parcel.parcelCount} onChange={event=>onParcelChange({...parcel,parcelCount:event.target.value})} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold"/></label>
    </div>
    <p className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-500">{riders.filter(rider=>['available','on_delivery'].includes(rider.availability)).length} active rider candidate(s) are visible. The backend determines eligibility from schedule, status, store, and remaining capacity atomically.</p>
  </div>
);

export default DeliveryAssignmentFields;
