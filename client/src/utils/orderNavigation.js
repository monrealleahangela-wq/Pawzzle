export const orderListPathForDetail = pathname => (
  /^\/admin\/orders(?:\/|$)/.test(String(pathname || ''))
    ? '/admin/orders'
    : '/orders'
);
