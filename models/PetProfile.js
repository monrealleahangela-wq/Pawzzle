const mongoose = require('mongoose');

const petProfileSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },   // Dog, Cat, etc.
  breed: { type: String, required: true, trim: true },
  size: { type: String, enum: ['Small', 'Medium', 'Large', 'Extra Large'], default: 'Small' },
  age: { type: Number, required: true, min: 0 },
  weight: { type: Number, required: true, min: 0 },
  specialNotes: { type: String, default: '' },
  // Track last booking to sort by recency in the UI
  lastBookedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

petProfileSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('PetProfile', petProfileSchema);
