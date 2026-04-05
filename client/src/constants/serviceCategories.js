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
      'Tick & Flea Treatment'
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
      'Pet Vitamins & Supplements'
    ]
  },
  {
    id: 'boarding_hotel',
    label: 'Pet Boarding / Pet Hotel',
    icon: '🏠',
    subServices: [
      'Overnight Stay for Pets',
      'Feeding & Care While Owner is Away',
      'Cage or Open Play Area'
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
