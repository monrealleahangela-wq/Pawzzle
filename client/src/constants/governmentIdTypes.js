export const GOVERNMENT_ID_TYPES = Object.freeze([
  { value: 'philsys_id', label: 'PhilSys National ID' },
  { value: 'passport', label: 'Philippine Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'umid', label: 'UMID' },
  { value: 'sss_id', label: 'SSS ID' },
  { value: 'gsis_id', label: 'GSIS ID' },
  { value: 'prc_id', label: 'PRC ID' },
  { value: 'voters_id', label: "Voter's ID" },
  { value: 'postal_id', label: 'Postal ID' },
  { value: 'philhealth_id', label: 'PhilHealth ID' },
  { value: 'senior_citizen_id', label: 'Senior Citizen ID' },
  { value: 'pwd_id', label: 'PWD ID' },
  { value: 'nbi_clearance', label: 'NBI Clearance' },
  { value: 'police_clearance', label: 'Police Clearance' },
  { value: 'other_government_id', label: 'Other Government-issued ID' }
]);

export const GOVERNMENT_ID_ACCEPT = 'image/jpeg,image/png,image/webp';
export const GOVERNMENT_ID_MAX_BYTES = 5 * 1024 * 1024;
