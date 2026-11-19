export const BUSINESS_CATEGORIES = Object.freeze([
  { id: 'pet_products', label: 'Pet Products', description: 'Sell pet food, supplies, medicine, and accessories.', module: 'products' },
  { id: 'pet_sales', label: 'Pet Sales', description: 'Offer live pets for sale or reservation.', module: 'pets' },
  { id: 'pet_grooming', label: 'Pet Grooming', description: 'Provide grooming and hygiene services.', module: 'services' },
  { id: 'pet_boarding', label: 'Pet Boarding', description: 'Provide overnight boarding or pet hotel services.', module: 'services' },
  { id: 'veterinary_services', label: 'Veterinary Services', description: 'Provide licensed veterinary care.', module: 'services' },
  { id: 'other_pet_services', label: 'Other Pet Services', description: 'Offer training, walking, daycare, or other care.', module: 'services' }
]);

export const CATEGORY_REQUIREMENTS = Object.freeze({
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

export const deriveOperationalModules = categories => [...new Set((categories || [])
  .map(category => BUSINESS_CATEGORIES.find(item => item.id === category)?.module)
  .filter(Boolean))];

export const combinedCategoryRequirements = categories => {
  const byKey = new Map();
  (categories || []).forEach(category => (CATEGORY_REQUIREMENTS[category] || []).forEach(requirement => {
    const current = byKey.get(requirement.key);
    if (!current) byKey.set(requirement.key, { ...requirement, categories: [category] });
    else if (!current.categories.includes(category)) current.categories.push(category);
  }));
  return [...byKey.values()];
};

export const categoryDocumentField = requirementKey => `categoryDocument__${requirementKey}`;
