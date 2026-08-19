const asMoney = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

export const formatPeso = (value, fallback = '—') => {
  const amount = asMoney(value);
  if (amount === null) return fallback;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const firstMoney = (...values) => {
  for (const value of values) {
    const amount = asMoney(value);
    if (amount !== null) return amount;
  }
  return null;
};

const sumItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const amounts = items.map(item => {
    const price = asMoney(item?.price ?? item?.unitPrice);
    const quantity = asMoney(item?.quantity);
    return price === null || quantity === null ? null : price * quantity;
  });
  return amounts.some(value => value === null)
    ? null
    : amounts.reduce((total, value) => total + value, 0);
};

export const orderPaymentSummary = (order = {}) => {
  const pricing = order.invoiceSnapshot?.pricingBreakdown || order.pricingBreakdown || {};
  return {
    subtotal: firstMoney(pricing.subtotal, sumItems(order.items)),
    vatAmount: firstMoney(pricing.vatAmount, pricing.calculationVersion ? 0 : null),
    vatRatePercent: firstMoney(pricing.vatRatePercent),
    taxStatus: pricing.taxStatus,
    pricingMode: pricing.pricingMode,
    deliveryFee: firstMoney(pricing.deliveryFee, order.shippingFee, 0),
    serviceFee: firstMoney(pricing.serviceFee, order.serviceFee, 0),
    bookingFee: firstMoney(pricing.bookingFee, order.bookingFee, 0),
    additionalCharges: firstMoney(pricing.additionalCharges, order.additionalCharges, 0),
    discountAmount: firstMoney(pricing.discountAmount, order.discountAmount, 0),
    finalTotal: firstMoney(pricing.finalTotal, order.totalAmount)
  };
};

export const bookingPaymentSummary = (booking = {}) => {
  const pricing = booking.receiptSnapshot?.pricingBreakdown
    || booking.serviceSummary?.pricingBreakdown
    || booking.pricingBreakdown
    || {};
  const additionalParts = [
    pricing.sizeSurcharge,
    pricing.weightSurcharge,
    pricing.breedSurcharge,
    pricing.conditionFees,
    pricing.timePremium,
    pricing.addOnsTotal,
    pricing.homeServiceFee
  ];
  const recordedBasePrice = asMoney(pricing.basePrice);
  const hasDetailedServicePricing = (recordedBasePrice !== null && recordedBasePrice !== 0)
    || additionalParts.some(value => Number(asMoney(value) || 0) !== 0);
  const additionalCharges = hasDetailedServicePricing
    ? additionalParts.reduce((total, value) => total + (asMoney(value) || 0), 0)
    : firstMoney(pricing.additionalCharges, booking.additionalCharges, 0);

  return {
    // The service pricing engine stores its base price and surcharges inside
    // `subtotal`. Split those recorded components for display so the visible
    // rows reconcile to the final total instead of counting surcharges twice.
    subtotal: hasDetailedServicePricing
      ? firstMoney(pricing.basePrice, 0)
      : firstMoney(pricing.subtotal),
    vatAmount: firstMoney(pricing.vatAmount, pricing.calculationVersion ? 0 : null),
    vatRatePercent: firstMoney(pricing.vatRatePercent),
    taxStatus: pricing.taxStatus,
    pricingMode: pricing.pricingMode,
    deliveryFee: firstMoney(pricing.deliveryFee, 0),
    serviceFee: firstMoney(pricing.serviceFee, 0),
    bookingFee: firstMoney(pricing.bookingFee, booking.bookingFee, 0),
    additionalCharges,
    discountAmount: firstMoney(pricing.discountAmount, pricing.discount, booking.discountAmount, 0),
    finalTotal: firstMoney(pricing.finalTotal, pricing.finalPrice, booking.totalPrice)
  };
};

export const purchaseOrderPaymentSummary = (purchaseOrder = {}) => ({
  subtotal: firstMoney(purchaseOrder.subtotal, sumItems(purchaseOrder.items)),
  vatAmount: firstMoney(purchaseOrder.tax, 0),
  vatRatePercent: null,
  taxStatus: purchaseOrder.taxCode,
  pricingMode: null,
  deliveryFee: firstMoney(purchaseOrder.shippingCost, 0),
  serviceFee: 0,
  bookingFee: 0,
  additionalCharges: firstMoney(purchaseOrder.additionalCharges, 0),
  discountAmount: firstMoney(purchaseOrder.discountAmount, 0),
  finalTotal: firstMoney(purchaseOrder.totalCost)
});

export const isCompletePaymentSummary = (summary) => (
  Boolean(summary)
  && asMoney(summary.subtotal) !== null
  && asMoney(summary.finalTotal) !== null
  && asMoney(summary.vatAmount) !== null
);
