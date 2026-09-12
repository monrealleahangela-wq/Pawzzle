const asMoney = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

export const TRANSACTION_TYPES = Object.freeze({
  PRODUCT_ORDER: 'product_order',
  SERVICE_BOOKING: 'service_booking',
  PURCHASE_ORDER: 'purchase_order'
});

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
  const delivery = order.invoiceSnapshot?.deliveryFeeCalculation || order.deliveryFeeCalculation || {};
  const deliveryFee = firstMoney(pricing.deliveryFee, order.shippingFee, 0);
  const deliveryMethod = order.deliveryMethod || order.fulfillmentMethod || '';
  return {
    transactionType: TRANSACTION_TYPES.PRODUCT_ORDER,
    subtotal: firstMoney(pricing.subtotal, sumItems(order.items)),
    vatAmount: firstMoney(pricing.vatAmount, pricing.calculationVersion ? 0 : null),
    vatRatePercent: firstMoney(pricing.vatRatePercent),
    taxStatus: pricing.taxStatus,
    pricingMode: pricing.pricingMode,
    deliveryFee,
    deliveryApplies: deliveryMethod === 'delivery' || Boolean(delivery?.breakdown) || Number(deliveryFee || 0) > 0,
    deliveryMethod,
    serviceFee: firstMoney(pricing.serviceFee, order.serviceFee, 0),
    bookingFee: firstMoney(pricing.bookingFee, order.bookingFee, 0),
    additionalCharges: firstMoney(pricing.additionalCharges, order.additionalCharges, 0),
    discountAmount: firstMoney(pricing.discountAmount, order.discountAmount, 0),
    finalTotal: firstMoney(pricing.finalTotal, order.totalAmount),
    paymentMethod: order.paymentMethod || '',
    paymentStatus: order.paymentStatus || '',
    deliveryDetails: delivery?.breakdown ? {
      distanceKm: firstMoney(delivery.distanceKm),
      baseFee: firstMoney(delivery.breakdown.baseFee, 0),
      ratePerKilometer: firstMoney(delivery.breakdown.ratePerKilometer, 0),
      billableKilometers: firstMoney(delivery.breakdown.billableKilometers, 0),
      distanceCharge: firstMoney(delivery.breakdown.distanceCharge, 0),
      itemQuantity: firstMoney(delivery.itemQuantity, delivery.breakdown.itemQuantity, 1),
      additionalItemQuantity: firstMoney(delivery.breakdown.additionalItemQuantity, 0),
      additionalItemFee: firstMoney(delivery.breakdown.additionalItemFee, 0),
      itemCharge: firstMoney(delivery.breakdown.itemCharge, 0)
    } : null
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
    pricing.addOnsTotal
  ];
  const homeServiceFee = firstMoney(pricing.homeServiceFee, booking.homeServiceFee, 0);
  const recordedBasePrice = asMoney(pricing.basePrice);
  const hasDetailedServicePricing = (recordedBasePrice !== null && recordedBasePrice !== 0)
    || Number(homeServiceFee || 0) !== 0
    || additionalParts.some(value => Number(asMoney(value) || 0) !== 0);
  const additionalCharges = hasDetailedServicePricing
    ? additionalParts.reduce((total, value) => total + (asMoney(value) || 0), 0)
    : firstMoney(pricing.additionalCharges, booking.additionalCharges, 0);

  return {
    transactionType: TRANSACTION_TYPES.SERVICE_BOOKING,
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
    homeServiceFee,
    additionalCharges,
    discountAmount: firstMoney(pricing.discountAmount, pricing.discount, booking.discountAmount, 0),
    finalTotal: firstMoney(pricing.finalTotal, pricing.finalPrice, booking.totalPrice),
    paymentMethod: booking.paymentMethod || '',
    paymentStatus: booking.paymentStatus || ''
  };
};

export const purchaseOrderPaymentSummary = (purchaseOrder = {}) => ({
  transactionType: TRANSACTION_TYPES.PURCHASE_ORDER,
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
  finalTotal: firstMoney(purchaseOrder.totalCost),
  paymentMethod: purchaseOrder.paymentMethod || '',
  paymentStatus: purchaseOrder.paymentStatus || ''
});

export const isCompletePaymentSummary = (summary) => (
  Boolean(summary)
  && asMoney(summary.subtotal) !== null
  && asMoney(summary.finalTotal) !== null
);

const readableValue = value => String(value || '')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

const moneyRow = (key, label, value, prefix = '') => ({
  key,
  label,
  displayValue: `${prefix}${formatPeso(value)}`
});

