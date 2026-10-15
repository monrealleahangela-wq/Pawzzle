const service = require('../services/supplierPartnershipService');

const handle = operation => async (req, res) => {
  try {
    const agreement = await operation(req);
    res.status(req.method === 'POST' && !req.params.id ? 201 : 200).json(agreement);
  } catch (error) {
    if (!error.statusCode) console.error('Supplier partnership operation failed:', error);
    res.status(error.statusCode || 500).json({
      code: error.code || 'PARTNERSHIP_UNAVAILABLE',
      message: error.statusCode ? error.message : 'Unable to process the partnership request.'
    });
  }
};

module.exports = {
  list: handle(req => service.listAgreements({ user: req.user, side: req.params.side })),
  get: handle(req => service.getAgreement({ user: req.user, side: req.params.side, id: req.params.id })),
  create: handle(req => service.createRequest({ user: req.user, supplierId: req.body.supplierId, input: req.body.terms })),
  act: handle(req => service.act({ user: req.user, side: req.params.side, id: req.params.id,
    action: req.body.action, version: req.body.version, hash: req.body.hash,
    terms: req.body.terms, note: req.body.note }))
};
