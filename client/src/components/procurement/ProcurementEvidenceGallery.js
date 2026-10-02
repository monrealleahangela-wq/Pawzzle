import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { purchaseOrderService } from '../../services/apiService';

const EvidenceImage = ({ orderId, evidence, imageClassName }) => {
  const [access, setAccess] = useState(null);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);

  const loadAccess = useCallback(async () => {
    if (!orderId || !evidence?._id) return;
    try {
      const response = await purchaseOrderService.getEvidenceAccess(orderId, evidence._id);
      setAccess(response.data);
      setFailed(false);
    } catch (_error) {
      setAccess(null);
      setFailed(true);
    }
  }, [orderId, evidence?._id]);

  useEffect(() => {
    retried.current = false;
    loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    if (!access?.expiresAt) return undefined;
    const refreshIn = Math.max(1000, new Date(access.expiresAt).getTime() - Date.now() - 30000);
    const timeout = window.setTimeout(loadAccess, refreshIn);
    return () => window.clearTimeout(timeout);
  }, [access?.expiresAt, loadAccess]);

  const retryExpiredAccess = () => {
    if (retried.current) {
      setFailed(true);
      return;
    }
    retried.current = true;
    loadAccess();
  };

  if (!access?.url || failed) {
    return (
      <span
        className={`${imageClassName} inline-flex items-center justify-center bg-slate-100 text-slate-400`}
        title="Evidence is unavailable or you do not have access"
      >
        <ImageOff size={16} />
      </span>
    );
  }

  return (
    <a href={access.url} target="_blank" rel="noreferrer" title={evidence.originalName || 'Inspection evidence'}>
      <img
        src={access.url}
        alt="Inspection evidence"
        className={imageClassName}
        onError={retryExpiredAccess}
      />
    </a>
  );
};

export default function ProcurementEvidenceGallery({ orderId, evidence = [], imageClassName = 'h-14 w-14 rounded-lg object-cover' }) {
  if (!orderId || !evidence.length) return null;
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto">
      {evidence.map(item => (
        <EvidenceImage
          key={item._id}
          orderId={orderId}
          evidence={item}
          imageClassName={imageClassName}
        />
      ))}
    </div>
  );
}

export function ProcurementReinspectionEvidenceGallery({ orderId, reinspections = [], imageClassName }) {
  const withEvidence = reinspections.filter(reinspection => reinspection?.evidence?.length);
  if (!orderId || !withEvidence.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {withEvidence.map((reinspection, index) => (
        <div key={reinspection._id || reinspection.resolutionSubmission || index} className="rounded-lg border border-amber-200 bg-white/70 p-2">
          <p className="text-[8px] font-black uppercase tracking-wider text-amber-800">
            Reinspection evidence {reinspection.inspectedAt ? `· ${new Date(reinspection.inspectedAt).toLocaleString()}` : ''}
          </p>
          <ProcurementEvidenceGallery
            orderId={orderId}
            evidence={reinspection.evidence}
            imageClassName={imageClassName}
          />
        </div>
      ))}
    </div>
  );
}
