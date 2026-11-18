/**
 * Read-only frontend version of the Pawzzle Dynamic Pricing Engine.
 * Must match the backend logic for accurate price preview.
 */

const calendarNights = (checkInDate, checkOutDate) => {
  const matchDate = value => String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const start = matchDate(checkInDate);
  const end = matchDate(checkOutDate);
  if (!start || !end) return 0;
  return Math.round((Date.UTC(Number(end[1]), Number(end[2]) - 1, Number(end[3]))
    - Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]))) / 86400000);
};

const normalizePetSize = size => {
  const normalized = String(size || '').trim().toLowerCase();
  if (normalized === 'small') return 'small';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'large' || normalized === 'extra large') return 'large';
  return '';
};

const boardingPrice = (service, petData, bookingData) => {
  const configuration = service.pricingConfiguration || {};
  const nights = calendarNights(bookingData.checkInDate, bookingData.checkOutDate);
  if (nights < 1) throw new Error('Check-out date must be later than check-in date.');
  const minNights = Number(configuration.minimumNights || 0);
  const maxNights = Number(configuration.maximumNights || 0);
  if (minNights > 0 && nights < minNights) throw new Error(`This service requires a minimum stay of ${minNights} night${minNights === 1 ? '' : 's'}.`);
  if (maxNights > 0 && nights > maxNights) throw new Error(`This service allows a maximum stay of ${maxNights} night${maxNights === 1 ? '' : 's'}.`);
  const petSize = normalizePetSize(petData.size);
  const hasPerNightConfiguration = configuration.pricingBasis === 'per_night';
  if (hasPerNightConfiguration && configuration.petSizePricingEnabled && !petSize) {
    throw new Error('Select a pet with a Small, Medium, or Large size to calculate boarding pricing.');
  }
  const configuredRate = hasPerNightConfiguration && configuration.petSizePricingEnabled && petSize
    ? Number(configuration.petSizeRates?.[petSize])
    : (hasPerNightConfiguration ? Number(configuration.pricePerNight) : Number(service.price));
  const nightlyRate = Number.isFinite(configuredRate) && configuredRate >= 0 ? configuredRate : Number(service.price || 0);
  const subtotal = Number((nights * nightlyRate).toFixed(2));
  return {
    breakdown: {
      pricingBasis: 'per_night', basePrice: subtotal, numberOfNights: nights,
      applicableNightlyRate: nightlyRate, boardingPetSize: petSize || 'standard',
      sizeSurcharge: 0, weightSurcharge: 0, breedSurcharge: 0, conditionFees: 0,
      timePremium: 0, addOnsTotal: 0, homeServiceFee: 0,
      subtotal, discount: 0, finalPrice: subtotal
    },
    resolvedAddOns: []
  };
};

export const calculateServicePrice = (service, petData = {}, bookingData = {}, selectedAddOnIds = [], selectedConditions = []) => {
  if (service.category === 'boarding_hotel') return boardingPrice(service, petData, bookingData);
  const breakdown = {
    basePrice: service.price || 0,
    sizeSurcharge: 0,
    weightSurcharge: 0,
    breedSurcharge: 0,
    conditionFees: 0,
    timePremium: 0,
    addOnsTotal: 0,
    homeServiceFee: 0,
    subtotal: 0,
    discount: 0,
    finalPrice: 0
  };

  const rules = service.pricingRules || {};

  // 1. Pet Size Pricing
  if (rules.petSize && rules.petSize.enabled && petData.size) {
    const sizeMap = {
      'Small':       rules.petSize.small || 0,
      'Medium':      rules.petSize.medium || 0,
      'Large':       rules.petSize.large || 0,
      'Extra Large': rules.petSize.extraLarge || 0
    };
    breakdown.sizeSurcharge = sizeMap[petData.size] || 0;
  }

  // 2. Pet Weight Pricing
  if (rules.petWeight && rules.petWeight.enabled && petData.weight && rules.petWeight.ranges) {
    const weight = parseFloat(petData.weight);
    for (const range of rules.petWeight.ranges) {
      if (weight >= range.minWeight && weight <= range.maxWeight) {
        breakdown.weightSurcharge = range.adjustment || 0;
        break;
      }
    }
  }

  // 3. Breed-Based Pricing
  if (rules.breed && rules.breed.enabled && petData.breed && rules.breed.breeds) {
    const breedLower = petData.breed.toLowerCase();
    const match = rules.breed.breeds.find(b => b.breed.toLowerCase() === breedLower);
    if (match) {
      breakdown.breedSurcharge = match.adjustment || 0;
    }
  }

  // 4. Condition-Based Fees
  if (rules.condition && rules.condition.enabled && selectedConditions.length > 0 && rules.condition.conditions) {
    let totalFees = 0;
    for (const condId of selectedConditions) {
      const condRule = rules.condition.conditions.find(c => c.condition === condId);
      if (condRule) {
        totalFees += condRule.fee || 0;
      }
    }
    breakdown.conditionFees = totalFees;
  }

  // 5. Time-Based Pricing
  if (rules.timeBased && rules.timeBased.enabled && bookingData.date) {
    const bookingDate = new Date(bookingData.date);
    const dayOfWeek = bookingDate.getDay(); 

    let isHoliday = false;
    if (rules.timeBased.holidays && rules.timeBased.holidays.length > 0) {
      const bookingDateStr = bookingDate.toISOString().split('T')[0];
      isHoliday = rules.timeBased.holidays.some(h => {
        const holidayStr = new Date(h).toISOString().split('T')[0];
        return holidayStr === bookingDateStr;
      });
    }

    if (isHoliday) {
      breakdown.timePremium += rules.timeBased.holidayRate || 0;
    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      breakdown.timePremium += rules.timeBased.weekendRate || 0;
    } else {
      breakdown.timePremium += rules.timeBased.weekdayRate || 0;
    }

    if (bookingData.startTime && rules.timeBased.peakHoursStart && rules.timeBased.peakHoursEnd) {
      const toMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };
      const bookingMinutes = toMinutes(bookingData.startTime);
      const peakStart = toMinutes(rules.timeBased.peakHoursStart);
      const peakEnd = toMinutes(rules.timeBased.peakHoursEnd);

      if (bookingMinutes >= peakStart && bookingMinutes < peakEnd) {
        breakdown.timePremium += rules.timeBased.peakHoursRate || 0;
      }
    }
  }

  // 6. Add-Ons
  const resolvedAddOns = [];
  if (selectedAddOnIds.length > 0 && service.addOns) {
    for (const addonId of selectedAddOnIds) {
      const addon = service.addOns.find(a => (a._id === addonId || a.name === addonId) && a.isActive);
      if (addon) {
        breakdown.addOnsTotal += addon.price || 0;
        resolvedAddOns.push({
          addOnId: addon._id,
          name: addon.name,
          price: addon.price,
          duration: addon.duration || 0
        });
      }
    }
  }

  // 7. Home Service Fee
  if (bookingData.isHomeService && service.homeServiceAvailable) {
    breakdown.homeServiceFee = service.homeServicePrice || 0;
  }

  breakdown.subtotal = breakdown.basePrice
    + breakdown.sizeSurcharge
    + breakdown.weightSurcharge
    + breakdown.breedSurcharge
    + breakdown.conditionFees
    + breakdown.timePremium
    + breakdown.addOnsTotal
    + breakdown.homeServiceFee;

  breakdown.finalPrice = Math.max(0, breakdown.subtotal - breakdown.discount);

  return { breakdown, resolvedAddOns };
};
