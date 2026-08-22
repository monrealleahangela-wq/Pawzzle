const VETERINARY_ROLES = new Set([
  'veterinarian', 'veterinary_technician', 'veterinary_assistant',
  'veterinary_nurse', 'veterinary_laboratory_technician'
]);

const base = {
  eyebrow: 'My care workspace',
  title: 'Assigned care',
  bookingsTitle: 'My Appointments',
  todayLabel: "Today's appointments",
  activeLabel: 'Active services',
  upcomingLabel: 'Upcoming appointments',
  completedLabel: 'Completed services',
  empty: 'No assigned appointments are scheduled right now.'
};

export const getStaffWorkspaceConfig = role => {
  if (VETERINARY_ROLES.has(role)) return {
    ...base,
    eyebrow: 'Clinical workspace',
    title: role === 'veterinarian' ? 'Veterinary care' : 'Veterinary support',
    bookingsTitle: 'My Clinical Appointments',
    todayLabel: "Today's consultations",
    activeLabel: 'Active consultations',
    completedLabel: 'Completed consultations',
    empty: 'No assigned veterinary appointments are scheduled right now.'
  };
  if (role === 'groomer') return {
    ...base,
    eyebrow: 'Grooming workspace',
    title: 'Grooming care',
    bookingsTitle: 'My Grooming Appointments',
    todayLabel: "Today's grooming jobs",
    empty: 'No assigned grooming appointments are scheduled right now.'
  };
  if (role === 'trainer') return {
    ...base,
    eyebrow: 'Training workspace',
    title: 'Training sessions',
    bookingsTitle: 'My Training Sessions',
    todayLabel: "Today's sessions",
    activeLabel: 'Active sessions',
    upcomingLabel: 'Upcoming sessions',
    completedLabel: 'Completed sessions',
    empty: 'No assigned training sessions are scheduled right now.'
  };
  if (role === 'boarding_staff') return {
    ...base,
    eyebrow: 'Boarding workspace',
    title: 'Boarding care',
    bookingsTitle: 'My Boarding Care',
    todayLabel: 'Arrivals today',
    activeLabel: 'Pets checked in',
    upcomingLabel: 'Upcoming stays',
    completedLabel: 'Completed stays',
    empty: 'No assigned boarding stays are scheduled right now.'
  };
  return base;
};

export const readableRole = role => String(role || 'care professional')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());
