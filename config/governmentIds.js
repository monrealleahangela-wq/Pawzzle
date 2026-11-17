const GOVERNMENT_ID_TYPES = Object.freeze([
  'philsys_id',
  'passport',
  'drivers_license',
  'umid',
  'sss_id',
  'gsis_id',
  'prc_id',
  'voters_id',
  'postal_id',
  'philhealth_id',
  'senior_citizen_id',
  'pwd_id',
  'nbi_clearance',
  'police_clearance',
  'other_government_id'
]);

const isGovernmentIdType = value => GOVERNMENT_ID_TYPES.includes(String(value || '').trim());

module.exports = { GOVERNMENT_ID_TYPES, isGovernmentIdType };
