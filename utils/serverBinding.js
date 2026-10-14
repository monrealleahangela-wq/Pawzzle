'use strict';

const resolveServerHost = ({
  host = process.env.HOST,
  nodeEnv = process.env.NODE_ENV,
  render = process.env.RENDER
} = {}) => {
  if (host) return host;
  const isHostedProduction = String(nodeEnv || '').toLowerCase() === 'production'
    || String(render || '').toLowerCase() === 'true';
  return isHostedProduction ? '0.0.0.0' : '127.0.0.1';
};

module.exports = { resolveServerHost };
