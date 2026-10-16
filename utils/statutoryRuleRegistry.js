const crypto = require('node:crypto');

const canonicalize = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const rulePayload = rule => ({
  agency: rule.agency,
  program: rule.program,
  employeeCoverage: rule.employeeCoverage,
  issuanceId: rule.issuanceId,
  sourceUrl: rule.sourceUrl,
  sourceVerifiedOn: rule.sourceVerifiedOn ? new Date(rule.sourceVerifiedOn).toISOString() : null,
  effectiveFrom: new Date(rule.effectiveFrom).toISOString(),
  effectiveThrough: rule.effectiveThrough ? new Date(rule.effectiveThrough).toISOString() : null,
  version: rule.version,
  parameters: rule.parameters
});

const calculateRuleChecksum = rule => crypto
  .createHash('sha256')
  .update(canonicalize(rulePayload(rule)))
  .digest('hex');

const ruleError = (code, message) => Object.assign(new Error(message), { code });

const validateRuleIntegrity = rule => {
  if (!rule || !rule.agency || !rule.program || !rule.employeeCoverage || !rule.issuanceId
    || !rule.version || !rule.sourceUrl || !rule.sourceVerifiedOn || !rule.effectiveFrom || !rule.parameters) {
    throw ruleError('invalid_rule_version', 'Statutory rule version is missing required source, scope, date, version, or parameter data.');
  }
  let source;
  let effectiveFrom;
  let sourceVerifiedOn;
  let effectiveThrough = null;
  try {
    source = new URL(rule.sourceUrl);
    sourceVerifiedOn = new Date(rule.sourceVerifiedOn);
    effectiveFrom = new Date(rule.effectiveFrom);
    if (rule.effectiveThrough) effectiveThrough = new Date(rule.effectiveThrough);
  } catch (_error) {
    throw ruleError('invalid_rule_version', 'Statutory rule has an invalid source URL or effective date.');
  }
  if (source.protocol !== 'https:' || !Number.isFinite(sourceVerifiedOn.getTime()) || !Number.isFinite(effectiveFrom.getTime())
    || (effectiveThrough && !Number.isFinite(effectiveThrough.getTime()))
    || (effectiveThrough && effectiveThrough < effectiveFrom)) {
    throw ruleError('invalid_rule_version', 'Statutory rule source or effective date range is invalid.');
  }
  if (!rule.checksum || calculateRuleChecksum(rule) !== String(rule.checksum).toLowerCase()) {
    throw ruleError('rule_integrity_mismatch', `Statutory rule ${rule.version} failed checksum validation.`);
  }
  return true;
};

const overlaps = (left, right) => {
  const leftStart = new Date(left.effectiveFrom).getTime();
  const rightStart = new Date(right.effectiveFrom).getTime();
  const leftEnd = left.effectiveThrough ? new Date(left.effectiveThrough).getTime() : Infinity;
  const rightEnd = right.effectiveThrough ? new Date(right.effectiveThrough).getTime() : Infinity;
  return leftStart <= rightEnd && rightStart <= leftEnd;
};

const validateActiveRuleSet = rules => {
  const active = (rules || []).filter(rule => rule.activationStatus === 'active');
  active.forEach(validateRuleIntegrity);
  for (let index = 0; index < active.length; index += 1) {
    for (let other = index + 1; other < active.length; other += 1) {
      const first = active[index];
      const second = active[other];
      if (first.agency === second.agency && first.program === second.program
        && first.employeeCoverage === second.employeeCoverage && overlaps(first, second)) {
        throw ruleError('overlapping_active_rules', `Active ${first.agency} rule versions ${first.version} and ${second.version} overlap.`);
      }
    }
  }
  return true;
};

const selectRuleVersion = ({ rules, agency, program, employeeCoverage, applicableDate }) => {
  const at = new Date(applicableDate);
  if (!Number.isFinite(at.getTime())) throw ruleError('invalid_applicable_date', 'A valid contribution or tax period date is required.');
  validateActiveRuleSet(rules);
  const matches = (rules || []).filter(rule => rule.activationStatus === 'active'
    && rule.verificationStatus === 'verified'
    && rule.agency === agency
    && rule.program === program
    && rule.employeeCoverage === employeeCoverage
    && new Date(rule.effectiveFrom) <= at
    && (!rule.effectiveThrough || new Date(rule.effectiveThrough) >= at));
  if (!matches.length) throw ruleError('verified_rule_missing', `No active verified ${agency} rule covers ${at.toISOString().slice(0, 10)} for ${employeeCoverage}; no fallback was used.`);
  if (matches.length !== 1) throw ruleError('ambiguous_rule_version', `More than one active ${agency} rule covers the requested date and employee category.`);
  validateRuleIntegrity(matches[0]);
  return matches[0];
};

module.exports = {
  calculateRuleChecksum,
  validateRuleIntegrity,
  validateActiveRuleSet,
  selectRuleVersion
};
