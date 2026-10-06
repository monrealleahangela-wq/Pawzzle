const REPORTABLE_DELIVERY_STATUSES = Object.freeze([
  'picked_up',
  'in_transit',
  'arrived',
  'failed_attempt'
]);

const DELIVERY_CONCERN_TYPES = Object.freeze([
  'suspicious_location',
  'damaged_items',
  'other'
]);

const isDeliveryConcernReportable = status => REPORTABLE_DELIVERY_STATUSES.includes(String(status || ''));

const validateDeliveryConcern = input => {
  const content = String(input?.content || '').trim();
  const type = String(input?.type || 'other').trim();

  if (!content || content.length > 1000) {
    return { error: 'Describe the concern in up to 1000 characters.' };
  }
  if (!DELIVERY_CONCERN_TYPES.includes(type)) {
    return { error: 'Select a valid concern type.' };
  }

  return { value: { content, type } };
};

module.exports = {
  DELIVERY_CONCERN_TYPES,
  REPORTABLE_DELIVERY_STATUSES,
  isDeliveryConcernReportable,
  validateDeliveryConcern
};
