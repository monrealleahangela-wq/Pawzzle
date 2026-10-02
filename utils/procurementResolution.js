const { roundMoney } = require('./taxCalculator');

const itemId = value => String(value?._id || value || '');

const completedReplacementQuantities = report => {
  const totals = new Map();
  for (const reinspection of report?.reinspections || []) {
    if (reinspection.processingStatus !== 'completed') continue;
    for (const item of reinspection.items || []) {
      const key = itemId(item.purchaseOrderItem);
      totals.set(key, (totals.get(key) || 0) + Number(item.acceptedQuantity || 0));
    }
  }
  return totals;
};

const approvedFinancialQuantities = report => {
  const totals = new Map();
  for (const submission of report?.resolutionSubmissions || []) {
    if (submission.type !== 'refund_credit'
        || submission.financialAdjustment?.status !== 'approved') continue;
    for (const item of submission.items || []) {
      const key = itemId(item.purchaseOrderItem);
      totals.set(key, (totals.get(key) || 0) + Number(item.proposedQuantity || 0));
    }
  }
  return totals;
};

const getResolutionQuantities = report => {
  const replacements = completedReplacementQuantities(report);
  const financial = approvedFinancialQuantities(report);
  return (report?.items || []).map(item => {
    const key = itemId(item.purchaseOrderItem);
    const orderedQuantity = Number(item.expectedQuantity || 0);
    const initiallyAcceptedQuantity = Number(item.acceptedQuantity || 0);
    const replacementAcceptedQuantity = Number(replacements.get(key) || 0);
    const financiallyResolvedQuantity = Number(financial.get(key) || 0);
    const unresolvedQuantity = Math.max(
      0,
      orderedQuantity - initiallyAcceptedQuantity - replacementAcceptedQuantity - financiallyResolvedQuantity
    );
    return {
      purchaseOrderItem: item.purchaseOrderItem,
      orderedQuantity,
      initiallyAcceptedQuantity,
      replacementAcceptedQuantity,
      financiallyResolvedQuantity,
      unresolvedQuantity
    };
  });
};

const hasUnresolvedQuantities = report => getResolutionQuantities(report)
  .some(item => item.unresolvedQuantity > 0);

const outstandingProcurementBalance = order => roundMoney(Math.max(
  0,
  Number(order?.totalCost || 0)
    - Number(order?.paidAmount || 0)
    - Number(order?.approvedAdjustmentTotal || 0)
));

module.exports = {
  getResolutionQuantities,
  hasUnresolvedQuantities,
  outstandingProcurementBalance
};
