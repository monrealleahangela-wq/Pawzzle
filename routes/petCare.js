const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const {
  createEncounter, getMedicalHistory, administerVaccine,
  addServiceUpdate, getServiceUpdates, getServiceTimeline, sendServiceMessage,
  authorizeServicePhotoUpload, uploadServicePhoto, createCertification
} = require('../controllers/petCareController');
const { uploadSingle, handleUploadError } = require('../middleware/upload');

const router = express.Router();
router.get('/pets/:petId/history', authenticate, requirePermission('clinical.view', 'clinical.manage', 'pets.own'), getMedicalHistory);
router.post('/pets/:petId/encounters', authenticate, requirePermission('clinical.manage'), createEncounter);
router.post('/pets/:petId/vaccinations', authenticate, requirePermission('clinical.manage'), administerVaccine);
router.post('/bookings/:bookingId/updates', authenticate, addServiceUpdate);
router.get('/bookings/:bookingId/updates', authenticate, getServiceUpdates);
router.get('/bookings/:bookingId/timeline', authenticate, getServiceTimeline);
router.post('/bookings/:bookingId/messages', authenticate, sendServiceMessage);
router.post('/bookings/:bookingId/photos', authenticate, authorizeServicePhotoUpload, uploadSingle, handleUploadError, uploadServicePhoto);
router.post('/pets/:petId/certifications', authenticate, requirePermission('pets.own', 'pets.manage'), createCertification);

module.exports = router;
