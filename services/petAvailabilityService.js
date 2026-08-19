const Pet = require('../models/Pet');
const Order = require('../models/Order');
const AdoptionRequest = require('../models/AdoptionRequest');

const ACTIVE_ORDER_STATUSES = [
  'pending_payment', 'paid', 'awaiting_confirmation', 'confirmed', 'preparing', 'ready_for_pickup',
  'rider_assigned', 'picked_up', 'in_transit', 'delivered'
];
const ACTIVE_ADOPTION_STATUSES = [
  'inquiry_submitted', 'under_review', 'reserved', 'approved', 'pickup_scheduling', 'pickup_confirmed'
];

const petIdOf = pet => pet?._id || pet;
const isIndividualPetRecord = pet => {
  if (!pet) return false;
  const quantity = pet.quantity;
  return quantity === undefined || quantity === null || Number(quantity) === 1;
};

const getPetAvailabilityIssue = (pet, requestedQuantity = 1) => {
  if (!pet || pet.isDeleted) return 'Pet listing was not found.';
  if (Number(requestedQuantity) !== 1) return 'Each pet listing represents one individual pet and must use quantity 1.';
  if (!isIndividualPetRecord(pet)) {
    return 'This legacy quantity-based pet listing requires manual cleanup before it can be purchased.';
  }
  if (pet.status !== 'available' || pet.isAvailable !== true) {
    return `Pet "${pet.name || pet._id}" is ${pet.status || 'unavailable'} and cannot be purchased.`;
  }
  return null;
};

const availableIndividualFilter = {
  isDeleted: { $ne: true },
  isAvailable: true,
  status: 'available',
  $or: [
    { quantity: { $exists: false } },
    { quantity: null },
    { quantity: 1 }
  ]
};

const reservationFields = source => source === 'order'
  ? { own: 'reservation.order', other: 'reservation.adoptionRequest' }
  : { own: 'reservation.adoptionRequest', other: 'reservation.order' };

const hasCompetingReservation = async ({ petId, source, referenceId }) => {
  const orderFilter = {
    _id: source === 'order' ? { $ne: referenceId } : { $exists: true },
    status: { $in: ACTIVE_ORDER_STATUSES },
    items: { $elemMatch: { itemType: 'pet', itemId: petId } }
  };
  const adoptionFilter = {
    _id: source === 'adoption' ? { $ne: referenceId } : { $exists: true },
    pet: petId,
    status: { $in: ACTIVE_ADOPTION_STATUSES }
  };
  const [order, adoption] = await Promise.all([
    Order.exists(orderFilter),
    AdoptionRequest.exists(adoptionFilter)
  ]);
  return Boolean(order || adoption);
};

const reservePet = async ({ petId, source, referenceId }) => {
  const id = petIdOf(petId);
  const { own, other } = reservationFields(source);
  const claimed = await Pet.findOneAndUpdate({
    _id: id,
    $or: [
      availableIndividualFilter,
      {
        status: 'reserved',
        [own]: referenceId,
        [other]: null,
        $or: [{ quantity: { $exists: false } }, { quantity: null }, { quantity: 1 }]
      }
    ]
  }, {
    $set: {
      status: 'reserved',
      isAvailable: false,
      [own]: referenceId,
      'reservation.reservedAt': new Date()
    },
    $unset: { [other]: 1 }
  }, { new: true, runValidators: true });

  if (claimed) return claimed;

  // Backward compatibility: attach ownership to an unowned legacy reservation
  // only when no other active order/request can claim it.
  const legacyReserved = await Pet.findOne({
    _id: id,
    status: 'reserved',
    [own]: null,
    [other]: null
  });
  if (!legacyReserved || !isIndividualPetRecord(legacyReserved)) return null;
  if (await hasCompetingReservation({ petId: id, source, referenceId })) return null;

  return Pet.findOneAndUpdate({
    _id: id,
    status: 'reserved',
    [own]: null,
    [other]: null
  }, {
    $set: { [own]: referenceId, 'reservation.reservedAt': new Date(), isAvailable: false }
  }, { new: true, runValidators: true });
};

const releasePetReservation = async ({ petId, source, referenceId }) => {
  const id = petIdOf(petId);
  const { own, other } = reservationFields(source);
  const released = await Pet.findOneAndUpdate({
    _id: id,
    status: 'reserved',
    [own]: referenceId
  }, {
    $set: { status: 'available', isAvailable: true },
    $unset: { reservation: 1 }
  }, { new: true, runValidators: true });
  if (released) return released;

  const legacyReserved = await Pet.findOne({ _id: id, status: 'reserved', [own]: null, [other]: null });
  if (!legacyReserved || !isIndividualPetRecord(legacyReserved)) return null;
  if (await hasCompetingReservation({ petId: id, source, referenceId })) return null;

  return Pet.findOneAndUpdate({ _id: id, status: 'reserved', [own]: null, [other]: null }, {
    $set: { status: 'available', isAvailable: true },
    $unset: { reservation: 1 }
  }, { new: true, runValidators: true });
};

const finalizePetReservation = async ({ petId, source, referenceId, status }) => {
  if (!['sold', 'adopted'].includes(status)) throw new Error('Invalid terminal pet status.');
  const id = petIdOf(petId);
  const { own, other } = reservationFields(source);
  const completed = await Pet.findOneAndUpdate({
    _id: id,
    [own]: referenceId,
    $or: [{ status: 'reserved' }, { status }]
  }, {
    $set: { status, isAvailable: false, 'reservation.completedAt': new Date() },
    $unset: { [other]: 1 }
  }, { new: true, runValidators: true });
  if (completed) return completed;

  const legacyReserved = await Pet.findOne({ _id: id, status: 'reserved', [own]: null, [other]: null });
  if (!legacyReserved || !isIndividualPetRecord(legacyReserved)) return null;
  if (await hasCompetingReservation({ petId: id, source, referenceId })) return null;

  return Pet.findOneAndUpdate({ _id: id, status: 'reserved', [own]: null, [other]: null }, {
    $set: {
      status,
      isAvailable: false,
      [own]: referenceId,
      'reservation.completedAt': new Date()
    }
  }, { new: true, runValidators: true });
};

module.exports = {
  ACTIVE_ADOPTION_STATUSES,
  ACTIVE_ORDER_STATUSES,
  finalizePetReservation,
  getPetAvailabilityIssue,
  isIndividualPetRecord,
  releasePetReservation,
  reservePetForAdoption: (petId, requestId) => reservePet({ petId, source: 'adoption', referenceId: requestId }),
  reservePetForOrder: (petId, orderId) => reservePet({ petId, source: 'order', referenceId: orderId })
};
