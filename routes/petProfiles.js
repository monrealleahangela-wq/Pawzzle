const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const PetProfile = require('../models/PetProfile');
const { body, validationResult } = require('express-validator');
const {
  PET_TYPES,
  PET_PROFILE_SIZES,
  COAT_LENGTHS,
  COAT_TYPES,
  SERVICE_NEEDS,
  normalizePetType,
  toProfileSize
} = require('../utils/serviceAdvisorPetContract');

const petValidation = [
  body('name').trim().notEmpty().withMessage('Pet name is required'),
  body('type').customSanitizer(value => normalizePetType(value) || value).isIn(PET_TYPES).withMessage('Invalid pet species'),
  body('breed').trim().notEmpty().withMessage('Breed is required'),
  body('breedStatus').optional().isIn(['purebred', 'mixed_breed', 'unknown']).withMessage('Invalid breed status'),
  body('pcciRegistration.status').optional().isIn(['yes', 'no', 'not_sure']).withMessage('Invalid PCCI registration status'),
  body('pcciRegistration.registrationNumber').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('PCCI registration number is too long'),
  body('pcciRegistration.registeredName').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('Registered name is too long'),
  body('pcciRegistration.microchipNumber').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('Microchip number is too long'),
  body('pcciRegistration.certificateUrl').optional({ checkFalsy: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('Invalid certificate URL'),
  body('vaccinationStatus').isIn(['Vaccinated', 'Not Yet Vaccinated']).withMessage('Select a vaccination status'),
  body('supportingDocuments').optional().isArray({ max: 10 }).withMessage('Supporting documents must be a list'),
  body('supportingDocuments.*.url').optional({ checkFalsy: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('Invalid supporting document URL'),
  body('supportingDocuments.*.name').optional({ checkFalsy: true }).isLength({ max: 255 }).withMessage('Supporting document name is too long'),
  body('size').optional().customSanitizer(value => toProfileSize(value) || value).isIn(PET_PROFILE_SIZES).withMessage('Invalid size'),
  body('birthday').optional({ checkFalsy: true }).isISO8601().toDate().withMessage('Enter a valid birth date')
    .custom((value) => {
      const today = new Date();
      if (value > today) {
        throw new Error('Birth date cannot be in the future.');
      }
      return true;
    }),
  body('gender').isIn(['Male', 'Female']).withMessage('Invalid gender'),
  body('approximateAge.value').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Approximate age cannot be negative'),
  body('approximateAge.unit').optional({ checkFalsy: true }).isIn(['months', 'years']).withMessage('Invalid age unit'),
  body('weight').optional({ checkFalsy: true }).isFloat({ gt: 0, max: 200 }).withMessage('Weight must be greater than zero and no more than 200'),
  body('weightUnit').optional().isIn(['kg', 'lb']).withMessage('Invalid weight unit'),
  body('coat.length').optional().isIn(COAT_LENGTHS).withMessage('Invalid coat length'),
  body('coat.type').optional().isIn(COAT_TYPES).withMessage('Invalid coat type'),
  body('coat.condition').optional().isIn(['unknown', 'normal', 'tangled', 'matted', 'heavy_shedding', 'dry_looking', 'other']).withMessage('Invalid coat condition'),
  body('serviceNeeds').optional().isArray({ max: SERVICE_NEEDS.length }).withMessage('Service needs must be a list'),
  body('serviceNeeds.*').optional().isIn(SERVICE_NEEDS).withMessage('Invalid service need'),
  body('servicePreferences.preferredServiceType').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Preferred service type is too long'),
  body('servicePreferences.preferredDuration').optional({ checkFalsy: true }).isIn(['short', 'standard', 'extended']).withMessage('Invalid preferred duration'),
  body('servicePreferences.preferredFrequency').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Preferred frequency is too long'),
  body('servicePreferences.specialHandling').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Special handling notes are too long'),
  body().custom(value => {
    if (value.weight !== '' && value.weight !== null && value.weight !== undefined) {
      const weight = Number(value.weight);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 200) throw new Error('Weight must be greater than zero and no more than 200');
    }
    if (!value.birthday && (value.approximateAge?.value === '' || value.approximateAge?.value === undefined || value.approximateAge?.value === null)) {
      throw new Error('Enter either a birth date or an approximate age.');
    }
    return true;
  })
];

const profileFields = ['name', 'type', 'breed', 'isMixedBreed', 'breedStatus', 'pcciRegistration', 'size', 'birthday', 'approximateAge', 'gender', 'weight', 'weightUnit', 'color', 'photo', 'vaccinationCards', 'supportingDocuments', 'vaccinationStatus', 'specialNotes', 'allergies', 'medicalConditions', 'groomingPreferences', 'behaviorNotes', 'emergencyContact', 'coat', 'groomingHistory', 'serviceNeeds', 'servicePreferences'];
const profilePayload = body => {
  const payload = Object.fromEntries(profileFields.filter(key => body[key] !== undefined).map(key => [key, body[key]]));
  payload.type = normalizePetType(body.type);
  if (body.size !== undefined) payload.size = toProfileSize(body.size);
  payload.breedStatus = body.breedStatus || (body.isMixedBreed ? 'mixed_breed' : 'unknown');
  payload.isMixedBreed = payload.breedStatus === 'mixed_breed';
  const pcciApplicable = String(body.type).toLowerCase() === 'dog';
  const requestedPcci = body.pcciRegistration || {};
  if (!pcciApplicable || requestedPcci.status !== 'yes') {
    payload.pcciRegistration = {
      status: pcciApplicable ? (requestedPcci.status || 'not_sure') : 'not_sure',
      registrationNumber: '', registeredName: '', certificateUrl: '', microchipNumber: '', informationStatus: 'not_provided'
    };
  } else {
    payload.pcciRegistration = {
      status: 'yes',
      registrationNumber: requestedPcci.registrationNumber || '',
      registeredName: requestedPcci.registeredName || '',
      certificateUrl: requestedPcci.certificateUrl || '',
      microchipNumber: requestedPcci.microchipNumber || '',
      informationStatus: 'customer_provided'
    };
  }
  return payload;
};

// GET /api/pet-profiles — list all saved pets for the authenticated customer
router.get('/', authenticate, async (req, res) => {
  try {
    const pets = await PetProfile.find({ owner: req.user._id })
      .sort({ lastBookedAt: -1, createdAt: -1 });
    res.json({ pets });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/pet-profiles — manually create a pet profile
router.post('/', authenticate, petValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }
  try {
    const pet = await PetProfile.create({ 
      owner: req.user._id, 
      ...profilePayload(req.body)
    });
    res.status(201).json({ pet });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/pet-profiles/:id — update a saved pet profile
router.put('/:id', authenticate, petValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }
  try {
    const pet = await PetProfile.findOne({ _id: req.params.id, owner: req.user._id });
    if (!pet) return res.status(404).json({ message: 'Pet profile not found' });
    
    Object.assign(pet, profilePayload(req.body));
    await pet.save();
    res.json({ pet });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/pet-profiles/:id — delete a saved pet profile
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const pet = await PetProfile.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!pet) return res.status(404).json({ message: 'Pet profile not found' });
    res.json({ message: 'Pet profile deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
