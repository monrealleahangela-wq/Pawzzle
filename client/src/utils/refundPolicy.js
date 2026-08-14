export const DEFAULT_REFUND_POLICY = {
  type: 'conditional_refund',
  summary: 'Refund requests are reviewed by the store according to the order or service circumstances.',
  conditions: ''
};

export const normalizeRefundPolicy = policy => ({
  type: ['full_refund', 'conditional_refund', 'no_refund'].includes(policy?.type) ? policy.type : DEFAULT_REFUND_POLICY.type,
  summary: policy?.summary || DEFAULT_REFUND_POLICY.summary,
  conditions: policy?.conditions || ''
});

export const refundPolicyLabel = type => ({
  full_refund: 'Full Refund',
  conditional_refund: 'Conditional Refund',
  no_refund: 'No Refund'
}[type] || 'Conditional Refund');

export const requiresRefundAcknowledgment = policy => normalizeRefundPolicy(policy).type === 'no_refund';
