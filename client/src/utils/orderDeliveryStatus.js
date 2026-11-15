const STATUS_PRESENTATION = {
  order_placed: { label: 'Order Placed', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  pending_payment: { label: 'Payment Pending', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid: { label: 'Payment Confirmed', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  awaiting_confirmation: { label: 'Awaiting Store Confirmation', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  confirmed: { label: 'Order Confirmed', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  preparing: { label: 'Preparing Order', badgeClass: 'bg-violet-50 text-violet-700 border-violet-200' },
  ready_for_pickup: { label: 'Awaiting Rider', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' },
  pending: { label: 'Preparing Delivery', badgeClass: 'bg-violet-50 text-violet-700 border-violet-200' },
  unassigned: { label: 'Awaiting Rider', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' },
  rider_assigned: { label: 'Rider Assigned', badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  assigned: { label: 'Rider Assigned', badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  accepted: { label: 'Rider Accepted', badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  declined: { label: 'Rider Assignment Declined', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  picked_up: { label: 'Picked Up', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
  in_transit: { label: 'Out for Delivery', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
  arrived: { label: 'Rider Arrived', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200' },
  delivered: { label: 'Delivered', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  completed: { label: 'Completed', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed_attempt: { label: 'Delivery Attempt Issue', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  delivery_failed: { label: 'Delivery Failed', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  returned_to_store: { label: 'Returned to Store', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  returned: { label: 'Returned', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'Cancelled', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  refunded: { label: 'Refunded', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  payment_failed: { label: 'Payment Failed', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' }
};

const TERMINAL_ORDER_STATUSES = new Set([
  'cancelled', 'refunded', 'returned', 'delivery_failed', 'delivered', 'completed', 'payment_failed'
]);

const ACTIVE_DELIVERY_STATUSES = new Set([
  'assigned', 'accepted', 'declined', 'picked_up', 'in_transit', 'arrived',
  'delivered', 'failed_attempt', 'returned_to_store', 'cancelled'
]);

const normalizeStatus = value => String(value || '').trim().toLowerCase();

const canonicalStatus = value => {
  const status = normalizeStatus(value);
  if (['assigned', 'rider_assigned'].includes(status)) return 'rider_assigned';
  if (status === 'returned_to_store') return 'returned';
  return status;
};

const presentationFor = status => STATUS_PRESENTATION[status] || {
  label: String(status || 'Status unavailable').replace(/_/g, ' '),
  badgeClass: 'bg-slate-100 text-slate-600 border-slate-200'
};

export const getOrderDeliveryStatus = order => {
  const orderStatus = normalizeStatus(order?.status);
  const delivery = order?.delivery;
  const deliveryStatus = normalizeStatus(delivery?.status);

  let status;
  if (TERMINAL_ORDER_STATUSES.has(orderStatus)) {
    status = orderStatus;
  } else if (ACTIVE_DELIVERY_STATUSES.has(deliveryStatus)) {
    status = deliveryStatus;
  } else if (deliveryStatus === 'unassigned' && ['ready_for_pickup', 'rider_assigned'].includes(orderStatus)) {
    status = 'unassigned';
  } else if (deliveryStatus === 'pending' && ['ready_for_pickup', 'rider_assigned'].includes(orderStatus)) {
    status = 'unassigned';
  } else if (orderStatus === 'rider_assigned') {
    status = 'rider_assigned';
  } else {
    status = orderStatus || deliveryStatus || 'pending';
  }

  return { status, ...presentationFor(status) };
};

const descriptionFor = status => ({
  order_placed: 'Pawzzle received the order.',
  pending_payment: 'Payment has not been confirmed yet.',
  paid: 'Payment was confirmed.',
  awaiting_confirmation: 'The Store is reviewing the order.',
  confirmed: 'The Store confirmed the order.',
  preparing: 'The Store is preparing the parcel.',
  ready_for_pickup: 'The parcel is ready and waiting for a Rider.',
  pending: 'Delivery preparation has started.',
  unassigned: 'Pawzzle is waiting for an available Rider.',
  rider_assigned: 'A Pawzzle Rider was assigned.',
  assigned: 'A Pawzzle Rider was assigned.',
  accepted: 'The assigned Rider accepted the delivery.',
  declined: 'The Rider declined the assignment; a new assignment is required.',
  picked_up: 'The Rider collected the parcel from the Store.',
  in_transit: 'The parcel is on the way to the delivery address.',
  arrived: 'The Rider arrived at the delivery address.',
  delivered: 'The delivery was completed.',
  completed: 'The order was completed.',
  failed_attempt: 'The Rider recorded an unsuccessful delivery attempt.',
  delivery_failed: 'The delivery could not be completed.',
  returned_to_store: 'The parcel was returned to the Store.',
  returned: 'The order was returned.',
  cancelled: 'The order or delivery was cancelled.',
  refunded: 'The order payment was refunded.',
  payment_failed: 'The payment could not be completed.'
}[status] || `Status updated to ${String(status || '').replace(/_/g, ' ')}.`);

export const buildOrderDeliveryTimeline = order => {
  if (!order) return [];
  const current = getOrderDeliveryStatus(order);
  const entries = [];
  const add = (statusValue, timestampValue, description, source) => {
    const status = normalizeStatus(statusValue);
    const timestamp = new Date(timestampValue);
    if (!status || Number.isNaN(timestamp.getTime())) return;
    entries.push({
      status,
      timestamp: timestamp.toISOString(),
      description: description || descriptionFor(status),
      source
    });
  };

  add('order_placed', order.orderDate || order.createdAt, descriptionFor('order_placed'), 'order');
  (order.fulfillmentTimeline || []).forEach(entry => add(entry.status, entry.timestamp, entry.description, 'order'));
  (order.delivery?.statusHistory || []).forEach(entry => add(entry.status, entry.timestamp, entry.notes, 'delivery'));

  const hasCurrentStatus = entries.some(entry => canonicalStatus(entry.status) === canonicalStatus(current.status));
  if (!hasCurrentStatus) {
    add(current.status, order.delivery?.updatedAt || order.updatedAt || new Date(), descriptionFor(current.status), 'current');
  }

  const deduplicated = [];
  entries
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
    .forEach(entry => {
      const previous = deduplicated[deduplicated.length - 1];
      const sameStatus = previous && canonicalStatus(previous.status) === canonicalStatus(entry.status);
      const closeInTime = previous && Math.abs(new Date(previous.timestamp) - new Date(entry.timestamp)) < 60 * 1000;
      if (sameStatus && closeInTime) {
        if (entry.source === 'delivery') deduplicated[deduplicated.length - 1] = entry;
        return;
      }
      deduplicated.push(entry);
    });

  return deduplicated.map((entry, index) => ({
    ...entry,
    label: presentationFor(entry.status).label,
    isCurrent: index === deduplicated.length - 1
  }));
};

export { STATUS_PRESENTATION };
