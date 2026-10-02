const RECEIVING_PROCESSING_STALE_MS = 5 * 60 * 1000;

const getReceivingProcessingCutoff = (now = Date.now()) => (
  new Date(Number(now) - RECEIVING_PROCESSING_STALE_MS)
);

const validateProcurementQuantity = ({ quantity, minimumOrderQuantity, availableStock, itemType = 'pet_supply' }) => {
  const value = Number(quantity);
  if (!Number.isInteger(value) || value <= 0) return { valid: false, reason: 'positive_whole_number' };
  if (itemType === 'live_pet' && value !== 1) return { valid: false, reason: 'live_pet_quantity' };
  if (value < Number(minimumOrderQuantity)) return { valid: false, reason: 'below_minimum' };
  if (value > Number(availableStock)) return { valid: false, reason: 'insufficient_stock' };
  return { valid: true, quantity: value };
};

const normalizeInspectionItem = ({ orderItem, submitted = {} }) => {
  const expectedQuantity = Number(orderItem.quantity);
  const receivedQuantity = Number(submitted.receivedQuantity ?? expectedQuantity);
  const damagedQuantity = Number(submitted.damagedQuantity || 0);
  const incorrectQuantity = Number(submitted.incorrectQuantity || 0);
  const integers = [expectedQuantity, receivedQuantity, damagedQuantity, incorrectQuantity];
  if (!integers.every(value => Number.isInteger(value) && value >= 0)
      || receivedQuantity > expectedQuantity
      || damagedQuantity + incorrectQuantity > receivedQuantity) {
    const error = new Error(`Invalid receiving quantities for "${orderItem.productName}".`);
    error.statusCode = 400;
    throw error;
  }
  if (orderItem.itemType === 'live_pet' && ![0, 1].includes(receivedQuantity)) {
    const error = new Error('A live pet receiving quantity must be zero or one.');
    error.statusCode = 400;
    throw error;
  }
  const acceptedQuantity = receivedQuantity - damagedQuantity - incorrectQuantity;
  const missingQuantity = expectedQuantity - receivedQuantity;
  const issueTypes = [
    missingQuantity > 0 && 'missing',
    damagedQuantity > 0 && 'damaged',
    incorrectQuantity > 0 && 'incorrect'
  ].filter(Boolean);
  return {
    purchaseOrderItem: orderItem._id,
    itemType: orderItem.itemType || 'pet_supply',
    expectedQuantity,
    receivedQuantity,
    damagedQuantity,
    incorrectQuantity,
    acceptedQuantity,
    missingQuantity,
    condition: issueTypes.length > 1 ? 'mixed' : (issueTypes[0] || 'acceptable'),
    notes: submitted.notes,
    lotDetails: submitted.lotDetails || {}
  };
};

const determineInspectionOutcome = items => {
  const hasIssue = items.some(item => item.missingQuantity > 0 || item.damagedQuantity > 0 || item.incorrectQuantity > 0);
  if (!hasIssue) return 'accepted';
  return items.some(item => item.acceptedQuantity > 0) ? 'partially_accepted' : 'issue_reported';
};

const groupProcurementItemsBySupplier = items => {
  const groups = new Map();
  for (const item of items) {
    const supplierId = String(item.supplier?._id || item.supplier);
    if (!groups.has(supplierId)) groups.set(supplierId, { supplier: item.supplier, items: [] });
    groups.get(supplierId).items.push(item.orderItem);
  }
  return groups;
};

module.exports = {
  RECEIVING_PROCESSING_STALE_MS,
  getReceivingProcessingCutoff,
  validateProcurementQuantity,
  groupProcurementItemsBySupplier,
  normalizeInspectionItem,
  determineInspectionOutcome
};
