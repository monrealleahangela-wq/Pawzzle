const mongoose = require('mongoose');

const privateStoreDocumentSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  originalName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true, min: 1 },
  encryptedContent: { type: Buffer, required: true, select: false },
  initializationVector: { type: Buffer, required: true, select: false },
  authenticationTag: { type: Buffer, required: true, select: false }
}, { timestamps: true });

module.exports = mongoose.model('PrivateStoreDocument', privateStoreDocumentSchema);
