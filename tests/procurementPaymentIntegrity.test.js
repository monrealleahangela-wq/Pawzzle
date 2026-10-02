const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('procurement PayMongo reconciliation uses one transaction and excludes additional payments from paid totals', () => {
  const reconciliation = read('services/paymentReconciliationService.js');
  const model = read('models/ProcurementPayment.js');
  const finalize = reconciliation.match(/const finalizeProcurement[\s\S]*?const paymentMatches/)?.[0] || '';

  assert.match(finalize, /mongoose\.connection\.transaction\(async session/);
  assert.match(finalize, /PurchaseOrder\.findById\(purchaseOrder\._id\)\.session\(session\)/);
  assert.match(finalize, /ProcurementPayment\.findOne\(\{ providerPaymentId: payment\.id \}\)\.session\(session\)/);
  assert.match(finalize, /status: 'duplicate'/);
  assert.match(finalize, /await current\.save\(\{ session \}\)/);
  assert.match(model, /status:[\s\S]*'recorded', 'authorized', 'duplicate', 'void'/);
});

test('failed PayMongo events use guarded atomic transitions that cannot downgrade paid records', () => {
  const reconciliation = read('services/paymentReconciliationService.js');
  const failure = reconciliation.match(/const markSessionFailed[\s\S]*?module\.exports/)?.[0] || '';

  assert.match(failure, /findOneAndUpdate/);
  assert.match(failure, /paymentStatus: \{ \$nin: \['paid', 'settled', 'failed'\] \}/);
  assert.match(failure, /'paymentDetails\.paymentId': \{ \$exists: false \}/);
  assert.doesNotMatch(failure, /findByIdAndUpdate/);
});

test('manual procurement payments use an explicit allowlist and transactional void synchronization', () => {
  const finance = read('controllers/financeController.js');
  const create = finance.match(/const createProcurementPayment[\s\S]*?const voidProcurementPayment/)?.[0] || '';
  const voidPayment = finance.match(/const voidProcurementPayment[\s\S]*?const listProcurementAdjustments/)?.[0] || '';

  assert.match(finance, /MANUAL_PROCUREMENT_PAYMENT_METHODS/);
  assert.doesNotMatch(create, /ProcurementPayment\.create\(\[?\{\s*\.\.\.req\.body/);
  assert.match(create, /provider: 'manual'/);
  assert.match(create, /status: 'recorded'/);
  assert.match(create, /recordedBy: req\.user\._id/);
  assert.match(voidPayment, /mongoose\.connection\.transaction\(async session/);
  assert.match(voidPayment, /payment\.provider === 'paymongo'/);
  assert.match(voidPayment, /await payment\.save\(\{ session \}\)/);
  assert.match(voidPayment, /syncPurchaseOrderPayment\(payment\.purchaseOrder, session\)/);
});
