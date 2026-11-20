const { AnalyzeDocumentCommand, TextractClient } = require('@aws-sdk/client-textract');

const matchesImage = file => file?.buffer && ['image/jpeg', 'image/png'].includes(String(file.mimetype || '').toLowerCase());
const linesFrom = blocks => (blocks || []).filter(block => block.BlockType === 'LINE' && block.Text)
  .map(block => String(block.Text).trim()).filter(Boolean);

const extractProductLabel = async (req, res) => {
  const buffer = req.file?.buffer;
  try {
    if (!matchesImage(req.file)) return res.status(400).json({ message: 'Choose a clear JPG or PNG packaging or nutrition label image.' });
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    if (!region) return res.status(503).json({ message: 'Secure label reading is temporarily unavailable.', code: 'PRODUCT_LABEL_OCR_NOT_CONFIGURED' });
    const client = new TextractClient({ region });
    const response = await client.send(new AnalyzeDocumentCommand({
      Document: { Bytes: buffer },
      FeatureTypes: ['FORMS', 'TABLES']
    }));
    const lines = linesFrom(response.Blocks);
    const text = lines.join('\n').slice(0, 12000);
    const ingredientIndex = lines.findIndex(line => /^ingredients?\s*[:\-]?/i.test(line));
    const nutritionIndex = lines.findIndex(line => /nutrition(?:al)?\s+(?:facts|information|analysis)/i.test(line));
    return res.json({
      message: 'Label text was read. Review every suggestion before saving the product.',
      suggestions: {
        ingredients: ingredientIndex >= 0 ? lines.slice(ingredientIndex, Math.min(lines.length, ingredientIndex + 6)).join(' ') : '',
        nutritionalInformation: nutritionIndex >= 0 ? lines.slice(nutritionIndex, Math.min(lines.length, nutritionIndex + 10)).join(' ') : '',
        extractedText: text
      },
      requiresSellerReview: true
    });
  } catch (error) {
    console.error('Product label reading error:', error);
    return res.status(503).json({ message: 'Secure label reading is temporarily unavailable.', code: 'PRODUCT_LABEL_OCR_UNAVAILABLE' });
  } finally {
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
  }
};

module.exports = { extractProductLabel };
