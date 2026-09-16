const DeliveryFeeService = require('./deliveryFeeService');

const OPTIONAL_FIELDS = new Set(['maximumFee', 'maximumDistanceKm']);
const NUMERIC_FIELDS = [
  'baseFee',
  'includedKilometers',
  'ratePerKilometer',
  'additionalItemFee',
  'minimumFee',
  'maximumFee',
  'maximumDistanceKm'
];

const normalizeRuleInput = input => Object.fromEntries(NUMERIC_FIELDS.map(field => {
  const rawValue = input?.[field];
  const empty = rawValue === '' || rawValue === null || rawValue === undefined;
  return [field, empty ? (OPTIONAL_FIELDS.has(field) ? null : Number.NaN) : Number(rawValue)];
}));

const validateRuleInput = input => {
  const values = normalizeRuleInput(input);
  const fieldErrors = {};

  NUMERIC_FIELDS.forEach(field => {
    const value = values[field];
    if (value === null && OPTIONAL_FIELDS.has(field)) return;
    if (!Number.isFinite(value)) fieldErrors[field] = 'Enter a valid number.';
    else if (value < 0) fieldErrors[field] = 'Value cannot be negative.';
  });

  if (values.maximumDistanceKm !== null && Number.isFinite(values.maximumDistanceKm) && values.maximumDistanceKm <= 0) {
    fieldErrors.maximumDistanceKm = 'Maximum delivery distance must be greater than zero.';
  }
  if (values.maximumFee !== null
      && Number.isFinite(values.maximumFee)
      && Number.isFinite(values.minimumFee)
      && values.maximumFee < values.minimumFee) {
    fieldErrors.maximumFee = 'Maximum fee cannot be lower than the minimum fee.';
  }

  return { values, fieldErrors, valid: Object.keys(fieldErrors).length === 0 };
};

const calculateRulePreview = ({ input, distanceKm = 5, itemQuantity = 3 }) => {
  const { values, fieldErrors, valid } = validateRuleInput(input);
  if (!valid) return { values, fieldErrors, valid };

  const distance = Number(distanceKm);
  const quantity = Number(itemQuantity);
  if (!Number.isFinite(distance) || distance < 0) {
    return { values, fieldErrors: { distanceKm: 'Preview distance must be zero or greater.' }, valid: false };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { values, fieldErrors: { itemQuantity: 'Preview item quantity must be a positive whole number.' }, valid: false };
  }

  return {
    values,
    fieldErrors: {},
    valid: true,
    distanceKm: distance,
    itemQuantity: quantity,
    ...DeliveryFeeService.__test.calculateBreakdown({ rule: values, distanceKm: distance, itemQuantity: quantity })
  };
};

module.exports = {
  NUMERIC_FIELDS,
  normalizeRuleInput,
  validateRuleInput,
  calculateRulePreview
};
