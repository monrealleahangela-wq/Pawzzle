export const SERVICE_CATEGORIES = [
  {
    id: 'grooming',
    label: 'Grooming',
    icon: '✨',
    subServices: [
      'Bathing & Drying',
      'Haircut / Trimming',
      'Nail Clipping',
      'Ear Cleaning',
      'Tick & Flea Treatment',
      'De-shedding',
      'Teeth Cleaning'
    ]
  },
  {
    id: 'health_wellness',
    label: 'Health & Wellness',
    icon: '🏥',
    subServices: [
      'Vaccination',
      'Deworming',
      'Basic Check-Ups',
      'Pet Vitamins & Supplements',
      'Veterinary Consultation',
      'Lab Tests & Diagnostics'
    ]
  },
  {
    id: 'boarding_hotel',
    label: 'Pet Boarding / Pet Hotel',
    icon: '🏠',
    subServices: [
      'Overnight Stay for Pets',
      'Feeding & Care While Owner is Away',
      'Cage or Open Play Area',
      'Long-Term Boarding'
    ]
  },
  {
    id: 'training',
    label: 'Pet Training',
    icon: '🎓',
    subServices: [
      'Obedience Training',
      'Puppy Training',
      'Behavioral Correction',
      'Agility Training',
      'Socialization Classes'
    ]
  },
  {
    id: 'pet_services',
    label: 'Pet Services',
    icon: '🚶',
    subServices: [
      'Dog Walking',
      'Pet Sitting (Home Service)',
      'Pet Transportation'
    ]
  },
  {
    id: 'home_services',
    label: 'Home Services',
    icon: '🏡',
    subServices: [
      'Mobile Grooming',
      'In-Home Vet Visit',
      'Home Training Session',
      'Home Pet Sitting'
    ]
  },
  {
    id: 'other',
    label: 'Other',
    icon: '📦',
    subServices: ['General Care', 'Consultation', 'Special Request']
  }
];

export const getSubServicesByCategory = (categoryId) => {
  const category = SERVICE_CATEGORIES.find(c => c.id === categoryId);
  return category ? category.subServices : [];
};

export const getCategoryLabel = (categoryId) => {
  const category = SERVICE_CATEGORIES.find(c => c.id === categoryId);
  return category ? category.label : 'Other';
};

export const getCategoryIcon = (categoryId) => {
  const category = SERVICE_CATEGORIES.find(c => c.id === categoryId);
  return category ? category.icon : '📦';
};
