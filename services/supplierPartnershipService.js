const mongoose = require('mongoose');
const SupplierPartnership = require('../models/SupplierPartnership');
const SupplierProduct = require('../models/SupplierProduct');
const Supplier = require('../models/Supplier');
const Store = require('../models/Store');
require('../models/User'); // Register history.actor for standalone service use.
const resolveStore = require('../utils/resolveStore');
const { isSupplierSelectableForStore } = require('../utils/supplierLifecycle');
const { createNotification } = require('../controllers/notificationController');
const { error, normalizeTerms, hashTerms, effectiveStatus, activeVersionForProducts } = require('../utils/supplierPartnershipPolicy');

const storeRoles = new Set(['admin', 'store_owner']);
const noteFor = input => {
  if (input === undefined || input === null) return '';
  if (typeof input !== 'string' || input.length > 1000) throw error('Note must be at most 1000 characters.');
  return input.trim();
};
const storeActor = async user => {
  if (!storeRoles.has(user.role)) throw error('Only the Store Owner or Admin may manage partnership agreements.', 403, 'PARTNERSHIP_FORBIDDEN');
  const resolved = await resolveStore({ user }, { allowExplicitStore: false });
  const storeId = resolved?._id || resolved;
  if (!storeId || !mongoose.isValidObjectId(storeId)) throw error('Authorized Store not found.', 403, 'PARTNERSHIP_FORBIDDEN');
  const store = await Store.findOne({ _id: storeId, isDeleted: { $ne: true }, isActive: true }).select('_id');
  if (!store) throw error('Authorized active Store not found.', 403, 'PARTNERSHIP_FORBIDDEN');
  return store._id;
};
const supplierActor = async user => {
  if (user.role !== 'supplier') throw error('Only a Supplier account may review supplier agreements.', 403, 'PARTNERSHIP_FORBIDDEN');
  const supplier = await Supplier.findOne({ user: user._id, isDeleted: { $ne: true } });
  if (!supplier) throw error('Supplier account not found.', 403, 'PARTNERSHIP_FORBIDDEN');
  return supplier;
};
const access = async (user, agreement, side) => {
  if (side === 'seller') {
    const storeId = await storeActor(user);
    if (String(storeId) !== String(agreement.store?._id || agreement.store)) throw error('Agreement not found.', 404, 'PARTNERSHIP_NOT_FOUND');
  } else {
    const supplier = await supplierActor(user);
    if (String(supplier._id) !== String(agreement.supplier?._id || agreement.supplier)) throw error('Agreement not found.', 404, 'PARTNERSHIP_NOT_FOUND');
  }
};
const validateCoverage = async (supplierId, terms, session) => {
  const query = SupplierProduct.find({
    _id: { $in: terms.coveredSupplierProducts }, supplier: supplierId,
    isDeleted: { $ne: true }, isActive: true
  }).select('_id name sku wholesalePrice unitOfMeasure');
  const offers = await (session ? query.session(session) : query);
  if (offers.length !== terms.coveredSupplierProducts.length) throw error('Covered products must be active offers of this Supplier.', 400, 'PARTNERSHIP_COVERAGE_INVALID');
  const byId = new Map(offers.map(offer => [String(offer._id), offer]));
  // Pricing is explicitly catalog-at-order; these values are historical
  // proposal evidence, never a replacement for authoritative PO pricing.
  terms.catalogPriceAtProposal = terms.coveredSupplierProducts.map(id => {
    const offer = byId.get(id);
    return { supplierProduct: id, name: offer.name, sku: offer.sku,
      unitPrice: offer.wholesalePrice, unitOfMeasure: offer.unitOfMeasure };
  });
};
const newVersion = (number, terms, author, now) => ({
  number, terms, hash: hashTerms(terms), author, createdAt: now
});
const display = agreement => {
  const result = agreement.toObject ? agreement.toObject() : agreement;
  return { ...result, effectiveStatus: effectiveStatus(result) };
};
const notify = async (agreement, action) => {
  const [supplier, store] = await Promise.all([
    Supplier.findById(agreement.supplier).select('user businessName').lean(),
    Store.findById(agreement.store).select('owner name').lean()
  ]);
  const recipients = action === 'requested' || action === 'seller_revised' || action === 'seller_accepted'
    ? [supplier?.user]
    : action === 'supplier_accepted' || action === 'revision_requested' || action === 'rejected'
      ? [store?.owner]
      : [store?.owner, supplier?.user];
  await Promise.allSettled(recipients.filter(Boolean).map(recipient => createNotification({
    recipient, type: 'supply_alert', relatedId: agreement._id, relatedModel: 'SupplierPartnership',
    title: 'Supplier partnership update',
    message: `${store?.name || 'Store'} and ${supplier?.businessName || 'Supplier'}: ${action.replaceAll('_', ' ')}.`,
    targetUrl: recipient.toString() === String(supplier?.user)
      ? `/supplier/dashboard?partnership=${agreement._id}`
      : `/admin/purchase-orders?tab=suppliers&partnership=${agreement._id}`,
    dedupeKey: `supplier-partnership:${agreement._id}:${agreement.revision}:${action}:${recipient}`
  })));
};
const notifySafely = async (agreement, action) => {
  try { await notify(agreement, action); }
  catch (failure) { console.error('Supplier partnership notification delivery failed:', failure.message); }
};

