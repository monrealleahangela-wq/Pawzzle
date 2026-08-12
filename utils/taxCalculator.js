const roundMoney = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

const TAX_STATUSES = ['non_vat', 'vat_registered', 'vat_exempt', 'zero_rated'];
const PRICING_MODES = ['inclusive', 'exclusive'];

const normalizeTaxConfiguration = (configuration = {}) => {
  const source = configuration?.toObject ? configuration.toObject() : configuration;
  const taxStatus = TAX_STATUSES.includes(source?.taxStatus) ? source.taxStatus : 'non_vat';
  const pricingMode = PRICING_MODES.includes(source?.pricingMode) ? source.pricingMode : 'inclusive';
  const requestedRate = Number(source?.vatRatePercent);
  const vatRatePercent = taxStatus === 'vat_registered'
    ? (Number.isFinite(requestedRate) && requestedRate >= 0 && requestedRate <= 100 ? requestedRate : 12)
    : 0;

  return {
    isConfigured: source?.isConfigured === true,
    taxStatus,
    pricingMode,
    vatRatePercent,
    deliveryFeeTaxable: Boolean(source?.deliveryFeeTaxable),
    configuredAt: source?.configuredAt || null
  };
};

/**
 * Calculates the complete customer-facing transaction breakdown using centavo
 * precision. Discounts reduce the merchandise/service amount before VAT.
 */
const calculateTransactionTax = ({ subtotal, discountAmount = 0, deliveryFee = 0, taxConfiguration = {} }) => {
  const subtotalCents = Math.round(Number(subtotal) * 100);
  const requestedDiscountCents = Math.round(Number(discountAmount) * 100);
  const deliveryCents = Math.round(Number(deliveryFee) * 100);
  if (![subtotalCents, requestedDiscountCents, deliveryCents].every(Number.isFinite)
      || subtotalCents < 0 || requestedDiscountCents < 0 || deliveryCents < 0) {
    throw new Error('Subtotal, discount, and delivery fee must be non-negative numbers.');
  }

  const config = normalizeTaxConfiguration(taxConfiguration);
  const discountCents = Math.min(subtotalCents, requestedDiscountCents);
  const discountedSubtotalCents = subtotalCents - discountCents;
  const isVatable = config.taxStatus === 'vat_registered' && config.vatRatePercent > 0;
  const taxableGoodsCents = isVatable ? discountedSubtotalCents : 0;
  const taxableDeliveryCents = isVatable && config.deliveryFeeTaxable ? deliveryCents : 0;
  const taxableGrossOrNetCents = taxableGoodsCents + taxableDeliveryCents;
  const rate = config.vatRatePercent / 100;

  let vatAmountCents = 0;
  let vatExclusiveAmountCents = taxableGrossOrNetCents;
  if (isVatable && config.pricingMode === 'inclusive') {
    vatAmountCents = Math.round(taxableGrossOrNetCents * rate / (1 + rate));
    vatExclusiveAmountCents = taxableGrossOrNetCents - vatAmountCents;
  } else if (isVatable && config.pricingMode === 'exclusive') {
    vatAmountCents = Math.round(taxableGrossOrNetCents * rate);
  }

  const finalTotalCents = discountedSubtotalCents + deliveryCents
    + (config.pricingMode === 'exclusive' ? vatAmountCents : 0);
  const nonTaxableAmountCents = config.taxStatus === 'vat_registered'
    ? (config.deliveryFeeTaxable ? 0 : deliveryCents)
    : discountedSubtotalCents + deliveryCents;

  const fromCents = (value) => value / 100;
  return {
    calculationVersion: 1,
    subtotal: fromCents(subtotalCents),
    discountAmount: fromCents(discountCents),
    discountedSubtotal: fromCents(discountedSubtotalCents),
    deliveryFee: fromCents(deliveryCents),
    deliveryFeeTaxable: config.deliveryFeeTaxable,
    taxStatus: config.taxStatus,
    pricingMode: config.pricingMode,
    vatRatePercent: config.vatRatePercent,
    vatExclusiveAmount: fromCents(vatExclusiveAmountCents),
    vatAmount: fromCents(vatAmountCents),
    nonTaxableAmount: fromCents(nonTaxableAmountCents),
    finalTotal: fromCents(finalTotalCents),
    configuredAt: config.configuredAt
  };
};

const calculateTax = (amount, taxCode = 'NON_VAT') => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw new Error('Amount must be a non-negative number.');
  if (taxCode === 'VAT_12_INCLUSIVE') {
    const vatAmount = roundMoney(value * 12 / 112);
    return { taxCode, vatRate: 0.12, netAmount: roundMoney(value - vatAmount), vatAmount, grossAmount: roundMoney(value) };
  }
  if (taxCode === 'VAT_12_EXCLUSIVE') {
    const vatAmount = roundMoney(value * 0.12);
    return { taxCode, vatRate: 0.12, netAmount: roundMoney(value), vatAmount, grossAmount: roundMoney(value + vatAmount) };
  }
  return { taxCode, vatRate: 0, netAmount: roundMoney(value), vatAmount: 0, grossAmount: roundMoney(value) };
};

module.exports = {
  TAX_STATUSES,
  PRICING_MODES,
  calculateTax,
  calculateTransactionTax,
  normalizeTaxConfiguration,
  roundMoney
};
