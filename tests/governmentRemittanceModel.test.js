const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const GovernmentRemittance = require('../models/GovernmentRemittance');
const { deterministicRemittanceId } = require('../utils/governmentRemittance');

const id = () => new mongoose.Types.ObjectId();

test('government remittance keeps employee and employer amounts separate', async () => {
  const remittance = new GovernmentRemittance({
    store: id(),
    payrollPeriod: id(),
    agency: 'PhilHealth',
    contributionMonth: '2026-10',
    employeeAmount: 750,
    employerAmount: 750,
    totalAmount: 1500,
    preparedBy: id(),
    history: [{ status: 'pending', actor: id(), note: 'Prepared from approved payroll.' }]
  });

  await remittance.validate();
  assert.equal(remittance.status, 'pending');
  assert.equal(remittance.employeeAmount, 750);
  assert.equal(remittance.employerAmount, 750);
  assert.equal(remittance.totalAmount, 1500);
});

test('government remittance rejects unsupported payment statuses', async () => {
  const remittance = new GovernmentRemittance({
    store: id(), payrollPeriod: id(), agency: 'SSS', contributionMonth: '2026-10',
    employeeAmount: 1, employerAmount: 2, totalAmount: 3,
    preparedBy: id(), status: 'completed'
  });
  await assert.rejects(() => remittance.validate(), /not a valid enum value/);
});

test('government remittance uses a deterministic built-in unique id without a production index migration', () => {
  const store = id();
  const payrollPeriod = id();
  const first = deterministicRemittanceId({ store, payrollPeriod, agency: 'SSS' });
  const replay = deterministicRemittanceId({ store, payrollPeriod, agency: 'SSS' });
  const differentAgency = deterministicRemittanceId({ store, payrollPeriod, agency: 'BIR' });
  assert.equal(String(first), String(replay));
  assert.notEqual(String(first), String(differentAgency));
  assert.equal(GovernmentRemittance.schema.indexes().length, 0);
});
