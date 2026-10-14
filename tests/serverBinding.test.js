'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveServerHost } = require('../utils/serverBinding');

test('development binds loopback by default', () => {
  assert.equal(resolveServerHost({ nodeEnv: 'development', host: undefined }), '127.0.0.1');
  assert.equal(resolveServerHost({ nodeEnv: 'test', host: undefined }), '127.0.0.1');
});

test('production keeps Render-compatible public interface binding by default', () => {
  assert.equal(resolveServerHost({ nodeEnv: 'production', host: undefined }), '0.0.0.0');
  assert.equal(resolveServerHost({ nodeEnv: 'development', host: undefined, render: 'true' }), '0.0.0.0');
});

test('an explicit host configuration is respected in every environment', () => {
  assert.equal(resolveServerHost({ nodeEnv: 'production', host: '127.0.0.1' }), '127.0.0.1');
});
