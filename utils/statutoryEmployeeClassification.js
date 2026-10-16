const AGENCIES = new Set(['SSS', 'PhilHealth', 'Pag-IBIG', 'BIR']);
const COVERAGE = new Set(['covered', 'not_covered', 'exempt']);
const EMPLOYEE_CATEGORIES = Object.freeze({
  SSS: new Set(['private_sector_employed', 'government_employed', 'household_worker', 'self_employed', 'other']),
  PhilHealth: new Set(['private_formal_economy', 'government_formal_economy', 'self_earning', 'other']),
  'Pag-IBIG': new Set(['employed_member', 'voluntary_member', 'other']),
  BIR: new Set(['private_compensation_employee', 'government_compensation_employee', 'other'])
});

const classificationError = (code, message) => Object.assign(new Error(message), { code });

const parseDate = value => {
  const text = String(value || '').slice(0, 10);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw classificationError('invalid_classification_date', 'Enter valid effective start and end dates.');
  }
  return date;
};

const validateEvidence = (sourceReference, reason) => {
  let url;
  try { url = new URL(String(sourceReference || '')); } catch (_error) { /* handled below */ }
  if (!url || url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw classificationError('classification_source_required', 'Provide a clean HTTPS source URL without embedded credentials, query parameters, or fragments.');
  }
  const text = String(reason || '').trim();
  if (text.length < 10 || text.length > 500) throw classificationError('classification_reason_required', 'Provide a specific classification reason between 10 and 500 characters.');
  return { sourceReference: url.toString(), reason: text };
};

const validateInterval = input => {
  const effectiveFrom = parseDate(input.effectiveFrom);
  const effectiveThrough = input.effectiveThrough ? parseDate(input.effectiveThrough) : null;
  if (effectiveThrough && effectiveThrough < effectiveFrom) throw classificationError('invalid_classification_date', 'Effective end date cannot precede the start date.');
  return { effectiveFrom, effectiveThrough };
};

const overlaps = (left, right) => {
  const leftEnd = left.effectiveThrough ? new Date(left.effectiveThrough).getTime() : Infinity;
  const rightEnd = right.effectiveThrough ? new Date(right.effectiveThrough).getTime() : Infinity;
  return new Date(left.effectiveFrom).getTime() <= rightEnd && new Date(right.effectiveFrom).getTime() <= leftEnd;
};

const validateNoOverlap = (entries, candidate, key) => {
  if ((entries || []).some(entry => entry[key] === candidate[key] && overlaps(entry, candidate))) {
    throw classificationError('overlapping_classification', `This ${key} already has a verified classification covering part of the requested effective period. Close the prior period before adding a new one.`);
  }
};

const buildStatutoryClassification = (input, actor, existing = []) => {
  if (!AGENCIES.has(input.agency) || !COVERAGE.has(input.coverageStatus)) throw classificationError('invalid_statutory_classification', 'Select a supported agency and explicit covered, not-covered, or exempt status.');
  if (input.agency === 'BIR' && !['verified_yes', 'verified_no'].includes(input.minimumWageEarnerStatus)) {
    throw classificationError('missing_minimum_wage_classification', 'BIR classification requires explicitly verified minimum-wage-earner status; do not infer it from salary.');
  }
  if (input.agency !== 'BIR' && input.minimumWageEarnerStatus !== undefined) throw classificationError('invalid_statutory_classification', 'Minimum-wage-earner status is a BIR classification and cannot be recorded against another agency.');
  const employeeCategory = String(input.employeeCategory || '').trim().toLowerCase();
  if (!EMPLOYEE_CATEGORIES[input.agency].has(employeeCategory)) throw classificationError('invalid_employee_category', 'Select a supported, explicit employee category for the selected agency.');
  const interval = validateInterval(input);
  const evidence = validateEvidence(input.sourceReference, input.reason);
  const entry = { agency: input.agency, employeeCategory, coverageStatus: input.coverageStatus, ...(input.agency === 'BIR' ? { minimumWageEarnerStatus: input.minimumWageEarnerStatus } : {}), ...interval, ...evidence, verifiedBy: actor, verifiedAt: new Date() };
  validateNoOverlap(existing, entry, 'agency');
  return entry;
};

const buildCompensationTaxClassification = (input, actor, existing = []) => {
  const componentCode = String(input.componentCode || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,59}$/.test(componentCode)) throw classificationError('invalid_component_code', 'Enter a valid compensation component code.');
  if (!['regular', 'supplementary'].includes(input.compensationType)
    || !['taxable', 'exempt', 'mwe_exemptible'].includes(input.taxTreatment)) {
    throw classificationError('invalid_tax_classification', 'Select a supported compensation type and tax treatment.');
  }
  const interval = validateInterval(input);
  const evidence = validateEvidence(input.sourceReference, input.reason);
  const entry = { componentCode, compensationType: input.compensationType, taxTreatment: input.taxTreatment, ...interval, ...evidence, verifiedBy: actor, verifiedAt: new Date() };
  validateNoOverlap(existing, entry, 'componentCode');
  return entry;
};

module.exports = {
  buildStatutoryClassification,
  buildCompensationTaxClassification,
  overlaps
};
