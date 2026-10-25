const MANUAL_RESTOCK_BLOCK_MESSAGE = 'Out-of-stock products must be reordered from a supplier. Stock increases only after the delivery is received and confirmed.';

const resultingQuantity = ({ currentQuantity, operation = 'set', quantity }) => {
  const current = Math.max(0, Number(currentQuantity) || 0);
  const requested = Math.max(0, Number(quantity) || 0);
  if (operation === 'add') return current + requested;
  if (operation === 'subtract') return Math.max(0, current - requested);
  return requested;
};

const manualRestockBlockReason = ({ currentQuantity, operation = 'set', quantity }) => (
  Number(currentQuantity || 0) <= 0
    && resultingQuantity({ currentQuantity, operation, quantity }) > 0
      ? MANUAL_RESTOCK_BLOCK_MESSAGE
      : null
);

module.exports = {
  MANUAL_RESTOCK_BLOCK_MESSAGE,
  resultingQuantity,
  manualRestockBlockReason
};