const textRow = (key, label, value) => ({ key, label, displayValue: value });

const taxRows = summary => {
  const rate = summary.vatRatePercent !== null && summary.vatRatePercent !== undefined
    ? ` (${Number(summary.vatRatePercent)}%)`
    : '';
  if (summary.taxStatus === 'vat_registered') {
    return [moneyRow('vat', `${summary.pricingMode === 'inclusive' ? 'VAT included' : 'VAT'}${rate}`, summary.vatAmount)];
  }
  if (summary.taxStatus === 'non_vat') return [textRow('tax-status', 'Tax status', 'Non-VAT')];
  if (summary.taxStatus === 'vat_exempt') return [textRow('tax-status', 'Tax status', 'VAT Exempt')];
  if (summary.taxStatus === 'zero_rated') return [textRow('tax-status', 'Tax status', 'Zero-Rated VAT')];
  return Number(summary.vatAmount || 0) !== 0 ? [moneyRow('tax', 'VAT / Tax', summary.vatAmount)] : [];
};

export const paymentSummaryRows = (summary = {}, { showZeroFees = false } = {}) => {
  const type = summary.transactionType;
  const rows = [moneyRow(
    'subtotal',
    type === TRANSACTION_TYPES.SERVICE_BOOKING ? 'Service price' : (type === TRANSACTION_TYPES.PRODUCT_ORDER ? 'Product subtotal' : 'Items subtotal'),
    summary.subtotal
  ), ...taxRows(summary)];
  const nonZero = value => Number(value || 0) !== 0;

  if (type === TRANSACTION_TYPES.PRODUCT_ORDER) {
    if (summary.deliveryDetails) {
      rows.push(textRow('shipping-distance', 'Shipping distance', `${Number(summary.deliveryDetails.distanceKm || 0).toFixed(2)} km`));
      rows.push(moneyRow('delivery-base', 'Base delivery fee', summary.deliveryDetails.baseFee));
      if (nonZero(summary.deliveryDetails.distanceCharge) || nonZero(summary.deliveryDetails.billableKilometers)) {
        rows.push(moneyRow(
          'delivery-distance',
          `Distance charge (${Number(summary.deliveryDetails.billableKilometers || 0).toFixed(2)} km × ${formatPeso(summary.deliveryDetails.ratePerKilometer)})`,
          summary.deliveryDetails.distanceCharge
        ));
      }
      if (nonZero(summary.deliveryDetails.itemCharge) || nonZero(summary.deliveryDetails.additionalItemQuantity)) {
        rows.push(moneyRow(
          'delivery-items',
          `Additional items (${summary.deliveryDetails.additionalItemQuantity || 0} × ${formatPeso(summary.deliveryDetails.additionalItemFee)})`,
          summary.deliveryDetails.itemCharge
        ));
      }
    }
    if (summary.deliveryApplies) {
      rows.push(Number(summary.deliveryFee || 0) === 0
        ? textRow('delivery-total', 'Delivery', 'Free')
        : moneyRow('delivery-total', 'Delivery total', summary.deliveryFee));
    }
    if (nonZero(summary.additionalCharges)) rows.push(moneyRow('additional', 'Other charges', summary.additionalCharges));
  } else if (type === TRANSACTION_TYPES.SERVICE_BOOKING) {
    if (showZeroFees || nonZero(summary.serviceFee)) rows.push(moneyRow('service-fee', 'Service fee', summary.serviceFee));
    if (showZeroFees || nonZero(summary.bookingFee)) rows.push(moneyRow('booking-fee', 'Booking fee', summary.bookingFee));
    if (showZeroFees || nonZero(summary.homeServiceFee)) rows.push(moneyRow('home-service-fee', 'Home service fee', summary.homeServiceFee));
    if (showZeroFees || nonZero(summary.additionalCharges)) rows.push(moneyRow('additional', 'Additional service charges', summary.additionalCharges));
  } else {
    if (showZeroFees || nonZero(summary.deliveryFee)) rows.push(moneyRow('delivery-total', 'Delivery fee', summary.deliveryFee));
    if (showZeroFees || nonZero(summary.additionalCharges)) rows.push(moneyRow('additional', 'Additional charges', summary.additionalCharges));
  }

  if (nonZero(summary.discountAmount)) rows.push(moneyRow('discount', 'Voucher discount', summary.discountAmount, '−'));
  if (summary.paymentMethod) rows.push(textRow('payment-method', 'Payment method', readableValue(summary.paymentMethod)));
  if (summary.paymentStatus) rows.push(textRow('payment-status', 'Payment status', readableValue(summary.paymentStatus)));
  return rows;
};
