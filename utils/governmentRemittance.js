const crypto = require('crypto');
const mongoose = require('mongoose');

const deterministicRemittanceId = ({ store, payrollPeriod, agency }) => {
  const identity = [store, payrollPeriod, agency]
    .map(value => String(value || '').trim())
    .join(':');
  if (identity.split(':').some(value => !value)) {
    throw Object.assign(new Error('Store, payroll period, and agency are required for a remittance identity.'), { statusCode: 400 });
  }
  return new mongoose.Types.ObjectId(
    crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)
  );
};

module.exports = { deterministicRemittanceId };
