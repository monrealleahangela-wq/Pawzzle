const { decryptSensitive, encryptSensitive, maskAccountNumber, maskReference } = require('./payrollPaymentSecurity');

const fail = message => Object.assign(new Error(message), { statusCode: 400 });
const clean = (value, max = 160) => String(value || '').trim().slice(0, max);
const identifier = (value, label) => {
  const normalized = clean(value, 40).replace(/[\s-]/g, '');
  if (!normalized) return '';
  if (!/^[A-Za-z0-9]{6,24}$/.test(normalized)) throw fail(`${label} must contain 6 to 24 letters or digits.`);
  return normalized;
};

const mergeProtectedPayrollProfile = ({ input = {}, encrypted, actorId }) => {
  let prior = {};
  if (encrypted) prior = decryptSensitive(encrypted);
  const ids = input.statutoryIdentifiers || {};
  const destination = input.payrollDestination || {};
  const next = {
    statutoryIdentifiers: {
      sss: ids.sss === undefined || ids.sss === '' ? prior.statutoryIdentifiers?.sss || '' : identifier(ids.sss, 'SSS number'),
      philHealth: ids.philHealth === undefined || ids.philHealth === '' ? prior.statutoryIdentifiers?.philHealth || '' : identifier(ids.philHealth, 'PhilHealth number'),
      pagIbig: ids.pagIbig === undefined || ids.pagIbig === '' ? prior.statutoryIdentifiers?.pagIbig || '' : identifier(ids.pagIbig, 'Pag-IBIG number'),
      tin: ids.tin === undefined || ids.tin === '' ? prior.statutoryIdentifiers?.tin || '' : identifier(ids.tin, 'TIN')
    },
    payrollDestination: {
      type: clean(destination.type === undefined ? prior.payrollDestination?.type : destination.type, 30),
      bankName: clean(destination.bankName === undefined ? prior.payrollDestination?.bankName : destination.bankName, 120),
      accountName: clean(destination.accountName === undefined ? prior.payrollDestination?.accountName : destination.accountName, 160),
      accountNumber: destination.accountNumber === undefined || destination.accountNumber === ''
        ? prior.payrollDestination?.accountNumber || ''
        : identifier(destination.accountNumber, 'Payroll account number')
    },
    updatedBy: String(actorId || ''),
    updatedAt: new Date().toISOString()
  };
  if (!['', 'bank_transfer', 'gcash', 'maya', 'cash'].includes(next.payrollDestination.type)) throw fail('Select a supported salary payment method.');
  if (next.payrollDestination.type && next.payrollDestination.type !== 'cash' && !next.payrollDestination.accountNumber) throw fail('An account number is required for electronic salary payments.');
  return {
    encrypted: encryptSensitive(next),
    statutoryIdentifiers: {
      sssMask: maskReference(next.statutoryIdentifiers.sss),
      philHealthMask: maskReference(next.statutoryIdentifiers.philHealth),
      pagIbigMask: maskReference(next.statutoryIdentifiers.pagIbig),
      tinMask: maskReference(next.statutoryIdentifiers.tin)
    },
    payrollDestination: {
      type: next.payrollDestination.type,
      bankName: next.payrollDestination.bankName,
      accountName: next.payrollDestination.accountName,
      accountMask: maskAccountNumber(next.payrollDestination.accountNumber)
    }
  };
};

const hasProtectedPayrollInput = input => {
  const ids = input?.statutoryIdentifiers || {};
  const destination = input?.payrollDestination || {};
  return ['sss', 'philHealth', 'pagIbig', 'tin'].some(key => String(ids[key] || '').trim())
    || ['type', 'bankName', 'accountName', 'accountNumber'].some(key => String(destination[key] || '').trim());
};

module.exports = { hasProtectedPayrollInput, mergeProtectedPayrollProfile };
