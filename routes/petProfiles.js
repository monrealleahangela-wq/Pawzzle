const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const PetProfile = require('../models/PetProfile');
const { body, validationResult } = require('express-validator');

const petValidation = [
  body('name').trim().notEmpty().withMessage('Pet name is required'),
  body('type').trim().notEmpty().withMessage('Pet type is required'),
  body('breed').trim().notEmpty().withMessage('Pet breed is required'),
  body('size').isIn(['Small', 'Medium', 'Large', 'Extra Large']).withMessage('Invalid size'),
  body('birthday').isISO8601().toDate().withMessage('Valid birthday is required'),
  body('gender').isIn(['Male', 'Female']).withMessage('Invalid gender'),
  body('weight').isFloat({ min: 1, max: 50 }).withMessage('Weight must be between 1 and 50 kg'),
];

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
    const { name, type, breed, size, birthday, gender, weight, color, photo, vaccinationCards, specialNotes } = req.body;
    const pet = await PetProfile.create({ 
      owner: req.user._id, 
      name, type, breed, size, birthday, gender, weight, color, photo, vaccinationCards, 
      specialNotes: specialNotes || '' 
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
    
    const { name, type, breed, size, birthday, gender, weight, color, photo, vaccinationCards, specialNotes } = req.body;
    Object.assign(pet, { 
      name, type, breed, size, birthday, gender, weight, color, photo, vaccinationCards, 
      specialNotes: specialNotes || '' 
    });
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
