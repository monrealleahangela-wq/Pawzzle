import React from 'react';
import { Check, PackageCheck, Truck } from 'lucide-react';

const legStages = {
  return: ['processing', 'shipped', 'received'],
  replacement: ['processing', 'shipped', 'delivered']
};

const label = value => String(value || '').replaceAll('_', ' ');

const ShipmentLeg = ({ title, shipment, direction }) => {
  if (!shipment || shipment.status === 'not_required') return null;
  const stages = legStages[direction];
  const activeIndex = stages.indexOf(shipment.status);
  return <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex items-start justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-700">{title}</p><p className="mt-0.5 text-[9px] text-slate-500">{direction === 'return' ? 'Store → Supplier' : 'Supplier → Store'}</p></div><span className="rounded-full bg-primary-50 px-2 py-1 text-[8px] font-black uppercase text-primary-700">{label(shipment.status)}</span></div>
    <div className="mt-3 grid grid-cols-3 gap-1">
      {stages.map((stage, index) => <div key={stage} className="min-w-0 text-center">
        <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full ${index <= activeIndex ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{index < activeIndex ? <Check className="h-3.5 w-3.5" /> : stage === 'processing' ? <PackageCheck className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}</div>
        <p className={`mt-1 truncate text-[8px] font-bold uppercase ${index <= activeIndex ? 'text-slate-700' : 'text-slate-400'}`}>{label(stage)}</p>
      </div>)}
    </div>
    {(shipment.carrier || shipment.trackingNumber) && <p className="mt-3 rounded-lg bg-slate-50 px-2 py-1.5 text-[9px] text-slate-600"><strong>{shipment.carrier || 'Carrier'}</strong>{shipment.trackingNumber ? ` · Tracking ${shipment.trackingNumber}` : ''}</p>}
    {shipment.notes && <p className="mt-2 text-[9px] text-slate-500">{shipment.notes}</p>}
  </div>;
};

const ResolutionLogisticsTimeline = ({ resolution }) => {
  const hasReturn = resolution?.returnShipment && resolution.returnShipment.status !== 'not_required';
  const hasReplacement = resolution?.replacementShipment && resolution.replacementShipment.status !== 'not_required';
  if (!hasReturn && !hasReplacement) return null;
  return <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Resolution delivery timeline">
    <ShipmentLeg title="Return shipment" shipment={resolution.returnShipment} direction="return" />
    <ShipmentLeg title="Replacement / correction" shipment={resolution.replacementShipment} direction="replacement" />
  </div>;
};

export default ResolutionLogisticsTimeline;
