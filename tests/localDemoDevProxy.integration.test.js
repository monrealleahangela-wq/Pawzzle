'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

test('CRA development proxy preserves the /api prefix when forwarding', async () => {
  const backend = express();
  backend.get('/api/health', (_req, res) => res.json({ status: 'OK' }));
  const backendServer = backend.listen(0, '127.0.0.1');
  await once(backendServer, 'listening');

  const previousTarget = process.env.PAWZZLE_DEV_PROXY_TARGET;
  process.env.PAWZZLE_DEV_PROXY_TARGET = `http://127.0.0.1:${backendServer.address().port}`;
  const setupProxyPath = require.resolve('../client/src/setupProxy');
  delete require.cache[setupProxyPath];

  const frontend = express();
  require(setupProxyPath)(frontend);
  const frontendServer = frontend.listen(0, '127.0.0.1');
  await once(frontendServer, 'listening');

  try {
    const response = await fetch(`http://127.0.0.1:${frontendServer.address().port}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'OK' });
  } finally {
    await Promise.all([
      new Promise(resolve => frontendServer.close(resolve)),
      new Promise(resolve => backendServer.close(resolve))
    ]);
    if (previousTarget === undefined) delete process.env.PAWZZLE_DEV_PROXY_TARGET;
    else process.env.PAWZZLE_DEV_PROXY_TARGET = previousTarget;
    delete require.cache[setupProxyPath];
  }
});
