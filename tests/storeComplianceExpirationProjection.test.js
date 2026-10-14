'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../models/Store');
const { processStoreComplianceExpirations } = require('../services/storeComplianceService');

test('compliance expiration sweep avoids selecting a private document URL it never uses', async () => {
  const originalFind = Store.find;
  let projection;
  Store.find = () => ({
    select(value) {
      projection = value;
      return Promise.resolve([]);
    }
  });

  try {
    const result = await processStoreComplianceExpirations();
    assert.deepEqual(result, { storesChecked: 0, notificationsCreated: 0 });
    assert.match(projection, /businessCompliance/);
    assert.doesNotMatch(projection, /documentUrl/);
  } finally {
    Store.find = originalFind;
  }
});
