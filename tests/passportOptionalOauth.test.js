'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

const oauthEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
const clearOAuthModules = () => {
  for (const path of ['../routes/auth', '../config/passport']) {
    try { delete require.cache[require.resolve(path)]; } catch { /* module not loaded */ }
  }
};

const withOAuthEnv = async (values, run) => {
  const previous = Object.fromEntries(oauthEnv.map(key => [key, process.env[key]]));
  try {
    for (const key of oauthEnv) {
      if (values[key]) process.env[key] = values[key];
      else delete process.env[key];
    }
    clearOAuthModules();
    await run();
  } finally {
    clearOAuthModules();
    for (const key of oauthEnv) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
};

test('missing optional Google OAuth credentials do not prevent auth module initialization', async () => {
  for (const values of [{}, { GOOGLE_CLIENT_ID: 'local-test-client' }, { GOOGLE_CLIENT_SECRET: 'local-test-secret' }]) {
    await withOAuthEnv(values, async () => {
      const passport = require('../config/passport');
      assert.equal(typeof passport.initialize, 'function');
      assert.equal(passport._strategies.google, undefined);
    });
  }
});

test('Google OAuth endpoints fail clearly when credentials are absent', async () => {
  await withOAuthEnv({}, async () => {
    const app = express();
    app.use('/auth', require('../routes/auth'));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      for (const path of ['/auth/google', '/auth/google/callback']) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
        assert.equal(response.status, 503);
        assert.match((await response.json()).message, /not configured/i);
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

test('configured Google OAuth registers its strategy and preserves the authorization redirect', async () => {
  await withOAuthEnv({ GOOGLE_CLIENT_ID: 'local-test-client', GOOGLE_CLIENT_SECRET: 'local-test-secret' }, async () => {
    const passport = require('../config/passport');
    assert.ok(passport._strategies.google);
    const app = express();
    app.use('/auth', require('../routes/auth'));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/google`, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.match(response.headers.get('location'), /^https:\/\/accounts\.google\.com\//);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