const createRequest = async ({ user, supplierId, input }) => {
  const storeId = await storeActor(user);
  if (!mongoose.isValidObjectId(supplierId)) throw error('Invalid Supplier.', 400);
  const supplier = await Supplier.findById(supplierId);
  if (!isSupplierSelectableForStore(supplier, storeId)) throw error('Supplier is not eligible for this Store.', 403, 'PARTNERSHIP_SUPPLIER_INELIGIBLE');
  const terms = normalizeTerms(input);
  await validateCoverage(supplierId, terms);
  const now = new Date();
  let agreement;
  try {
    agreement = await SupplierPartnership.create({
      store: storeId, supplier: supplierId, requestedBy: user._id,
      status: 'requested', currentVersion: 1, revision: 1,
      versions: [newVersion(1, terms, user._id, now)],
      history: [{ action: 'requested', actor: user._id, version: 1, at: now }]
    });
  } catch (cause) {
    if (cause.code === 11000) throw error('A partnership for this Store and Supplier already exists. Review or revise it.', 409, 'PARTNERSHIP_EXISTS');
    throw cause;
  }
  await notifySafely(agreement, 'requested');
  return display(agreement);
};

const listAgreements = async ({ user, side }) => {
  const filter = side === 'seller'
    ? { store: await storeActor(user) }
    : { supplier: (await supplierActor(user))._id };
  const rows = await SupplierPartnership.find(filter).sort({ updatedAt: -1 }).limit(100)
    .populate('store', 'name').populate('supplier', 'businessName')
    .populate('history.actor', 'firstName lastName');
  return rows.map(display);
};
const getAgreement = async ({ user, side, id }) => {
  if (!mongoose.isValidObjectId(id)) throw error('Agreement not found.', 404, 'PARTNERSHIP_NOT_FOUND');
  const agreement = await SupplierPartnership.findById(id).populate('store', 'name')
    .populate('supplier', 'businessName').populate('history.actor', 'firstName lastName');
  if (!agreement) throw error('Agreement not found.', 404, 'PARTNERSHIP_NOT_FOUND');
  // Access checks compare IDs, including populated references.
  await access(user, agreement, side);
  return display(agreement);
};

