const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildPayMongoBilling, normalizePayMongoPhone } = require('../utils/paymongoBilling');

test('PayMongo billing uses the authoritative Pawzzle customer profile', () => {
  assert.deepEqual(buildPayMongoBilling({
    firstName: '  Eugene  Sarabi ',
    lastName: ' Pabello ',
    email: ' EUGENE@EXAMPLE.COM ',
    phone: '0917 123 4567'
  }), {
    name: 'Eugene Sarabi Pabello',
    email: 'eugene@example.com',
    phone: '+639171234567'
  });
});

test('PayMongo billing falls back safely and omits invalid optional values', () => {
  assert.deepEqual(buildPayMongoBilling({
    username: 'pawzzle-customer',
    email: 'not-an-email',
    phone: '123'
  }), { name: 'pawzzle-customer' });
});

test('the phone confirmed for an order takes priority over an older profile phone', () => {
  assert.equal(buildPayMongoBilling({
    firstName: 'Leah',
    email: 'leah@example.com',
    phone: '09170000000'
  }, { phone: '0998 765 4321' }).phone, '+639987654321');
});

test('Philippine mobile numbers normalize to PayMongo international format', () => {
  assert.equal(normalizePayMongoPhone('9171234567'), '+639171234567');
  assert.equal(normalizePayMongoPhone('63 917 123 4567'), '+639171234567');
  assert.equal(normalizePayMongoPhone('+63 917 123 4567'), '+639171234567');
});

test('all customer-facing PayMongo checkout types include server-built billing', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'paymentController.js'), 'utf8');
  assert.match(source, /billing: buildPayMongoBilling\(order\.customer, \{ phone: order\.phoneNumber \}\)/);
  assert.match(source, /billing: buildPayMongoBilling\(firstOrder\.customer, \{ phone: firstOrder\.phoneNumber \}\)/);
  assert.match(source, /billing: buildPayMongoBilling\(booking\.customer\)/);
  assert.match(source, /billing: buildPayMongoBilling\(adoption\.customer\)/);
});
