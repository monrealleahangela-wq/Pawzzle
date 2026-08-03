const Booking = require('../models/Booking');
const PetProfile = require('../models/PetProfile');
const MedicalEncounter = require('../models/MedicalEncounter');
const VaccinationRecord = require('../models/VaccinationRecord');
const PetServiceUpdate = require('../models/PetServiceUpdate');
const DogCertification = require('../models/DogCertification');
const InventoryLot = require('../models/InventoryLot');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const { hasPermission } = require('../config/permissions');

const assertPetAccess = async (req, petId) => {
  const pet = await PetProfile.findById(petId);
  if (!pet) throw new Error('Pet not found.');
  const isOwner = pet.owner?.toString() === req.user._id.toString();
  const isSameStore = req.user.store && pet.homeStore
    && pet.homeStore.toString() === req.user.store.toString();
  let hasAssignedBooking = false;
  if (!isOwner && !isSameStore && req.user.store && req.body?.booking) {
    hasAssignedBooking = Boolean(await Booking.exists({
      _id: req.body.booking, customer: pet.owner, store: req.user.store,
      $or: [{ staff: req.user._id }, { staff: null }]
    }));
  }
  const isPlatformAdmin = ['super_admin', 'platform_admin'].includes(req.user.role);
  const clinicalAccess = hasPermission(req.user, 'clinical.manage') && (isSameStore || hasAssignedBooking);
  if (!isOwner && !clinicalAccess && !isPlatformAdmin) {
    const error = new Error('Access denied to this pet record.');
    error.status = 403;
    throw error;
  }
  return pet;
};

const createEncounter = async (req, res) => {
  try {
    const pet = await assertPetAccess(req, req.params.petId);
    const encounter = await MedicalEncounter.create({
      ...req.body, pet: pet._id, store: req.user.store || pet.store,
      veterinarian: req.user._id, createdBy: req.user._id
    });
    res.status(201).json(encounter);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const getMedicalHistory = async (req, res) => {
  try {
    await assertPetAccess(req, req.params.petId);
    const [encounters, vaccinations] = await Promise.all([
      MedicalEncounter.find({ pet: req.params.petId }).populate('veterinarian', 'firstName lastName').sort({ encounterDate: -1 }),
      VaccinationRecord.find({ pet: req.params.petId }).populate('veterinarian', 'firstName lastName').sort({ administeredAt: -1 })
    ]);
    res.json({ encounters, vaccinations });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const administerVaccine = async (req, res) => {
  try {
    const pet = await assertPetAccess(req, req.params.petId);
    const lot = await InventoryLot.findOne({
      _id: req.body.inventoryLotId, store: req.user.store || pet.store,
      isVaccine: true, status: 'available', quantityAvailable: { $gte: 1 },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    });
    if (!lot) return res.status(400).json({ message: 'A valid, available, unexpired vaccine lot is required.' });
    const record = await VaccinationRecord.create({
      ...req.body, pet: pet._id, store: lot.store, veterinarian: req.user._id,
      inventoryLot: lot._id, lotNumberSnapshot: lot.lotNumber,
      manufacturerSnapshot: lot.manufacturer, createdBy: req.user._id
    });
    try {
      await InventoryLedgerService.issueFromLot({
        store: lot.store, product: lot.product, lotId: lot._id,
        quantity: 1, type: 'service_use',
        referenceType: 'VaccinationRecord', referenceId: record._id,
        performedBy: req.user._id, reason: `Vaccine administered to pet ${pet._id}`
      });
    } catch (inventoryError) {
      await VaccinationRecord.findByIdAndDelete(record._id);
      throw inventoryError;
    }
    res.status(201).json(record);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const addServiceUpdate = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    if (req.user.store && booking.store.toString() !== req.user.store.toString()) {
      return res.status(403).json({ message: 'Booking belongs to another store.' });
    }
    const update = await PetServiceUpdate.create({
      ...req.body, booking: booking._id, pet: req.body.petId,
      customer: booking.customer, store: booking.store, createdBy: req.user._id
    });
    res.status(201).json(update);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getServiceUpdates = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const isCustomer = booking.customer.toString() === req.user._id.toString();
    const isStore = req.user.store && booking.store.toString() === req.user.store.toString();
    if (!isCustomer && !isStore) return res.status(403).json({ message: 'Access denied.' });
    res.json({ updates: await PetServiceUpdate.find({ booking: booking._id }).sort({ createdAt: 1 }) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const createCertification = async (req, res) => {
  try {
    const pet = await assertPetAccess(req, req.params.petId);
    const certification = await DogCertification.create({
      ...req.body, pet: pet._id, owner: pet.owner,
      verificationStatus: req.body.documentUrls?.length ? 'submitted' : 'unsubmitted'
    });
    res.status(201).json(certification);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

module.exports = {
  createEncounter, getMedicalHistory, administerVaccine,
  addServiceUpdate, getServiceUpdates, createCertification
};
