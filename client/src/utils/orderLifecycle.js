const STATUS_ALIASES = Object.freeze({
  pending: 'pending_payment',
  processing: 'preparing',
  shipped: 'in_transit',
  finalized: 'completed'
});

const STATUS_RANK = Object.freeze({
  pending_payment: 0,
  paid: 1,
  awaiting_confirmation: 2,
  confirmed: 3,
  preparing: 4,
  ready_for_pickup: 5,
  rider_assigned: 6,
  picked_up: 7,
  in_transit: 8,
  delivered: 9,
  completed: 10
});

const DELIVERY_TO_ORDER_STATUS = Object.freeze({
  assigned: 'rider_assigned',
  accepted: 'rider_assigned',
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  arrived: 'in_transit',
  delivered: 'delivered',
  returned_to_store: 'returned',
  cancelled: 'cancelled'
});

export const normalizeOrderStatus = status => {
  const normalized = String(status || '').trim().toLowerCase();
  return STATUS_ALIASES[normalized] || normalized;
};

export const getEffectiveOrderStatus = (order = {}) => {
  const orderStatus = normalizeOrderStatus(order.status);
  const deliveryStatus = DELIVERY_TO_ORDER_STATUS[normalizeOrderStatus(order.delivery?.status)];
  if (!deliveryStatus) return orderStatus;
  if (['cancelled', 'returned'].includes(deliveryStatus)) return deliveryStatus;
  return (STATUS_RANK[deliveryStatus] ?? -1) > (STATUS_RANK[orderStatus] ?? -1)
    ? deliveryStatus
    : orderStatus;
};
