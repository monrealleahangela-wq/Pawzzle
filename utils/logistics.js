const getDeliveryStatusLabel = status => ({
  pending: 'Pending Assignment', unassigned: 'Pending Assignment', assigned: 'Assigned',
  accepted: 'Assigned', picked_up: 'Out for Delivery', in_transit: 'Out for Delivery',
  arrived: 'Arrived', delivered: 'Delivered', failed_attempt: 'Delivery Attempted',
  returned_to_store: 'Failed', cancelled: 'Cancelled', declined: 'Failed'
}[status] || String(status || '').replace(/_/g, ' '));

const getDeliveryLinkStatus = delivery => {
  if (delivery.status === 'delivered') return 'completed';
  if (!delivery.isLive) return 'inactive';
  if (delivery.assignmentType === 'unassigned') return 'not_generated';
  if (delivery.riderLinkOpenedAt) return 'opened';
  return 'active';
};

module.exports = { getDeliveryStatusLabel, getDeliveryLinkStatus };
