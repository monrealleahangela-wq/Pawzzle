const normalizeText = (value, maxLength = 255) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, maxLength);

const normalizePayMongoPhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  return '';
};

const normalizeEmail = value => {
  const email = normalizeText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const buildPayMongoBilling = (customer, overrides = {}) => {
  const fullName = normalizeText([customer?.firstName, customer?.lastName].filter(Boolean).join(' '));
  const name = fullName || normalizeText(customer?.username);
  const email = normalizeEmail(customer?.email);
  const phone = normalizePayMongoPhone(overrides.phone || customer?.phone);

  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {})
  };
};

module.exports = {
  buildPayMongoBilling,
  normalizePayMongoPhone
};
