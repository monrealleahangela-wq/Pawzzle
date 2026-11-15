const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('order detail renders the authoritative delivery badge and persisted timeline', () => {
  const detail = read('client/src/pages/customer/OrderDetail.js');
  const statusUtility = read('client/src/utils/orderDeliveryStatus.js');
  const orderController = read('controllers/orderController.js');

  assert.match(detail, /getOrderDeliveryStatus\(order\)/);
  assert.match(detail, /buildOrderDeliveryTimeline\(order\)/);
  assert.match(detail, /data-testid="delivery-status-badge"/);
  assert.match(detail, /data-testid="order-delivery-timeline"/);
  assert.doesNotMatch(detail, /assignmentType === 'internal' \? 'Rider Assigned' : 'Awaiting Rider'/);
  assert.match(statusUtility, /order\.delivery\?\.statusHistory/);
  assert.match(statusUtility, /TERMINAL_ORDER_STATUSES/);
  assert.match(orderController, /getOrderById[\s\S]*\.populate\('delivery'\)/);
});
