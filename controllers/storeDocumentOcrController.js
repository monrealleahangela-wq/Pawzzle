const { extractStoreDocument, extractionReview } = require('../utils/storeDocumentOcr');

const safeExpectedValues = value => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([key, fieldValue]) => /^[a-zA-Z][a-zA-Z0-9.]+$/.test(key) && typeof fieldValue === 'string')
      .map(([key, fieldValue]) => [key, fieldValue.slice(0, 300)]));
  } catch (_error) {
    return {};
  }
};

const extractStoreDocumentFields = async (req, res) => {
  const buffer = req.file?.buffer;
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Choose a JPG or PNG document image.' });
    }
    const extraction = await extractStoreDocument({
      documentType: req.body?.documentType,
      buffer,
      mimeType: String(req.file.mimetype || '').toLowerCase()
    });
    const review = extractionReview(extraction, safeExpectedValues(req.body?.expectedValues));
    return res.json({
      extraction: {
        documentType: extraction.documentType,
        fields: Object.fromEntries(Object.entries(extraction.fields || {}).map(([field, result]) => [field, { value: result.value }])),
        reviewRequired: (extraction.reviewRequired || []).map(item => ({ field: item.field })),
        review
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : 'The secure document check failed.',
      code: error.code
    });
  } finally {
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
  }
};

module.exports = { extractStoreDocumentFields, safeExpectedValues };
