const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const Store = require('../models/Store');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierPartnership = require('../models/SupplierPartnership');
const Notification = require('../models/Notification');
const ProcurementCart = require('../models/ProcurementCart');
const PurchaseOrder = require('../models/PurchaseOrder');
const { submitProcurementCart } = require('../controllers/purchaseOrderController');
const { updateSupplierProfile } = require('../controllers/supplierController');
const { migrateSupplierProductLivePetIndex } = require('../scripts/migrateSupplierProductLivePetIndex');
const { createRequest, act, listAgreements, getAgreement, partnershipSnapshotForOrder, reconcileExpiry } = require('../services/supplierPartnershipService');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const termsFor = offer => ({
  coveredSupplierProducts: [String(offer)], pricingMethod: 'catalog_at_order',
  minimumOrderQuantity: 1, estimatedDeliveryDays: 3, paymentDeadlineDays: 7,
  effectiveFrom: '2026-01-01', effectiveUntil: '2099-01-01',
  priceUpdateConditions: 'Store reviews updated catalog prices.',
  inventoryResponsibilities: 'Supplier manages available stock.',
  deliveryArrangements: 'Supplier arranges delivery to the Store.',
  paymentTerms: 'Payment is handled through existing purchase orders.',
  returnReplacementDamagePolicy: 'Damaged goods are reviewed on receipt.',
  cancellationDisputeProcedure: 'Parties resolve disputes independently.',
  terminationConditions: 'Either party may terminate with a reason.',
  otherTerms: 'No additional terms.'
});

