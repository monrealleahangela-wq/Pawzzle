const parseBirthDate = value => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1
      || date.getDate() !== Number(match[3])) return null;
  return date;
};

const derivePetAge = (birthDate, now = new Date()) => {
  const birthday = parseBirthDate(birthDate);
  if (!birthday) return { valid: false, message: 'A valid birth date is required.' };
  if (birthday > now) return { valid: false, message: 'Birth date cannot be in the future.' };

  let totalMonths = (now.getFullYear() - birthday.getFullYear()) * 12
    + now.getMonth() - birthday.getMonth();
  if (now.getDate() < birthday.getDate()) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);

  return {
    valid: true,
    age: totalMonths >= 12 ? Math.floor(totalMonths / 12) : totalMonths,
    ageUnit: totalMonths >= 12 ? 'years' : 'months',
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12
  };
};

module.exports = { derivePetAge, parseBirthDate };
