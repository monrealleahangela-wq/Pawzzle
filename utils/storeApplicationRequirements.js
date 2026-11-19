const BUSINESS_CATEGORIES = Object.freeze([
  'pet_products',
  'pet_sales',
  'pet_grooming',
  'pet_boarding',
  'veterinary_services',
  'other_pet_services'
]);

const CATEGORY_MODULE_MAP = Object.freeze({
  pet_products: 'products',
  pet_sales: 'pets',
  pet_grooming: 'services',
  pet_boarding: 'services',
  veterinary_services: 'services',
  other_pet_services: 'services'
});

const CATEGORY_REQUIREMENTS = Object.freeze({
  pet_products: [
    { key: 'regulated_product_registration', label: 'Applicable BAI or FDA registration', level: 'conditional' },
    { key: 'product_permits', label: 'Product permits where required', level: 'conditional' }
  ],
  pet_sales: [
    { key: 'animal_facility_registration', label: 'BAI animal facility registration or license to operate', level: 'required' },
    { key: 'animal_welfare_compliance', label: 'Animal welfare compliance document', level: 'required' },
    { key: 'pet_sales_local_permit', label: 'Additional local permit', level: 'conditional' }
  ],
  pet_grooming: [
    { key: 'grooming_facility_registration', label: 'Applicable BAI facility registration', level: 'conditional' },
    { key: 'grooming_facility_information', label: 'Grooming facility information', level: 'required' },
    { key: 'grooming_staff_qualifications', label: 'Staff qualifications', level: 'recommended' }
  ],
  pet_boarding: [
    { key: 'boarding_facility_registration', label: 'Applicable BAI facility registration', level: 'conditional' },
    { key: 'boarding_facility_information', label: 'Boarding facility information', level: 'required' },
    { key: 'sanitation_safety_procedures', label: 'Sanitation and safety procedures', level: 'required' },
    { key: 'animal_care_protocols', label: 'Animal care protocols', level: 'required' }
  ],
  veterinary_services: [
    { key: 'veterinary_facility_registration', label: 'Applicable BAI facility registration', level: 'conditional' },
    { key: 'veterinarian_prc_license', label: 'Veterinarian PRC license or ID', level: 'required' },
    { key: 'veterinary_facility_permit', label: 'Veterinary facility permit', level: 'required' }
  ],
  other_pet_services: [
    { key: 'other_service_permit', label: 'Applicable service permit or qualification', level: 'conditional' }
  ]
});

const deriveOperationalModules = categories => [...new Set((categories || [])
  .map(category => CATEGORY_MODULE_MAP[category])
  .filter(Boolean))];

const combinedCategoryRequirements = categories => {
  const byKey = new Map();
  for (const category of categories || []) {
    for (const requirement of CATEGORY_REQUIREMENTS[category] || []) {
      const current = byKey.get(requirement.key);
      if (!current) byKey.set(requirement.key, { ...requirement, categories: [category] });
      else if (!current.categories.includes(category)) current.categories.push(category);
    }
  }
  return [...byKey.values()];
};

const categoryDocumentField = requirementKey => `categoryDocument__${requirementKey}`;

module.exports = {
  BUSINESS_CATEGORIES,
  CATEGORY_MODULE_MAP,
  CATEGORY_REQUIREMENTS,
  deriveOperationalModules,
  combinedCategoryRequirements,
  categoryDocumentField
};
