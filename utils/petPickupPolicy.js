const crypto = require('crypto');

const DAY = 24 * 60 * 60 * 1000;

const PET_PICKUP_POLICY = Object.freeze({
  version: '2026-10-24',
  title: 'Pet Purchase and Pickup Agreement',
  graceHours: 24,
  cancellationAfterDays: 7,
  minimumContactAttempts: 3,
  dailyCareFee: 100,
  careFeeCapDays: 7,
  noShowFeeRate: 0.10,
  noShowFeeCap: 1000,
  freeReschedules: 1,
  secondNoShowRestrictionDays: 30,
  repeatedNoShowRestrictionDays: 90,
  terms: [
    'The buyer must collect the pet on the agreed pickup date and at the agreed safe handover location.',
    'Ownership and physical custody transfer only after the seller records a successful handover.',
    'The buyer must contact the seller before the pickup schedule if a reschedule is needed. One reasonable reschedule may be approved without a rescheduling fee.',
    'A missed pickup has a 24-hour grace period. After the grace period, a care fee of PHP 100 per day may apply for up to seven days.',
    'If the buyer remains unresponsive for seven calendar days despite at least three documented contact attempts, the transaction may be cancelled and the pet may be relisted.',
    'A cancelled no-show may deduct a fee equal to 10% of the listed price, capped at PHP 1,000, plus applicable care fees, but never more than the amount already paid.',
    'Any remaining refundable balance is subject to the transaction refund policy and verified payment-provider processing.',
    'Seller-caused delays, pet illness, emergencies, or circumstances outside the buyer\'s reasonable control must be reviewed before a consequence is applied.'
  ]
});

const roundCurrency = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const publicPickupPolicy = () => ({
  ...PET_PICKUP_POLICY,
  terms: [...PET_PICKUP_POLICY.terms]
});

const policyHash = policy => crypto
  .createHash('sha256')
  .update(JSON.stringify(policy))
  .digest('hex');

const evidenceHash = value => value
  ? crypto.createHash('sha256').update(String(value)).digest('hex')
  : '';

const buildPickupAgreementSnapshot = ({ acceptedBy, acceptedAt = new Date(), ipAddress = '', userAgent = '' }) => ({
  version: PET_PICKUP_POLICY.version,
  title: PET_PICKUP_POLICY.title,
  accepted: true,
  acceptedAt,
  acceptedBy,
  termsHash: policyHash(publicPickupPolicy()),
  terms: PET_PICKUP_POLICY.terms,
  policy: {
    graceHours: PET_PICKUP_POLICY.graceHours,
    cancellationAfterDays: PET_PICKUP_POLICY.cancellationAfterDays,
    minimumContactAttempts: PET_PICKUP_POLICY.minimumContactAttempts,
    dailyCareFee: PET_PICKUP_POLICY.dailyCareFee,
    careFeeCapDays: PET_PICKUP_POLICY.careFeeCapDays,
    noShowFeeRate: PET_PICKUP_POLICY.noShowFeeRate,
    noShowFeeCap: PET_PICKUP_POLICY.noShowFeeCap,
    freeReschedules: PET_PICKUP_POLICY.freeReschedules
  },
  acceptanceEvidence: {
    ipHash: evidenceHash(String(ipAddress || '').slice(0, 100)),
    userAgentHash: evidenceHash(String(userAgent || '').slice(0, 500))
  }
});

const hasCurrentPickupAgreement = agreement => Boolean(
  agreement?.accepted
  && agreement.version === PET_PICKUP_POLICY.version
  && agreement.acceptedAt
  && agreement.acceptedBy
  && agreement.termsHash === policyHash(publicPickupPolicy())
);

const pickupTimeline = scheduledFor => {
  const scheduled = new Date(scheduledFor);
  if (Number.isNaN(scheduled.getTime())) return null;
  return {
    graceEndsAt: new Date(scheduled.getTime() + PET_PICKUP_POLICY.graceHours * 60 * 60 * 1000),
    cancellationEligibleAt: new Date(scheduled.getTime() + PET_PICKUP_POLICY.cancellationAfterDays * DAY)
  };
};

const calculateNoShowSettlement = ({
  totalPrice,
  paidAmount,
  scheduledFor,
  now = new Date(),
  refundPolicyType = 'conditional_refund'
}) => {
  const timeline = pickupTimeline(scheduledFor);
  if (!timeline) throw new Error('A valid confirmed pickup date is required.');
  const paid = Math.max(0, Number(paidAmount || 0));
  const listed = Math.max(0, Number(totalPrice || 0));
  const chargeableMs = Math.max(0, new Date(now).getTime() - timeline.graceEndsAt.getTime());
  const careFeeDays = Math.min(
    PET_PICKUP_POLICY.careFeeCapDays,
    chargeableMs > 0 ? Math.ceil(chargeableMs / DAY) : 0
  );
  const careFee = roundCurrency(careFeeDays * PET_PICKUP_POLICY.dailyCareFee);
  const noShowFee = roundCurrency(Math.min(listed * PET_PICKUP_POLICY.noShowFeeRate, PET_PICKUP_POLICY.noShowFeeCap));
  const statedDeductions = roundCurrency(noShowFee + careFee);
  const deductionTotal = refundPolicyType === 'no_refund'
    ? paid
    : roundCurrency(Math.min(paid, statedDeductions));
  const refundDue = roundCurrency(Math.max(0, paid - deductionTotal));
  return {
    careFeeDays,
    careFee,
    noShowFee,
    statedDeductions,
    deductionTotal,
    refundDue,
    refundStatus: refundDue > 0 ? 'review_required' : 'not_required',
    calculatedAt: new Date(now)
  };
};

const getNoShowRestriction = (cancelledRows = [], now = new Date()) => {
  const current = new Date(now);
  const cutoff = new Date(current.getTime() - 365 * DAY);
  const dates = cancelledRows
    .map(row => new Date(row?.pickupCompliance?.cancelledAt || row?.updatedAt || row))
    .filter(date => !Number.isNaN(date.getTime()) && date >= cutoff)
    .sort((left, right) => right - left);
  if (dates.length < 2) return { restricted: false, strikeCount: dates.length, restrictedUntil: null };
  const restrictionDays = dates.length >= 3
    ? PET_PICKUP_POLICY.repeatedNoShowRestrictionDays
    : PET_PICKUP_POLICY.secondNoShowRestrictionDays;
  const restrictedUntil = new Date(dates[0].getTime() + restrictionDays * DAY);
  return { restricted: restrictedUntil > current, strikeCount: dates.length, restrictedUntil };
};

module.exports = {
  PET_PICKUP_POLICY,
  buildPickupAgreementSnapshot,
  calculateNoShowSettlement,
  getNoShowRestriction,
  hasCurrentPickupAgreement,
  pickupTimeline,
  publicPickupPolicy
};
