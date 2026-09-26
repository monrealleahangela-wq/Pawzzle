const ACTIVE_SUPPLIER_STATUS = 'verified';

const getActiveSupplierFilter = (additional = {}) => ({
  ...additional,
  $or: [
    { supplierType: 'platform' },
    { supplierType: { $exists: false } }
  ],
  status: ACTIVE_SUPPLIER_STATUS,
  isActive: true,
  isDeleted: false
});

const getSelectableSupplierFilterForStore = (storeId, additional = {}) => ({
  ...additional,
  status: ACTIVE_SUPPLIER_STATUS,
  isActive: true,
  isDeleted: false,
  $or: [
    { supplierType: 'platform' },
    { supplierType: { $exists: false } },
    {
      supplierType: 'store_added',
      storeAssociations: { $elemMatch: { store: storeId, status: 'active' } }
    }
  ]
});

const isSupplierAvailable = supplier => Boolean(
  supplier
  && supplier.status === ACTIVE_SUPPLIER_STATUS
  && supplier.isActive === true
  && supplier.isDeleted !== true
);

const isSupplierSelectableForStore = (supplier, storeId) => {
  if (!isSupplierAvailable(supplier) || !storeId) return false;
  if (!supplier.supplierType || supplier.supplierType === 'platform') return true;
  return supplier.supplierType === 'store_added' && (supplier.storeAssociations || []).some(association => (
    String(association.store?._id || association.store) === String(storeId)
    && association.status === 'active'
  ));
};

const createLifecycleError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const applySupplierLifecycleAction = (supplier, action, {
  actorId,
  reason,
  now = new Date()
} = {}) => {
  if (!supplier) throw createLifecycleError('Supplier not found.', 404);
  if (supplier.isDeleted) {
    throw createLifecycleError('Archived suppliers cannot be restored through the suspension workflow.', 409);
  }

  const previous = {
    status: supplier.status,
    isActive: supplier.isActive
  };

  if (action === 'verify') {
    if (supplier.status === 'suspended') {
      throw createLifecycleError('Use Reactivate to restore a suspended supplier.', 409);
    }
    supplier.status = ACTIVE_SUPPLIER_STATUS;
    supplier.isActive = true;
    supplier.verifiedAt = now;
    supplier.verifiedBy = actorId;
  } else if (action === 'reject') {
    supplier.status = 'rejected';
    supplier.isActive = false;
    supplier.rejectionReason = reason || 'Application rejected.';
  } else if (action === 'request_resubmission') {
    if (supplier.supplierType === 'store_added') {
      throw createLifecycleError('Store-added suppliers do not use platform document verification.', 409);
    }
    supplier.status = 'resubmission_required';
    supplier.isActive = false;
    supplier.rejectionReason = reason || 'Please replace the requested application documents.';
  } else if (action === 'suspend') {
    if (supplier.status !== ACTIVE_SUPPLIER_STATUS || supplier.isActive !== true) {
      throw createLifecycleError('Only an active verified supplier can be suspended.', 409);
    }
    supplier.status = 'suspended';
    supplier.isActive = false;
    supplier.suspensionReason = reason || 'Account suspended.';
  } else if (action === 'reactivate') {
    if (supplier.status !== 'suspended') {
      throw createLifecycleError('Only a suspended supplier can be reactivated.', 409);
    }
    supplier.status = ACTIVE_SUPPLIER_STATUS;
    supplier.isActive = true;
    supplier.verifiedBy = actorId || supplier.verifiedBy;
  } else {
    throw createLifecycleError('Invalid action. Use verify, reject, request_resubmission, suspend, or reactivate.');
  }

  return {
    previous,
    current: { status: supplier.status, isActive: supplier.isActive }
  };
};

module.exports = {
  ACTIVE_SUPPLIER_STATUS,
  getActiveSupplierFilter,
  getSelectableSupplierFilterForStore,
  isSupplierAvailable,
  isSupplierSelectableForStore,
  applySupplierLifecycleAction
};
