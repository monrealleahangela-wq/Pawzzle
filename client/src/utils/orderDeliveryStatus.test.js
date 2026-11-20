import { buildOrderDeliveryTimeline, getOrderDeliveryStatus } from './orderDeliveryStatus';

test('uses the real order state before a Rider is needed', () => {
  expect(getOrderDeliveryStatus({ status: 'preparing', delivery: { status: 'unassigned', assignmentType: 'unassigned' } }).label)
    .toBe('Preparing Order');
  expect(getOrderDeliveryStatus({ status: 'ready_for_pickup', delivery: { status: 'unassigned', assignmentType: 'unassigned' } }).label)
    .toBe('Awaiting Rider');
  expect(getOrderDeliveryStatus({ status: 'rider_assigned', delivery: { status: 'unassigned', assignmentType: 'unassigned' } }).label)
    .toBe('Awaiting Rider');
});

test('keeps store pickup out of the Rider workflow and shows both confirmations', () => {
  expect(getOrderDeliveryStatus({ status: 'ready_for_pickup', deliveryMethod: 'pickup' }).label)
    .toBe('Ready for Store Pickup');
  expect(getOrderDeliveryStatus({
    status: 'ready_for_pickup',
    deliveryMethod: 'pickup',
    pickupSession: { customerConfirmedAt: '2026-11-20T01:00:00.000Z' }
  }).label).toBe('Customer Confirmed - Store Pending');
  expect(getOrderDeliveryStatus({
    status: 'ready_for_pickup',
    deliveryMethod: 'pickup',
    pickupSession: { sellerConfirmedAt: '2026-11-20T01:00:00.000Z' }
  }).label).toBe('Store Confirmed - Customer Pending');
  expect(getOrderDeliveryStatus({ status: 'delivered', deliveryMethod: 'pickup' }).label)
    .toBe('Store Pickup Completed');
});

test('uses active delivery status instead of the assignment-type badge', () => {
  expect(getOrderDeliveryStatus({ status: 'picked_up', delivery: { status: 'picked_up', assignmentType: 'internal' } }).label)
    .toBe('Picked Up');
  expect(getOrderDeliveryStatus({ status: 'in_transit', delivery: { status: 'in_transit', assignmentType: 'internal' } }).label)
    .toBe('Out for Delivery');
  expect(getOrderDeliveryStatus({ status: 'customer_confirmation_pending', delivery: { status: 'customer_confirmation_pending', assignmentType: 'internal' } }).label)
    .toBe('Customer Confirmation Pending');
  expect(getOrderDeliveryStatus({ status: 'delivered', delivery: { status: 'delivered', assignmentType: 'internal' } }).label)
    .toBe('Delivered');
});

test('shows rider proof submission before final customer-confirmed delivery', () => {
  const timeline = buildOrderDeliveryTimeline({
    status: 'customer_confirmation_pending',
    orderDate: '2026-11-17T08:00:00.000Z',
    fulfillmentTimeline: [
      { status: 'customer_confirmation_pending', timestamp: '2026-11-17T09:00:00.000Z' }
    ],
    delivery: {
      status: 'customer_confirmation_pending',
      assignmentType: 'internal',
      statusHistory: [
        { status: 'arrived', timestamp: '2026-11-17T08:55:00.000Z' },
        { status: 'customer_confirmation_pending', timestamp: '2026-11-17T09:00:00.000Z' }
      ]
    }
  });

  expect(timeline[timeline.length - 1].label).toBe('Customer Confirmation Pending');
  expect(timeline[timeline.length - 1].isCurrent).toBe(true);
});

test('terminal order state overrides a stale Rider assignment', () => {
  expect(getOrderDeliveryStatus({ status: 'cancelled', delivery: { status: 'assigned', assignmentType: 'internal' } }).label)
    .toBe('Cancelled');
});

test('combines order fulfillment and persisted delivery history chronologically', () => {
  const timeline = buildOrderDeliveryTimeline({
    status: 'in_transit',
    orderDate: '2026-11-15T01:00:00.000Z',
    updatedAt: '2026-11-15T05:00:00.000Z',
    fulfillmentTimeline: [
      { status: 'paid', timestamp: '2026-11-15T02:00:00.000Z', description: 'Payment confirmed.' },
      { status: 'rider_assigned', timestamp: '2026-11-15T03:00:00.000Z' }
    ],
    delivery: {
      status: 'in_transit', assignmentType: 'internal', updatedAt: '2026-11-15T05:00:00.000Z',
      statusHistory: [
        { status: 'assigned', timestamp: '2026-11-15T03:00:15.000Z' },
        { status: 'picked_up', timestamp: '2026-11-15T04:00:00.000Z' },
        { status: 'in_transit', timestamp: '2026-11-15T05:00:00.000Z' }
      ]
    }
  });

  expect(timeline.map(entry => entry.label)).toEqual([
    'Order Placed', 'Payment Confirmed', 'Rider Assigned', 'Picked Up', 'Out for Delivery'
  ]);
  expect(timeline[timeline.length - 1].isCurrent).toBe(true);
  expect(timeline[timeline.length - 1].source).toBe('delivery');
});
