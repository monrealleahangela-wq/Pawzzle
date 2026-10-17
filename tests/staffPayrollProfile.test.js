const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.PAYROLL_DATA_ENCRYPTION_KEY = crypto.createHash('sha256').update('pawzzle-test-only-payroll-key').digest('hex');
const { decryptSensitive } = require('../utils/payrollPaymentSecurity');
const { hasProtectedPayrollInput, mergeProtectedPayrollProfile } = require('../utils/staffPayrollProfile');

test('statutory identifiers and salary destination are encrypted and only masks are exposed', () => {
  const result = mergeProtectedPayrollProfile({
    input: {
      statutoryIdentifiers: { sss: '12-3456789-0', philHealth: '12-345678901-2', pagIbig: '1234-5678-9012' },
      payrollDestination: { type: 'bank_transfer', bankName: 'Test Bank', accountName: 'Test Employee', accountNumber: '123456789012' }
    },
    actorId: '507f1f77bcf86cd799439011'
  });
  assert.ok(result.encrypted.startsWith('v1:'));
  assert.ok(result.statutoryIdentifiers.sssMask.endsWith('7890'));
  assert.ok(result.payrollDestination.accountMask.endsWith('9012'));
  assert.equal(JSON.stringify(result).includes('123456789012'), false);
  assert.equal(decryptSensitive(result.encrypted).payrollDestination.accountNumber, '123456789012');
});

test('blank edit values preserve protected identifiers and account number', () => {
  const original = mergeProtectedPayrollProfile({ input: { statutoryIdentifiers: { sss: '1234567890' }, payrollDestination: { type: 'gcash', accountNumber: '09171234567' } } });
  const edited = mergeProtectedPayrollProfile({ input: { payrollDestination: { bankName: 'Mobile Wallet' } }, encrypted: original.encrypted });
  const clear = decryptSensitive(edited.encrypted);
  assert.equal(clear.statutoryIdentifiers.sss, '1234567890');
  assert.equal(clear.payrollDestination.accountNumber, '09171234567');
  assert.equal(clear.payrollDestination.bankName, 'Mobile Wallet');
  assert.equal(hasProtectedPayrollInput({ statutoryIdentifiers: {}, payrollDestination: {} }), false);
});

test('invalid identifiers and electronic destinations without account numbers are rejected', () => {
  assert.throws(() => mergeProtectedPayrollProfile({ input: { statutoryIdentifiers: { sss: '12' } } }), /6 to 24/);
  assert.throws(() => mergeProtectedPayrollProfile({ input: { payrollDestination: { type: 'bank_transfer' } } }), /account number/);
});