test('isolated MongoDB enforces partnership versions, dual acceptance, concurrency and Store scope', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured; real concurrency check skipped'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_partnership_${crypto.randomBytes(7).toString('hex')}`;
  // Supplier has a pre-existing duplicate user_1 index declaration; only the
  // new partnership and notification indexes are needed for this synthetic suite.
  mongoose.set('autoIndex', false);
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
  try {
    await SupplierPartnership.createIndexes();
    await Notification.createIndexes();
    // Existing deployments can retain the old sparse index until maintenance.
    // The new partial index must coexist, and non-pet offers must omit pet.
    await SupplierProduct.collection.createIndex({ supplier: 1, pet: 1 },
      { unique: true, sparse: true, name: 'supplier_1_pet_1' });
    await SupplierProduct.createIndexes();
    const preview = await migrateSupplierProductLivePetIndex(SupplierProduct.collection);
    assert.equal(preview.legacyPresent, true);
    assert.equal(preview.changed, false);
    const migration = await migrateSupplierProductLivePetIndex(SupplierProduct.collection, { apply: true });
    assert.equal(migration.changed, true);
    assert.equal((await migrateSupplierProductLivePetIndex(SupplierProduct.collection, { apply: true })).changed, false);
    const sellerId = new mongoose.Types.ObjectId();
    const storeRecord = await Store.create({ owner: sellerId, name: 'Synthetic Store',
      slug: `synthetic-partnership-${crypto.randomBytes(5).toString('hex')}`,
      description: 'Synthetic isolated integration test Store', businessType: 'pet_store',
      operationalModules: ['products'], contactInfo: { phone: '0000000000', email: 'store@example.test',
        address: { street: 'Test', barangay: 'Test', city: 'Test', state: 'Test', zipCode: '0000', country: 'PH' } } });
    const store = storeRecord._id;
    const seller = { _id: sellerId, role: 'store_owner', store };
    const otherSeller = { _id: new mongoose.Types.ObjectId(), role: 'store_owner', store: new mongoose.Types.ObjectId() };
    const supplierUser = { _id: new mongoose.Types.ObjectId(), role: 'supplier' };
    const supplier = await Supplier.create({ user: supplierUser._id, businessName: 'Synthetic partner',
      contactPerson: 'Synthetic', email: `partnership-${crypto.randomBytes(5).toString('hex')}@example.test`,
      phone: '0000000000', address: { street: 'Test', city: 'Test', province: 'Test' },
      supplierType: 'platform', status: 'verified', isActive: true });
    const offer = await SupplierProduct.create({ supplier: supplier._id, name: 'Synthetic supply',
      sku: 'PARTNERSHIP-OFFER', category: 'pet_food', wholesalePrice: 50,
      availableStock: 5, partnershipRequired: true });
    const ordinaryOffer = await SupplierProduct.create({ supplier: supplier._id, name: 'Ordinary supply',
      sku: 'ORDINARY-OFFER', category: 'pet_food', wholesalePrice: 30,
      availableStock: 5 });
    assert.equal(ordinaryOffer.pet, undefined);
    assert.equal(ordinaryOffer.partnershipRequired, false);
    const input = termsFor(offer._id);
    await ProcurementCart.create({ user: seller._id, store,
      items: [{ supplierProduct: offer._id, supplier: supplier._id,
        quantity: 1, addedUnitPrice: 50 }] });
    const submit = async (actor = seller) => {
      const result = { status: 200 };
      const response = { headersSent: false, status(code) { result.status = code; return this; },
        json(body) { result.body = body; return this; } };
      await submitProcurementCart({ user: actor, body: {} }, response);
      return result;
    };
    const created = await createRequest({ user: seller, supplierId: supplier._id, input });
    assert.equal(created.status, 'requested');
    assert.equal(created.versions[0].terms.catalogPriceAtProposal[0].unitPrice, 50);
    assert.equal((await getAgreement({ user: seller, side: 'seller', id: created._id }))._id.toString(), String(created._id));
    const blockedOrder = await submit();
    assert.equal(blockedOrder.status, 409);
    assert.equal(blockedOrder.body.code, 'PARTNERSHIP_REQUIRED');
    assert.equal(await PurchaseOrder.countDocuments({ store }), 0);
    const cart = await ProcurementCart.findOne({ user: seller._id, store });
    cart.items[0].supplierProduct = ordinaryOffer._id;
    cart.items[0].addedUnitPrice = 30;
    await cart.save();
    assert.equal((await submit()).status, 201);
    const ordinaryOrder = await PurchaseOrder.findOne({ store, 'items.supplierProduct': ordinaryOffer._id });
    assert.equal(ordinaryOrder.partnershipSnapshot?.agreement, undefined);
    const clearedCart = await ProcurementCart.findOne({ user: seller._id, store });
    const setSupplierRequirement = async (actor, required) => {
      const result = { status: 200 };
      await updateSupplierProfile({ user: actor, body: { partnershipRequired: required } }, {
        status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; }
      });
      return result;
    };
    assert.equal((await setSupplierRequirement({ _id: new mongoose.Types.ObjectId(), role: 'supplier' }, true)).status, 404);
    assert.equal((await setSupplierRequirement(supplierUser, 'yes')).status, 400);
    assert.equal((await setSupplierRequirement(supplierUser, true)).status, 200);
    clearedCart.items = [{ supplierProduct: ordinaryOffer._id, supplier: supplier._id, quantity: 1, addedUnitPrice: 30 }];
    await clearedCart.save();
    const globallyBlocked = await submit();
    assert.equal(globallyBlocked.status, 409);
    assert.equal(globallyBlocked.body.code, 'PARTNERSHIP_REQUIRED');
    assert.equal((await setSupplierRequirement(supplierUser, false)).status, 200);
    const currentCart = await ProcurementCart.findOne({ user: seller._id, store });
    currentCart.items = [{ supplierProduct: offer._id, supplier: supplier._id, quantity: 1, addedUnitPrice: 50 }];
    await currentCart.save();
    assert.equal(await SupplierPartnership.countDocuments({ store, supplier: supplier._id }), 1);
    await assert.rejects(createRequest({ user: seller, supplierId: supplier._id, input }), error => error.code === 'PARTNERSHIP_EXISTS');
    await assert.rejects(listAgreements({ user: otherSeller, side: 'supplier' }), error => error.statusCode === 403);
    await assert.rejects(act({ user: otherSeller, side: 'seller', id: created._id,
      action: 'accept', version: 1, hash: created.versions[0].hash }), error => error.statusCode === 403);
    await assert.rejects(partnershipSnapshotForOrder({ store, supplier: supplier._id,
      requiredProducts: [offer._id], session: null }), error => error.code === 'PARTNERSHIP_REQUIRED');

    const supplierAccepted = await act({ user: supplierUser, side: 'supplier', id: created._id,
      action: 'accept', version: 1, hash: created.versions[0].hash });
    assert.equal(supplierAccepted.status, 'pending_seller');
    const replay = await act({ user: supplierUser, side: 'supplier', id: created._id,
      action: 'accept', version: 1, hash: created.versions[0].hash });
    assert.equal(replay.history.length, supplierAccepted.history.length);
    const active = await act({ user: seller, side: 'seller', id: created._id,
      action: 'accept', version: 1, hash: created.versions[0].hash });
    assert.equal(active.status, 'active');
    assert.equal(active.versions[0].sellerAcceptance.hash, active.versions[0].supplierAcceptance.hash);
    let snapshot;
    await mongoose.connection.transaction(async session => {
      snapshot = await partnershipSnapshotForOrder({ store, supplier: supplier._id,
        requiredProducts: [offer._id], session });
    });
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.hash, active.versions[0].hash);
    assert.equal((await SupplierPartnership.findById(active._id)).status, 'active');
    const submitted = await submit();
    assert.equal(submitted.status, 201);
    const persistedOrder = await PurchaseOrder.findOne({ store, 'items.supplierProduct': offer._id });
    assert.equal(persistedOrder.partnershipSnapshot.version, 1);
    assert.equal(persistedOrder.partnershipSnapshot.hash, active.versions[0].hash);
    assert.equal(persistedOrder.partnershipSnapshot.terms.pricingMethod, 'catalog_at_order');

    const revised = await act({ user: seller, side: 'seller', id: active._id,
      action: 'revise', version: 1, hash: active.versions[0].hash,
      terms: { ...input, deliveryArrangements: 'Supplier arranges revised dispatch.' } });
    assert.equal(revised.currentVersion, 2);
    assert.equal(revised.status, 'pending_supplier');
    assert.equal(revised.versions[0].hash, active.versions[0].hash);
    assert.equal(revised.versions[0].sellerAcceptance.hash, active.versions[0].hash);
    assert.equal(revised.versions[1].sellerAcceptance, undefined);
    await assert.rejects(partnershipSnapshotForOrder({ store, supplier: supplier._id,
      requiredProducts: [offer._id], session: null }), error => error.code === 'PARTNERSHIP_REQUIRED');
    await assert.rejects(act({ user: supplierUser, side: 'supplier', id: created._id,
      action: 'accept', version: 1, hash: active.versions[0].hash }), error => error.code === 'PARTNERSHIP_STALE_VERSION');

    const calls = [
      act({ user: supplierUser, side: 'supplier', id: created._id, action: 'accept', version: 2, hash: revised.versions[1].hash }),
      act({ user: seller, side: 'seller', id: created._id, action: 'accept', version: 2, hash: revised.versions[1].hash })
    ];
    const concurrent = await Promise.allSettled(calls);
    for (const failed of concurrent.filter(result => result.status === 'rejected')) {
      assert.match(String(failed.reason), /WriteConflict|NoSuchTransaction|version|transaction|modified/i);
    }
    // Retrying a conflicting acceptance is safe and never duplicates history.
    await act({ user: supplierUser, side: 'supplier', id: created._id,
      action: 'accept', version: 2, hash: revised.versions[1].hash });
    await act({ user: seller, side: 'seller', id: created._id,
      action: 'accept', version: 2, hash: revised.versions[1].hash });
    const latest = await SupplierPartnership.findById(created._id);
    assert.equal(latest.status, 'active');
    assert.equal(latest.history.filter(event => event.action === 'activated').length, 2);
    assert.equal(latest.history.filter(event => event.action === 'seller_accepted' && event.version === 2).length, 1);
    assert.equal(latest.history.filter(event => event.action === 'supplier_accepted' && event.version === 2).length, 1);

    const terminated = await act({ user: seller, side: 'seller', id: created._id,
      action: 'terminate', version: 2, hash: latest.versions[1].hash, note: 'Synthetic test termination' });
    assert.equal(terminated.status, 'terminated');
    await assert.rejects(partnershipSnapshotForOrder({ store, supplier: supplier._id,
      requiredProducts: [offer._id], session: null }), error => error.code === 'PARTNERSHIP_REQUIRED');
    assert.equal(snapshot.version, 1); // historical PO snapshots remain independent
    assert.equal((await PurchaseOrder.findById(persistedOrder._id)).partnershipSnapshot.hash, active.versions[0].hash);
    const supplierNotices = await Notification.find({ recipient: supplierUser._id, relatedId: created._id });
    assert.ok(supplierNotices.length >= 2);
    const sellerNotices = await Notification.find({ recipient: seller._id, relatedId: created._id });
    assert.ok(sellerNotices.length >= 2);
    assert.equal(await Notification.countDocuments({ recipient: otherSeller._id, relatedId: created._id }), 0);

    const secondStore = await Store.create({ owner: otherSeller._id, name: 'Second Synthetic Store',
      slug: `synthetic-partnership-second-${crypto.randomBytes(5).toString('hex')}`,
      description: 'Second isolated integration test Store', businessType: 'pet_store',
      operationalModules: ['products'], contactInfo: { phone: '0000000000', email: 'second@example.test',
        address: { street: 'Test', barangay: 'Test', city: 'Test', state: 'Test', zipCode: '0000', country: 'PH' } } });
    otherSeller.store = secondStore._id;
    await assert.rejects(getAgreement({ user: otherSeller, side: 'seller', id: created._id }), error => error.statusCode === 404);
    await assert.rejects(act({ user: otherSeller, side: 'seller', id: created._id,
      action: 'accept', version: 1, hash: created.versions[0].hash }), error => error.statusCode === 404);
    const second = await createRequest({ user: otherSeller, supplierId: supplier._id, input });
    const revisionRequested = await act({ user: supplierUser, side: 'supplier', id: second._id,
      action: 'request_revision', version: 1, hash: second.versions[0].hash, note: 'Clarify delivery' });
    assert.equal(revisionRequested.status, 'revision_requested');
    const secondRevision = await act({ user: otherSeller, side: 'seller', id: second._id,
      action: 'revise', version: 1, hash: second.versions[0].hash,
      terms: { ...input, deliveryArrangements: 'Supplier dispatches revised shipment.' } });
    assert.equal(secondRevision.currentVersion, 2);
    assert.equal(secondRevision.versions[1].sellerAcceptance, undefined);
    const rejected = await act({ user: supplierUser, side: 'supplier', id: second._id,
      action: 'reject', version: 2, hash: secondRevision.versions[1].hash, note: 'Cannot commit to dispatch' });
    assert.equal(rejected.status, 'rejected');
    await assert.rejects(act({ user: otherSeller, side: 'seller', id: second._id,
      action: 'accept', version: 2, hash: secondRevision.versions[1].hash }), error => error.code === 'PARTNERSHIP_INVALID_TRANSITION');
    const thirdRevision = await act({ user: otherSeller, side: 'seller', id: second._id,
      action: 'revise', version: 2, hash: secondRevision.versions[1].hash,
      terms: { ...input, minimumOrderQuantity: 2,
        deliveryArrangements: 'Supplier dispatches after written scheduling.' } });
    await act({ user: supplierUser, side: 'supplier', id: second._id,
      action: 'accept', version: 3, hash: thirdRevision.versions[2].hash });
    const secondActive = await act({ user: otherSeller, side: 'seller', id: second._id,
      action: 'accept', version: 3, hash: thirdRevision.versions[2].hash });
    assert.equal(secondActive.status, 'active');
    await ProcurementCart.create({ user: otherSeller._id, store: secondStore._id,
      items: [{ supplierProduct: offer._id, supplier: supplier._id,
        quantity: 1, addedUnitPrice: 50 }] });
    const belowMinimum = await submit(otherSeller);
    assert.equal(belowMinimum.status, 409);
    assert.equal(belowMinimum.body.code, 'PARTNERSHIP_MINIMUM_NOT_MET');
    assert.equal(await PurchaseOrder.countDocuments({ store: secondStore._id }), 0);
    await reconcileExpiry(new Date('2100-01-01'));
    const expired = await SupplierPartnership.findById(second._id);
    assert.equal(expired.status, 'expired');
    assert.equal(expired.history.filter(event => event.action === 'expired').length, 1);
    await reconcileExpiry(new Date('2100-01-02'));
    assert.equal((await SupplierPartnership.findById(second._id)).history.filter(event => event.action === 'expired').length, 1);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
