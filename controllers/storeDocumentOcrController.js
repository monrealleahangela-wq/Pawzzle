const { extractStoreDocument } = require('../utils/storeDocumentOcr');

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
    return res.json({ extraction });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : 'Store document OCR failed.',
      code: error.code
    });
  } finally {
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
  }
};

module.exports = { extractStoreDocumentFields };
