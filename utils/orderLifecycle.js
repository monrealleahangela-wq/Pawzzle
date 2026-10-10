const STATUS_ALIASES = Object.freeze({
  pending: 'pending_payment',
  processing: 'preparing',
  shipped: 'in_transit',
  finalized: 'completed'
});

const VALID_NEXT_STATES = Object.freeze({
  pending_payment: ['paid', 'cancelled', 'payment_failed'],
  paid: ['awaiting_confirmation', 'cancelled'],
  awaiting_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['rider_assigned', 'cancelled'],
  rider_assigned: ['picked_up', 'delivery_failed'],
  picked_up: ['in_transit', 'delivery_failed'],
  in_transit: ['delivered', 'delivery_failed'],
  delivered: ['completed', 'returned'],
  completed: [],
  cancelled: [],
  payment_failed: ['paid', 'pending_payment'],
  delivery_failed: ['ready_for_pickup', 'cancelled'],
  returned: []
});

const PACKING_OR_EARLIER = new Set(['pending_payment', 'paid', 'awaiting_confirmation', 'confirmed', 'preparing']);
const DELIVERY_PAST_PACKING = new Set(['assigned', 'accepted', 'picked_up', 'in_transit', 'arrived', 'delivered', 'failed_attempt', 'returned_to_store', 'cancelled']);
const STATUS_RANK = Object.freeze({
  pending_payment: 0, paid: 1, awaiting_confirmation: 2, confirmed: 3, preparing: 4,
  ready_for_pickup: 5, rider_assigned: 6, picked_up: 7, in_transit: 8,
  delivered: 9, completed: 10
});

const normalizeOrderStatus = status => {
  const normalized = String(status || '').trim().toLowerCase();
  return STATUS_ALIASES[normalized] || normalized;
};

const evaluateOrderTransition = ({ currentStatus, nextStatus, deliveryStatus, allowRecovery = false }) => {
  const current = normalizeOrderStatus(currentStatus);
  const next = normalizeOrderStatus(nextStatus);
  if (!Object.prototype.hasOwnProperty.call(VALID_NEXT_STATES, current)
      || !Object.prototype.hasOwnProperty.call(VALID_NEXT_STATES, next)) {
    return { valid: false, current, next, statusCode: 400, message: 'Unsupported order status.' };
  }
  if (current === next) return { valid: true, same: true, current, next };
  if (DELIVERY_PAST_PACKING.has(String(deliveryStatus || '').toLowerCase()) && PACKING_OR_EARLIER.has(next)) {
    return { valid: false, current, next, statusCode: 409, message: 'This order is already past packing in its linked Delivery lifecycle.' };
  }
  if ((STATUS_RANK[current] ?? -1) > STATUS_RANK.preparing && PACKING_OR_EARLIER.has(next)) {
    return { valid: false, current, next, statusCode: 409, message: `An order at ${current} cannot return to packing.` };
  }
  if (['completed', 'cancelled', 'returned'].includes(current)) {
    return { valid: false, current, next, statusCode: 409, message: `A ${current} order cannot return to an earlier fulfillment stage.` };
  }
  if (allowRecovery) return { valid: true, current, next };
  const allowed = VALID_NEXT_STATES[current] || [];
  return allowed.includes(next)
    ? { valid: true, current, next }
    : { valid: false, current, next, statusCode: 400, message: `Illegal transition from ${current} to ${next}`, allowed };
};

module.exports = { STATUS_ALIASES, VALID_NEXT_STATES, normalizeOrderStatus, evaluateOrderTransition };
