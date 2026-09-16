import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { formatPeso, isCompletePaymentSummary, paymentSummaryRows } from '../../utils/paymentSummary';

const PaymentBreakdown = ({
  summary,
  loading = false,
  error = '',
  compact = false,
  showZeroFees = false,
  className = ''
}) => {
  if (loading) {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-500 ${className}`} role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading amount…
      </div>
    );
  }

  if (error || !isCompletePaymentSummary(summary)) {
    return (
      <div className={`flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 ${className}`} role="alert">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error || "We couldn't calculate your total. Please try again."}</span>
      </div>
    );
  }

  const rows = paymentSummaryRows(summary, { showZeroFees });

  return (
    <div className={`${compact ? 'space-y-1.5 text-[10px]' : 'space-y-3 text-xs'} ${className}`}>
      {rows.map((row) => (
        <div key={row.key} className={`${row.key === 'historical-tax' ? 'rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30' : 'flex items-start justify-between gap-4'} text-secondary`}>
          <span className={row.key === 'historical-tax' ? 'block font-bold text-amber-800 dark:text-amber-300' : ''}>{row.label}</span>
          <span className={`${row.key === 'historical-tax' ? 'mt-1 block font-medium text-amber-700 dark:text-amber-200' : 'text-right font-bold text-default'}`}>{row.displayValue}</span>
        </div>
      ))}
      <div className={`${compact ? 'pt-2' : 'pt-3'} flex items-end justify-between gap-4 border-t border-slate-200 dark:border-slate-700`}>
        <span className="font-black text-default">Total to Pay</span>
        <span className={`${compact ? 'text-base' : 'text-xl'} font-black text-primary-700 dark:text-primary-300`}>{formatPeso(summary.finalTotal)}</span>
      </div>
    </div>
  );
};

export default PaymentBreakdown;
