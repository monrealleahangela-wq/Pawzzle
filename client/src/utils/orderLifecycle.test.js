import { getEffectiveOrderStatus, normalizeOrderStatus } from './orderLifecycle';

describe('seller order lifecycle presentation', () => {
  test('normalizes supported legacy status representations', () => {
    expect(normalizeOrderStatus('processing')).toBe('preparing');
    expect(normalizeOrderStatus('shipped')).toBe('in_transit');
    expect(normalizeOrderStatus('finalized')).toBe('completed');
  });

  test('uses the linked Delivery when it proves the order is past packing', () => {
    expect(getEffectiveOrderStatus({ status: 'confirmed', delivery: { status: 'delivered' } })).toBe('delivered');
    expect(getEffectiveOrderStatus({ status: 'preparing', delivery: { status: 'in_transit' } })).toBe('in_transit');
  });

  test('keeps terminal order states terminal', () => {
    expect(getEffectiveOrderStatus({ status: 'completed' })).toBe('completed');
    expect(getEffectiveOrderStatus({ status: 'cancelled' })).toBe('cancelled');
  });
});
