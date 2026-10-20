const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('multi-Store checkout creates isolated Store orders under one payment batch', () => {
  const pricing = read('services/orderPricingService.js');
  const orders = read('controllers/orderController.js');
  const batchModel = read('models/OrderCheckoutBatch.js');

  assert.match(pricing, /const calculateCheckoutPricing = async/);
  assert.match(pricing, /groupedItems = new Map\(\)/);
  assert.match(pricing, /calculateOrderPricing\(\{/);
  assert.match(orders, /for \(let index = 0; index < pricedOrders\.length/);
  assert.match(orders, /OrderCheckoutBatch\.create\(/);
  assert.match(orders, /checkoutBatch: checkoutBatch\._id/);
  assert.match(batchModel, /orders: \[\{ type: mongoose\.Schema\.Types\.ObjectId, ref: 'Order'/);
});

test('one PayMongo session reconciles the batch into every Store order', () => {
  const paymentController = read('controllers/paymentController.js');
  const reconciliation = read('services/paymentReconciliationService.js');
  const paymentRoutes = read('routes/payment.js');
  const checkout = read('client/src/pages/customer/Checkout.js');

  assert.match(paymentRoutes, /create-order-batch-checkout-session\/:batchId/);
  assert.match(paymentController, /type: 'order_batch'/);
  assert.match(paymentController, /line_items: batch\.orders\.map/);
  assert.match(reconciliation, /const finalizeOrderBatch = async/);
  assert.match(reconciliation, /for \(const order of orders\)/);
  assert.match(reconciliation, /await finalizeOrder\(order/);
  assert.match(checkout, /createOrderBatchCheckoutSession\(response\.data\.checkoutBatch\._id\)/);
});
