const roundMoney = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

const calculateTax = (amount, taxCode = 'NON_VAT') => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw new Error('Amount must be a non-negative number.');
  if (taxCode === 'VAT_12_INCLUSIVE') {
    const vatAmount = roundMoney(value * 12 / 112);
    return { taxCode, vatRate: 0.12, netAmount: roundMoney(value - vatAmount), vatAmount, grossAmount: roundMoney(value) };
  }
  if (taxCode === 'VAT_12_EXCLUSIVE') {
    const vatAmount = roundMoney(value * 0.12);
    return { taxCode, vatRate: 0.12, netAmount: roundMoney(value), vatAmount, grossAmount: roundMoney(value + vatAmount) };
  }
  return { taxCode, vatRate: 0, netAmount: roundMoney(value), vatAmount: 0, grossAmount: roundMoney(value) };
};

module.exports = { calculateTax, roundMoney };
