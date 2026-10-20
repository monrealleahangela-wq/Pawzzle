const test = require('node:test');
const assert = require('node:assert/strict');

const { subtractPurchasedItems } = require('../services/checkoutCartService');

const cartItem = (itemId, quantity, selected = true) => ({
  itemType: 'product', itemId, quantity, selected, name: itemId
});

test('successful checkout removes only purchased Store items and preserves unselected items', () => {
  const cart = [
    cartItem('store-a-product', 2),
    cartItem('store-b-product', 1),
    cartItem('saved-for-later', 4, false)
  ];
  const orders = [
    { store: 'store-a', items: [cartItem('store-a-product', 2)] },
    { store: 'store-b', items: [cartItem('store-b-product', 1)] }
  ];

  const remaining = subtractPurchasedItems(cart, orders);

  assert.deepEqual(remaining.map(item => item.itemId), ['saved-for-later']);
  assert.equal(remaining[0].quantity, 4);
  assert.equal(remaining[0].selected, false);
});

test('cart quantities added after checkout are preserved', () => {
  const cart = [cartItem('product-1', 5), cartItem('product-2', 1)];
  const orders = [{ items: [cartItem('product-1', 2)] }];

  const remaining = subtractPurchasedItems(cart, orders);

  assert.equal(remaining.find(item => item.itemId === 'product-1').quantity, 3);
  assert.equal(remaining.find(item => item.itemId === 'product-2').quantity, 1);
});
