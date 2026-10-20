const ACTIVE_EMPLOYMENT_STATUSES = new Set(['active', 'probationary', 'part_time', 'contract']);
const COMPENSATION_BASES = new Set(['monthly', 'daily', 'hourly', 'legacy_period']);

const startOfDay = value => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const endOfDay = value => new Date(startOfDay(value).getTime() + 86399999);
const previousDayEnd = value => new Date(startOfDay(value).getTime() - 1);

const plain = value => value?.toObject ? value.toObject() : { ...(value || {}) };

const compensationBasis = compensation => {
  if (COMPENSATION_BASES.has(compensation?.compensationBasis)) return compensation.compensationBasis;
  if (compensation?.compensationType === 'daily') return 'daily';
  if (compensation?.compensationType === 'hourly') return 'hourly';
  if (compensation?.compensationType === 'salary') return 'legacy_period';
  return null;
};

const compensationTypeForBasis = basis => ['daily', 'hourly'].includes(basis) ? basis : 'salary';

const normalizeCompensation = (value, fallbackEffectiveDate) => {
  if (!value) return null;
  const source = plain(value);
  const basis = compensationBasis(source);
  const baseRate = Number(source.baseRate);
  const effectiveDate = source.effectiveDate || fallbackEffectiveDate;
  if (!basis || !Number.isFinite(baseRate) || baseRate <= 0 || !effectiveDate) return null;
  return {
    ...source,
    compensationType: compensationTypeForBasis(basis),
    compensationBasis: basis,
    baseRate,
    effectiveDate: startOfDay(effectiveDate)
  };
};

const compensationRevisions = profile => {
  const fallback = profile?.dateHired || new Date('1970-01-01T00:00:00.000Z');
  const revisions = [
    ...(profile?.compensationHistory || []).map(item => normalizeCompensation(item, fallback)),
    normalizeCompensation(profile?.compensation, fallback)
  ].filter(Boolean);
  revisions.sort((left, right) => {
    const effective = left.effectiveDate - right.effectiveDate;
    if (effective) return effective;
    return new Date(left.recordedAt || 0) - new Date(right.recordedAt || 0);
  });
  const byDate = new Map();
  revisions.forEach(item => byDate.set(item.effectiveDate.toISOString().slice(0, 10), item));
  return [...byDate.values()].sort((left, right) => left.effectiveDate - right.effectiveDate);
};

const employmentRanges = (profile, periodStart, periodEnd) => {
  const start = startOfDay(periodStart);
  const end = endOfDay(periodEnd);
  const history = (profile?.employmentHistory || []).map(plain);
  const currentStatus = profile?.employmentStatus;
  const currentStart = profile?.dateHired || start;
  const currentEnd = profile?.employmentEndDate;
  if ((!currentStatus || ACTIVE_EMPLOYMENT_STATUSES.has(currentStatus)) || currentEnd) {
    history.push({
      employmentStatus: ACTIVE_EMPLOYMENT_STATUSES.has(currentStatus) || !currentStatus ? (currentStatus || 'active') : 'active',
      startDate: currentStart,
      endDate: currentEnd,
      recordedAt: new Date('9999-12-31T00:00:00.000Z')
    });
  }
  const normalized = history
    .filter(item => ACTIVE_EMPLOYMENT_STATUSES.has(item.employmentStatus || 'active'))
    .map(item => ({
      start: new Date(Math.max(start.getTime(), startOfDay(item.startDate || start).getTime())),
      end: new Date(Math.min(end.getTime(), endOfDay(item.endDate || end).getTime()))
    }))
    .filter(item => item.start <= item.end)
    .sort((left, right) => left.start - right.start);
  const merged = [];
  for (const range of normalized) {
    const prior = merged[merged.length - 1];
    if (prior && range.start.getTime() <= prior.end.getTime() + 1) {
      if (range.end > prior.end) prior.end = range.end;
    } else merged.push(range);
  }
  return merged;
};

const compensationSegmentsForPeriod = (profile, periodStart, periodEnd) => {
  const revisions = compensationRevisions(profile);
  const ranges = employmentRanges(profile, periodStart, periodEnd);
  const segments = [];
  let coverageGap = false;
  for (const range of ranges) {
    const relevant = revisions.filter(item => item.effectiveDate <= range.end);
    const activeAtStart = relevant.filter(item => item.effectiveDate <= range.start).at(-1);
    const boundaries = [
      ...(activeAtStart ? [{ date: range.start, revision: activeAtStart }] : []),
      ...relevant.filter(item => item.effectiveDate > range.start).map(item => ({ date: item.effectiveDate, revision: item }))
    ];
    if (!activeAtStart && (!boundaries.length || boundaries[0].date > range.start)) coverageGap = true;
    boundaries.forEach((boundary, index) => {
      const next = boundaries[index + 1]?.date;
      const segmentEnd = next ? new Date(Math.min(range.end.getTime(), previousDayEnd(next).getTime())) : range.end;
      if (boundary.date <= segmentEnd) segments.push({
        start: boundary.date,
        end: segmentEnd,
        compensation: boundary.revision
      });
    });
  }
  return {
    ranges,
    segments,
    coverageGap,
    legacyReviewRequired: segments.some(item => item.compensation.compensationBasis === 'legacy_period')
  };
};

const currentCompensationSummary = (profile, { includeBaseRate = false } = {}) => {
  const value = normalizeCompensation(profile?.compensation, profile?.dateHired || new Date());
  if (!value) return null;
  return {
    compensationType: value.compensationType,
    compensationBasis: value.compensationBasis,
    ...(includeBaseRate ? { baseRate: value.baseRate } : {}),
    effectiveDate: value.effectiveDate,
    reviewRequired: value.compensationBasis === 'legacy_period'
  };
};

const compensationBasisLabel = basis => ({
  monthly: 'Monthly salary',
  daily: 'Daily rate',
  hourly: 'Hourly rate',
  legacy_period: 'Legacy salary per payroll period'
}[basis] || 'Not configured');

module.exports = {
  ACTIVE_EMPLOYMENT_STATUSES,
  COMPENSATION_BASES,
  compensationBasis,
  compensationBasisLabel,
  compensationRevisions,
  compensationSegmentsForPeriod,
  compensationTypeForBasis,
  currentCompensationSummary,
  employmentRanges,
  endOfDay,
  normalizeCompensation,
  startOfDay
};
