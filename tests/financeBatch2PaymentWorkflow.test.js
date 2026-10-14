const assert = require('node:assert/strict');
const test = require('node:test');
const { hasPermission, getEffectivePermissions } = require('../config/permissions');
const { defaultPolicyForRole } = require('../services/rolePermissionService');
const PayrollPaymentAttempt = require('../models/PayrollPaymentAttempt');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const { payPeriod } = require('../controllers/hrController');
const security = require('../utils/payrollPaymentSecurity');
const { requirePermission } = require('../middleware/auth');

const oldEncryptionKey = process.env.PAYROLL_DATA_ENCRYPTION_KEY;
test.after(() => {
  if (oldEncryptionKey === undefined) delete process.env.PAYROLL_DATA_ENCRYPTION_KEY;
  else process.env.PAYROLL_DATA_ENCRYPTION_KEY = oldEncryptionKey;
});

test('Finance payment permissions default to review/prepare only; Owner/Admin can independently confirm', () => {
  const finance = { role: 'staff', staffType: 'finance_staff', store: 'store-a' };
  assert.equal(hasPermission(finance, 'payroll_payment.view'), true);
  assert.equal(hasPermission(finance, 'payroll_payment.prepare'), true);
  assert.equal(hasPermission(finance, 'payroll_payment.confirm'), false);
  assert.equal(defaultPolicyForRole('finance_staff').payroll_payment.confirm, undefined);
  assert.equal(defaultPolicyForRole('admin').payroll_payment.confirm, true);
  assert.equal(hasPermission({ role: 'store_owner' }, 'payroll_payment.confirm'), true);
  assert.equal(hasPermission({ role: 'admin' }, 'payroll_payment.confirm'), true);
  const delegated = { ...finance, $locals: { rolePolicyPermissions: { payroll_payment: { confirm: true } } } };
  assert.equal(hasPermission(delegated, 'payroll_payment.confirm'), true);
  assert.equal(getEffectivePermissions({ role: 'customer', permissions: { payroll_payment: { confirm: true } } }).includes('payroll_payment.confirm'), false);
});

test('new Store-role catalog exposes payment confirmation as a separately delegable permission', () => {
  const financeDefaults = defaultPolicyForRole('finance_staff').payroll_payment;
  assert.deepEqual(financeDefaults, { view: true, prepare: true });
  assert.equal(PayrollPaymentAttempt.schema.path('encryptedTransferReference').options.select, false);
  assert.equal(PayrollPaymentAttempt.schema.path('encryptedDestination').options.select, false);
  assert.equal(PayrollPaymentAttempt.schema.path('proof.encryptedContent').options.select, false);
});

test('the confirmation endpoint authorization rejects Finance until Store policy delegates the exact action', () => {
  const middleware = requirePermission('payroll_payment.confirm');
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  middleware({ user: { _id: 'finance-1', role: 'staff', staffType: 'finance_staff' } }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
  middleware({ user: { _id: 'finance-1', role: 'staff', staffType: 'finance_staff', $locals: { rolePolicyPermissions: { payroll_payment: { confirm: true } } } } }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('payment reference and protected evidence encrypt at rest and reject missing key configuration', () => {
  process.env.PAYROLL_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('hex');
  const original = { account: '1234567890', base64: Buffer.from('%PDF-test').toString('base64') };
  const encoded = security.encryptSensitive(original);
  assert.equal(encoded.includes(original.account), false);
  assert.deepEqual(security.decryptSensitive(encoded), original);
  assert.equal(security.sensitiveFingerprint('REF-1234'), security.sensitiveFingerprint('REF-1234'));
  delete process.env.PAYROLL_DATA_ENCRYPTION_KEY;
  assert.throws(() => security.encryptSensitive(original), error => error.statusCode === 503 && error.code === 'PAYROLL_ENCRYPTION_NOT_CONFIGURED');
});

test('payment states distinguish transfer initiation from independent confirmation and legacy Paid state', () => {
  assert.deepEqual(PayrollPaymentAttempt.schema.path('status').enumValues, ['pending', 'processing', 'for_confirmation', 'paid', 'failed', 'on_hold']);
  assert.ok(Payslip.schema.path('paymentStatus').enumValues.includes('processing'));
  assert.ok(Payslip.schema.path('paymentStatus').enumValues.includes('for_confirmation'));
  assert.ok(Payslip.schema.path('paymentStatus').enumValues.includes('recorded_paid'));
  assert.ok(PayrollPeriod.schema.path('paymentSummary.confirmedEmployeeCount'));
  assert.ok(PayrollPaymentAttempt.schema.indexes().some(([keys, options]) => keys.activeKey === 1 && options.unique));
});

test('deprecated period-wide Paid endpoint now refuses ambiguous batch confirmation', async () => {
  const result = { res: { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } } };
  await payPeriod({ params: { id: 'period-a' } }, result.res);
  assert.equal(result.status, 409);
  assert.match(result.body.message, /each employee payment separately/i);
});