const act = async ({ user, side, id, action, version, hash, terms: rawTerms, note: rawNote }) => {
  if (!mongoose.isValidObjectId(id)) throw error('Agreement not found.', 404, 'PARTNERSHIP_NOT_FOUND');
  if (!['accept', 'revise', 'request_revision', 'reject', 'terminate'].includes(action)) throw error('Invalid partnership action.');
  const note = noteFor(rawNote);
  if (!Number.isSafeInteger(Number(version)) || Number(version) < 1 || typeof hash !== 'string') {
    throw error('Current version number and integrity hash are required.', 409, 'PARTNERSHIP_STALE_VERSION');
  }
  let changed = false;
  let agreement;
  await mongoose.connection.transaction(async session => {
    agreement = await SupplierPartnership.findById(id).session(session);
    if (!agreement) throw error('Agreement not found.', 404, 'PARTNERSHIP_NOT_FOUND');
    await access(user, agreement, side);
    const current = agreement.versions[agreement.currentVersion - 1];
    if (Number(version) !== agreement.currentVersion || hash !== current.hash || hashTerms(current.terms) !== current.hash) {
      throw error('Agreement terms changed. Reload the current version.', 409, 'PARTNERSHIP_STALE_VERSION');
    }
    const currentStatus = effectiveStatus(agreement);
    if (currentStatus === 'expired' || currentStatus === 'terminated') throw error('This agreement is no longer active.', 409, 'PARTNERSHIP_CLOSED');
    const now = new Date();
    if (action === 'accept') {
      if (new Date(current.terms.effectiveUntil) <= now) {
        throw error('This agreement has passed its end date. Submit a new version.', 409, 'PARTNERSHIP_EXPIRED');
      }
      if (['rejected', 'revision_requested', 'active'].includes(currentStatus)) {
        if (currentStatus === 'active' && current[side === 'seller' ? 'sellerAcceptance' : 'supplierAcceptance']?.hash === hash) return;
        throw error('This agreement is not awaiting acceptance.', 409, 'PARTNERSHIP_INVALID_TRANSITION');
      }
      const key = side === 'seller' ? 'sellerAcceptance' : 'supplierAcceptance';
      if (current[key]) {
        if (current[key].hash === hash && String(current[key].actor) === String(user._id)) return;
        throw error('This version has already been accepted by this party.', 409, 'PARTNERSHIP_REPLAY');
      }
      current[key] = { actor: user._id, hash, acceptedAt: now };
      if (current.sellerAcceptance && current.supplierAcceptance) {
        const supplier = await Supplier.findById(agreement.supplier).session(session);
        if (!isSupplierSelectableForStore(supplier, agreement.store)) {
          throw error('Supplier is no longer eligible for this Store.', 409, 'PARTNERSHIP_SUPPLIER_INELIGIBLE');
        }
      }
      agreement.status = current.sellerAcceptance && current.supplierAcceptance
        ? 'active' : side === 'seller' ? 'pending_supplier' : 'pending_seller';
    } else if (action === 'request_revision') {
      if (side !== 'supplier' || !['requested', 'pending_supplier', 'pending_seller'].includes(currentStatus) || !note) {
        throw error('Supplier revision request requires a reason and a pending agreement.', 409, 'PARTNERSHIP_INVALID_TRANSITION');
      }
      agreement.status = 'revision_requested';
    } else if (action === 'revise') {
      if (side !== 'seller' || !['requested', 'pending_supplier', 'pending_seller', 'revision_requested', 'rejected', 'active'].includes(currentStatus)) {
        throw error('Only this Store may submit a new agreement version.', 409, 'PARTNERSHIP_INVALID_TRANSITION');
      }
      const terms = normalizeTerms(rawTerms);
      await validateCoverage(agreement.supplier, terms, session);
      if (hashTerms(terms) === current.hash) throw error('Revised terms must differ from the current version.', 409, 'PARTNERSHIP_NO_CHANGE');
      agreement.currentVersion += 1;
      agreement.versions.push(newVersion(agreement.currentVersion, terms, user._id, now));
      agreement.status = 'pending_supplier';
    } else if (action === 'reject') {
      if (side !== 'supplier' || !['requested', 'pending_supplier', 'pending_seller', 'revision_requested'].includes(currentStatus) || !note) {
        throw error('Only the Supplier may reject a pending agreement with a reason.', 409, 'PARTNERSHIP_INVALID_TRANSITION');
      }
      agreement.status = 'rejected';
    } else if (action === 'terminate') {
      if (currentStatus !== 'active' || !note) throw error('Active partnership termination requires a reason.', 409, 'PARTNERSHIP_INVALID_TRANSITION');
      agreement.status = 'terminated';
      agreement.terminatedAt = now;
    }
    agreement.revision += 1;
    agreement.history.push({ action: action === 'revise' ? 'seller_revised' : action === 'accept' ? `${side}_accepted` : action, actor: user._id, version: agreement.currentVersion, note, at: now });
    if (agreement.status === 'active' && action === 'accept') {
      agreement.history.push({ action: 'activated', actor: user._id, version: agreement.currentVersion, at: now });
    }
    await agreement.save({ session });
    changed = true;
  });
  if (changed) {
    await notifySafely(agreement, action === 'accept' ? `${side}_accepted` : action === 'revise' ? 'seller_revised' : action);
    if (agreement.status === 'active' && action === 'accept') await notifySafely(agreement, 'activated');
  }
  return display(agreement);
};

