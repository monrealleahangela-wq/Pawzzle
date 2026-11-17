export const GOVERNMENT_ID_TYPES = Object.freeze([
  ['philsys_id', 'PhilSys ID / National ID'],
  ['passport', 'Philippine passport'],
  ['drivers_license', "Driver's license"],
  ['umid', 'UMID'],
  ['sss_id', 'SSS ID'],
  ['gsis_id', 'GSIS ID'],
  ['prc_id', 'PRC ID'],
  ['voters_id', "Voter's ID"],
  ['postal_id', 'Postal ID'],
  ['philhealth_id', 'PhilHealth ID'],
  ['senior_citizen_id', 'Senior citizen ID'],
  ['pwd_id', 'PWD ID'],
  ['nbi_clearance', 'NBI clearance'],
  ['police_clearance', 'Police clearance'],
  ['other_government_id', 'Other government-issued ID']
]);

export const MAX_ID_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_ID_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png']);
