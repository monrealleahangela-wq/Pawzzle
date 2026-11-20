const mongoose = require('mongoose');

const stringList = () => [{ type: String, trim: true, lowercase: true }];

const productRecommendationProfileSchema = new mongoose.Schema({
  subcategory: { type: String, trim: true, lowercase: true, default: '' },
  suitableSpecies: stringList(),
  suitableBreeds: stringList(),
  allBreeds: { type: Boolean, default: false },
  lifeStages: stringList(),
  petSizes: stringList(),
  activityLevels: stringList(),
  coatTypes: stringList(),
  skinTypes: stringList(),
  benefits: stringList(),
  safetyRestrictions: stringList(),
  warnings: stringList(),
  minWeightKg: { type: Number, min: 0 },
  maxWeightKg: { type: Number, min: 0 },
  minAgeMonths: { type: Number, min: 0 },
  maxAgeMonths: { type: Number, min: 0 },
  allergens: stringList(),
  proteinSources: stringList(),
  dietaryCharacteristics: stringList(),
  foodType: { type: String, trim: true, lowercase: true, default: '' },
  nutritionalInformation: { type: String, trim: true, default: '' },
  feedingGuidelines: { type: String, trim: true, default: '' },
  ingredients: { type: String, trim: true, default: '' },
  groomingPurposes: stringList(),
  toyMaterial: { type: String, trim: true, default: '' },
  chewingStrengths: stringList(),
  dimensions: { type: String, trim: true, default: '' },
  neckMinCm: { type: Number, min: 0 },
  neckMaxCm: { type: Number, min: 0 },
  chestMinCm: { type: Number, min: 0 },
  chestMaxCm: { type: Number, min: 0 },
  backLengthMinCm: { type: Number, min: 0 },
  backLengthMaxCm: { type: Number, min: 0 },
  adjustableSizing: { type: Boolean, default: false },
  material: { type: String, trim: true, default: '' },
  weightCapacityKg: { type: Number, min: 0 },
  activeIngredients: stringList(),
  intendedPurposes: stringList(),
  contraindications: stringList(),
  requiresVeterinaryGuidance: { type: Boolean, default: false },
  usageInstructions: { type: String, trim: true, default: '' },
  capacity: { type: String, trim: true, default: '' },
  physicalCompatibility: stringList()
}, { _id: false });

const productEvidenceSchema = new mongoose.Schema({
  kind: { type: String, enum: ['packaging', 'nutrition_label'], required: true },
  url: { type: String, required: true },
  originalName: { type: String, trim: true, default: '' },
  extractedText: { type: String, select: false, default: '' },
  reviewStatus: { type: String, enum: ['not_scanned', 'seller_review_required', 'confirmed', 'needs_correction'], default: 'not_scanned' },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: true });

module.exports = { productEvidenceSchema, productRecommendationProfileSchema };
