import { orderListPathForDetail } from './orderNavigation';

describe('orderListPathForDetail', () => {
  test('returns the customer order list for customer order details', () => {
    expect(orderListPathForDetail('/orders/64b00d4736642b47a6cc010b')).toBe('/orders');
  });

  test('returns the seller order list for admin order details', () => {
    expect(orderListPathForDetail('/admin/orders/64b00d4736642b47a6cc010b')).toBe('/admin/orders');
  });

  test('does not treat similarly named customer paths as admin order details', () => {
    expect(orderListPathForDetail('/admin/orders-history/64b00d4736642b47a6cc010b')).toBe('/orders');
  });
});
