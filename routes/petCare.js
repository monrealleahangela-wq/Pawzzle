const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const {
  createEncounter, getMedicalHistory, administerVaccine,
  addServiceUpdate, getServiceUpdates, createCertification
} = require('../controllers/petCareController');

const router = express.Router();
router.get('/pets/:petId/history', authenticate, requirePermission('clinical.view', 'clinical.manage', 'pets.own'), getMedicalHistory);
router.post('/pets/:petId/encounters', authenticate, requirePermission('clinical.manage'), createEncounter);
router.post('/pets/:petId/vaccinations', authenticate, requirePermission('clinical.manage'), administerVaccine);
router.post('/bookings/:bookingId/updates', authenticate, requirePermission('pet_updates.create'), addServiceUpdate);
router.get('/bookings/:bookingId/updates', authenticate, requirePermission('bookings.own', 'bookings.assigned', 'services.manage'), getServiceUpdates);
router.post('/pets/:petId/certifications', authenticate, requirePermission('pets.own', 'pets.manage'), createCertification);

module.exports = router;
