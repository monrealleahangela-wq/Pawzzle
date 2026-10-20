const test = require('node:test');
const assert = require('node:assert/strict');

const Store = require('../models/Store');
const { submitVerification } = require('../controllers/storeController');

test('verified stores cannot be returned to pending by resubmitting identity documents', async () => {
  const originalFindOne = Store.findOne;
  let saveCalled = false;
  Store.findOne = async () => ({
    verificationStatus: 'verified',
    verification: {},
    save: async () => { saveCalled = true; }
  });

  let responseStatus = 200;
  let responseBody;
  const response = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    }
  };

  try {
    await submitVerification(
      { user: { id: 'verified-owner' }, body: { idImage: '/new-id.jpg' } },
      response
    );

    assert.equal(responseStatus, 409);
    assert.match(responseBody.message, /already verified/i);
    assert.equal(saveCalled, false);
  } finally {
    Store.findOne = originalFindOne;
  }
});
