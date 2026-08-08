const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const PetProfile = require('../models/PetProfile');
const { body, validationResult } = require('express-validator');

const petValidation = [
  body('name').trim().notEmpty().withMessage('Pet name is required'),
  body('type').trim().notEmpty().withMessage('Pet type is required'),
  body('breed').optional({ checkFalsy: true }).trim(),
  body('size').optional().isIn(['Unknown', 'Small', 'Medium', 'Large', 'Extra Large']).withMessage('Invalid size'),
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
  body('weight').optional({ checkFalsy: true }).isFloat({ min: 0, max: 200 }).withMessage('Weight must be between 0 and 200'),
  body().custom(value => {
    if (!value.birthday && (value.approximateAge?.value === '' || value.approximateAge?.value === undefined || value.approximateAge?.value === null)) {
      throw new Error('Enter either a birth date or an approximate age.');
    }
    return true;
  })
];

const profileFields = ['name', 'type', 'breed', 'isMixedBreed', 'size', 'birthday', 'approximateAge', 'gender', 'weight', 'weightUnit', 'color', 'photo', 'vaccinationCards', 'vaccinationStatus', 'specialNotes', 'allergies', 'medicalConditions', 'groomingPreferences', 'behaviorNotes', 'emergencyContact', 'coat', 'groomingHistory', 'serviceNeeds', 'servicePreferences'];
const profilePayload = body => Object.fromEntries(profileFields.filter(key => body[key] !== undefined).map(key => [key, body[key]]));

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
