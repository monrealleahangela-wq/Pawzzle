import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { formatPeso, isCompletePaymentSummary } from '../../utils/paymentSummary';

const taxLabel = (summary) => {
  if (summary?.taxStatus === 'vat_registered') {
    const prefix = summary.pricingMode === 'inclusive' ? 'VAT Included' : 'VAT';
    return `${prefix}${summary.vatRatePercent !== null && summary.vatRatePercent !== undefined ? ` (${summary.vatRatePercent}%)` : ''}`;
  }
  if (summary?.taxStatus === 'vat_exempt') return 'VAT-Exempt Tax';
  if (summary?.taxStatus === 'zero_rated') return 'Zero-Rated VAT';
  if (summary?.taxStatus === 'non_vat') return 'VAT / Tax (Non-VAT)';
  return 'VAT / Tax';
};

const PaymentBreakdown = ({
  summary,
  loading = false,
  error = '',
  compact = false,
  showZeroFees = true,
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

  const rows = [
    ['Subtotal', summary.subtotal],
    [taxLabel(summary), summary.vatAmount],
    ['Delivery fee', summary.deliveryFee],
    ['Service fee', summary.serviceFee],
    ['Booking fee', summary.bookingFee],
    ['Additional charges', summary.additionalCharges]
  ].filter(([, value]) => showZeroFees || Number(value || 0) !== 0);

  return (
    <div className={`${compact ? 'space-y-1.5 text-[10px]' : 'space-y-3 text-xs'} ${className}`}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 text-secondary">
          <span>{label}</span>
          <span className="font-bold text-default">{formatPeso(value)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 font-bold text-emerald-700 dark:text-emerald-300">
        <span>Voucher discount</span>
        <span>{Number(summary.discountAmount || 0) > 0 ? `−${formatPeso(summary.discountAmount)}` : formatPeso(0)}</span>
      </div>
      <div className={`${compact ? 'pt-2' : 'pt-3'} flex items-end justify-between gap-4 border-t border-slate-200 dark:border-slate-700`}>
        <span className="font-black text-default">Total</span>
        <span className={`${compact ? 'text-base' : 'text-xl'} font-black text-primary-700 dark:text-primary-300`}>{formatPeso(summary.finalTotal)}</span>
      </div>
    </div>
  );
};

export default PaymentBreakdown;
