const POLICY_TYPES = ['full_refund', 'conditional_refund', 'no_refund'];

const DEFAULT_POLICY = Object.freeze({
  type: 'conditional_refund',
  summary: 'Refund requests are reviewed by the store according to the order or service circumstances.',
  conditions: ''
});

const normalizeRefundPolicy = policy => {
  const type = POLICY_TYPES.includes(policy?.type) ? policy.type : DEFAULT_POLICY.type;
  const summary = String(policy?.summary || DEFAULT_POLICY.summary).trim().slice(0, 1000);
  const conditions = String(policy?.conditions || '').trim().slice(0, 3000);
  return { type, summary, conditions };
};

const snapshotRefundPolicy = (policy, now = new Date()) => ({
  ...normalizeRefundPolicy(policy),
  capturedAt: now
});

const requiresAcknowledgment = policy => normalizeRefundPolicy(policy).type === 'no_refund';

const policyLabel = type => ({
  full_refund: 'Full Refund',
  conditional_refund: 'Conditional Refund',
  no_refund: 'No Refund'
}[type] || 'Conditional Refund');

module.exports = {
  POLICY_TYPES,
  DEFAULT_POLICY,
  normalizeRefundPolicy,
  snapshotRefundPolicy,
  requiresAcknowledgment,
  policyLabel
};
