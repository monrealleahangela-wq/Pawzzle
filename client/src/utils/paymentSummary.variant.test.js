import { orderLineItemRows } from './paymentSummary';

test('order rows render immutable purchased variant details', () => {
  const [row] = orderLineItemRows([{
    _id: 'order-item-1',
    itemType: 'product',
    itemId: 'product-1',
    variantId: 'variant-1',
    name: 'Premium Food',
    price: 225,
    quantity: 2,
    image: '/current-parent.jpg',
    variantSnapshot: {
      sku: 'BEEF-1KG',
      image: '/purchased-beef.jpg',
      attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'beef', valueLabel: 'Beef' }]
    },
    fulfillment: { status: 'packed' },
    returnStatus: 'requested'
  }]);
  expect(row.variantId).toBe('variant-1');
  expect(row.variantSku).toBe('BEEF-1KG');
  expect(row.variantAttributes[0].valueLabel).toBe('Beef');
  expect(row.image).toBe('/purchased-beef.jpg');
  expect(row.fulfillment.status).toBe('packed');
  expect(row.returnStatus).toBe('requested');
  expect(row.lineTotal).toBe(450);
});
