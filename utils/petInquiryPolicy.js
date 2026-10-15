const ACTIVE = [
  'submitted', 'awaiting_seller_response', 'seller_responded',
  'additional_information_required'
];

const ACTIONS = {
  seller_reply: { actor: 'seller', from: ACTIVE, to: 'seller_responded', body: true },
  information_requested: { actor: 'seller', from: ACTIVE, to: 'additional_information_required', body: true },
  customer_follow_up: { actor: 'customer', from: ACTIVE, to: 'awaiting_seller_response', body: true },
  resolved: { actor: 'seller', from: ACTIVE, to: 'resolved', body: false },
  cancelled: { actor: 'customer', from: ACTIVE, to: 'cancelled', body: false }
};

const cleanText = (value, min, max, label) => {
  if (typeof value !== 'string') throw Object.assign(new Error(`${label} is required.`), { statusCode: 400 });
  const text = value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/<[^>]*>/g, '').trim();
  if (text.length < min || text.length > max) {
    throw Object.assign(new Error(`${label} must be ${min}–${max} characters.`), { statusCode: 400 });
  }
  return text;
};

const validateRequestKey = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) {
    throw Object.assign(new Error('A valid request key is required.'), { statusCode: 400 });
  }
  return value;
};

const validateAction = (action, actor, status) => {
  const rule = ACTIONS[action];
  if (!rule || rule.actor !== actor) throw Object.assign(new Error('This inquiry action is not permitted.'), { statusCode: 403 });
  if (!rule.from.includes(status)) throw Object.assign(new Error('This inquiry is no longer open for that action.'), { statusCode: 409 });
  return rule;
};

module.exports = { ACTIVE, ACTIONS, cleanText, validateRequestKey, validateAction };
