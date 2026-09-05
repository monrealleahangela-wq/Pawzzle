const ageInYears = (profile = {}, now = new Date()) => {
  if (profile.birthday) {
    const birthday = new Date(profile.birthday);
    if (!Number.isNaN(birthday.getTime()) && birthday <= now) {
      let years = now.getFullYear() - birthday.getFullYear();
      const beforeBirthday = now.getMonth() < birthday.getMonth()
        || (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate());
      if (beforeBirthday) years -= 1;
      return Math.max(0, years);
    }
  }
  const approximate = Number(profile.approximateAge?.value);
  if (Number.isFinite(approximate) && approximate >= 0) {
    return profile.approximateAge?.unit === 'months' ? approximate / 12 : approximate;
  }
  return null;
};

const cleanNumber = value => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const buildBookingPetSnapshot = (submittedPet = {}, profile = null) => {
  if (!profile) {
    return {
      ...submittedPet,
      name: String(submittedPet.name || '').trim(),
      type: String(submittedPet.type || '').trim(),
      breed: String(submittedPet.breed || '').trim(),
      age: cleanNumber(submittedPet.age),
      weight: cleanNumber(submittedPet.weight)
    };
  }

  const source = profile.toObject ? profile.toObject() : profile;
  return {
    name: String(source.name || '').trim(),
    type: String(source.type || '').trim(),
    breed: String(source.breed || '').trim(),
    size: source.size || 'Unknown',
    age: ageInYears(source),
    gender: source.gender,
    weight: cleanNumber(source.weight),
    color: source.color || '',
    photo: source.photo || null,
    vaccinationStatus: source.vaccinationStatus || 'Pending',
    specialNotes: source.specialNotes || '',
    allergies: source.allergies || 'None',
    medicalConditions: source.medicalConditions || 'None',
    groomingPreferences: source.groomingPreferences || 'None',
    behaviorNotes: source.behaviorNotes || 'Normal'
  };
};

module.exports = { ageInYears, buildBookingPetSnapshot };
