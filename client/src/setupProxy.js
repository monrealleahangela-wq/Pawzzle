const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(createProxyMiddleware({
    pathFilter: pathname => pathname.startsWith('/api/') || pathname === '/api'
      || pathname.startsWith('/uploads/') || pathname === '/uploads',
    target: process.env.PAWZZLE_DEV_PROXY_TARGET || 'http://127.0.0.1:5000',
    changeOrigin: true,
    secure: false
  }));
};
