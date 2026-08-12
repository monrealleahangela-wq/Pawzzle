export const calculateTransactionTax = ({ subtotal, discountAmount = 0, deliveryFee = 0, taxConfiguration = {} }) => {
  const toCents = (value) => Math.round(Number(value || 0) * 100);
  const subtotalCents = Math.max(0, toCents(subtotal));
  const discountCents = Math.min(subtotalCents, Math.max(0, toCents(discountAmount)));
  const deliveryCents = Math.max(0, toCents(deliveryFee));
  const discountedSubtotalCents = subtotalCents - discountCents;
  const taxStatus = taxConfiguration?.taxStatus || 'non_vat';
  const pricingMode = taxConfiguration?.pricingMode || 'inclusive';
  const vatRatePercent = taxStatus === 'vat_registered' ? Number(taxConfiguration?.vatRatePercent ?? 12) : 0;
  const deliveryFeeTaxable = Boolean(taxConfiguration?.deliveryFeeTaxable);
  const rate = vatRatePercent / 100;
  const taxableCents = taxStatus === 'vat_registered'
    ? discountedSubtotalCents + (deliveryFeeTaxable ? deliveryCents : 0)
    : 0;
  const vatCents = taxStatus !== 'vat_registered' ? 0 : pricingMode === 'inclusive'
    ? Math.round(taxableCents * rate / (1 + rate))
    : Math.round(taxableCents * rate);
  const finalCents = discountedSubtotalCents + deliveryCents + (pricingMode === 'exclusive' ? vatCents : 0);
  return {
    calculationVersion: 1,
    subtotal: subtotalCents / 100,
    discountAmount: discountCents / 100,
    discountedSubtotal: discountedSubtotalCents / 100,
    deliveryFee: deliveryCents / 100,
    deliveryFeeTaxable,
    taxStatus,
    pricingMode,
    vatRatePercent,
    vatExclusiveAmount: pricingMode === 'inclusive' ? (taxableCents - vatCents) / 100 : taxableCents / 100,
    vatAmount: vatCents / 100,
    finalTotal: finalCents / 100
  };
};

export const getTaxStatusLabel = (breakdown) => !breakdown?.calculationVersion ? 'Tax not recorded' : ({
  non_vat: 'Store is not VAT-registered',
  vat_registered: breakdown?.pricingMode === 'inclusive' ? 'VAT included' : 'VAT',
  vat_exempt: 'VAT-exempt sale',
  zero_rated: 'Zero-rated sale'
}[breakdown?.taxStatus] || 'Tax');