const partnershipSnapshotForOrder = async ({ store, supplier, requiredProducts, session, now = new Date() }) => {
  if (!requiredProducts.length) return null;
  const agreement = await SupplierPartnership.findOne({ store, supplier }).session(session);
  const version = activeVersionForProducts(agreement, requiredProducts, now);
  if (!version) throw error('An active, mutually accepted partnership covering these Supplier offers is required.', 409, 'PARTNERSHIP_REQUIRED');
  if (requiredProducts.length && version.terms.minimumOrderQuantity > 1) {
    // Per-offer quantity is validated at the cart boundary; agreement minimum is checked by caller.
  }
  // The transactional write forces a write conflict with concurrent termination or revision.
  const claim = await SupplierPartnership.updateOne({ _id: agreement._id, revision: agreement.revision, status: 'active' },
    { $inc: { revision: 1 }, $set: { lastProcurementAt: now } }, { session });
  if (claim.modifiedCount !== 1) throw error('Partnership changed during submission. Retry after review.', 409, 'PARTNERSHIP_CHANGED');
  return { agreement: agreement._id, version: version.number, hash: version.hash,
    acceptedAt: { seller: version.sellerAcceptance.acceptedAt, supplier: version.supplierAcceptance.acceptedAt },
    terms: structuredClone(version.terms) };
};

const reconcileExpiry = async (now = new Date()) => {
  for await (const agreement of SupplierPartnership.find({ status: 'active' }).cursor()) {
    const until = new Date(agreement.versions[agreement.currentVersion - 1].terms.effectiveUntil);
    if (until <= now) {
      const result = await SupplierPartnership.findOneAndUpdate({ _id: agreement._id, status: 'active', revision: agreement.revision },
        { $set: { status: 'expired', expiredAt: now }, $inc: { revision: 1 },
          $push: { history: { action: 'expired', version: agreement.currentVersion, at: now } } }, { new: true });
      if (result) await notifySafely(result, 'expired');
    } else if (until.getTime() - now.getTime() <= 7 * 86400000) {
      // A stable key deduplicates reminders across server restarts and job runs.
      const [supplier, store] = await Promise.all([
        Supplier.findById(agreement.supplier).select('user').lean(), Store.findById(agreement.store).select('owner').lean()
      ]);
      await Promise.allSettled([supplier?.user, store?.owner].filter(Boolean).map(recipient => createNotification({
        recipient, type: 'supply_alert', relatedId: agreement._id, relatedModel: 'SupplierPartnership',
        title: 'Supplier partnership ending soon', message: 'Review this agreement before its scheduled end date.',
        targetUrl: String(recipient) === String(supplier?.user)
          ? `/supplier/dashboard?partnership=${agreement._id}`
          : `/admin/purchase-orders?tab=suppliers&partnership=${agreement._id}`,
        dedupeKey: `supplier-partnership:${agreement._id}:${agreement.currentVersion}:expiring:${recipient}`
      })));
    }
  }
};

module.exports = { storeActor, supplierActor, createRequest, listAgreements, getAgreement, act, partnershipSnapshotForOrder, reconcileExpiry };
