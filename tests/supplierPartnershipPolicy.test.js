const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const SupplierPartnership = require('../models/SupplierPartnership');
const PurchaseOrder = require('../models/PurchaseOrder');
const SupplierProduct = require('../models/SupplierProduct');
const Supplier = require('../models/Supplier');
const { migrateSupplierProductLivePetIndex } = require('../scripts/migrateSupplierProductLivePetIndex');
const { normalizeTerms, hashTerms, effectiveStatus, activeVersionForProducts } = require('../utils/supplierPartnershipPolicy');

const id = () => new mongoose.Types.ObjectId();
const offer = id();
const terms = () => ({
  coveredSupplierProducts: [String(offer)], pricingMethod: 'catalog_at_order',
  minimumOrderQuantity: 2, estimatedDeliveryDays: 3, paymentDeadlineDays: 7,
  effectiveFrom: '2026-10-01', effectiveUntil: '2027-10-01',
  priceUpdateConditions: 'Store reviews current catalog prices before submission.',
  inventoryResponsibilities: 'Supplier maintains available stock.',
  deliveryArrangements: 'Supplier arranges dispatch to the Store.',
  paymentTerms: 'External payment is recorded separately.',
  returnReplacementDamagePolicy: 'Damaged items are reviewed on receipt.',
  cancellationDisputeProcedure: 'Both parties discuss cancellation disputes.',
  terminationConditions: 'Either party may terminate with stated reason.',
  otherTerms: 'No additional terms.'
});
const agreement = ({ seller = true, supplier = true, status = 'active', version = 1 } = {}) => {
  const normalized = normalizeTerms(terms());
  const hash = hashTerms(normalized);
  return new SupplierPartnership({ store: id(), supplier: id(), requestedBy: id(),
    status, currentVersion: version,
    versions: Array.from({ length: version }, (_, index) => ({
      number: index + 1, terms: normalized, hash, author: id(), createdAt: new Date(),
      sellerAcceptance: seller ? { actor: id(), hash, acceptedAt: new Date() } : undefined,
      supplierAcceptance: supplier ? { actor: id(), hash, acceptedAt: new Date() } : undefined
    })) });
};

test('complete agreement terms normalize deterministically and hash consistently', () => {
  const first = normalizeTerms(terms());
  const second = normalizeTerms(terms());
  assert.equal(hashTerms(first), hashTerms(second));
  assert.deepEqual(first.coveredSupplierProducts, [String(offer)]);
});
test('missing coverage and unsupported fixed-price policies fail closed', () => {
  assert.throws(() => normalizeTerms({ ...terms(), coveredSupplierProducts: [] }), /covered/);
  assert.throws(() => normalizeTerms({ ...terms(), pricingMethod: 'fixed' }), /catalog pricing/);
});
test('invalid dates, text and numeric limits are rejected', () => {
  assert.throws(() => normalizeTerms({ ...terms(), effectiveUntil: '2025-01-01' }), /dates/);
  assert.throws(() => normalizeTerms({ ...terms(), minimumOrderQuantity: 0 }), /whole numbers/);
  assert.throws(() => normalizeTerms({ ...terms(), paymentTerms: '' }), /paymentTerms/);
});
test('partnership requires both parties to accept the same hash', () => {
  assert.ok(activeVersionForProducts(agreement(), [offer], new Date('2026-10-15')));
  assert.equal(activeVersionForProducts(agreement({ seller: false }), [offer], new Date('2026-10-15')), null);
  assert.equal(activeVersionForProducts(agreement({ supplier: false }), [offer], new Date('2026-10-15')), null);
  const mismatched = agreement();
  mismatched.versions[0].supplierAcceptance.hash = 'invalid';
  assert.equal(activeVersionForProducts(mismatched, [offer], new Date('2026-10-15')), null);
});
test('uncovered offer, pending, terminated and expired agreements cannot authorize procurement', () => {
  assert.equal(activeVersionForProducts(agreement(), [id()], new Date('2026-10-15')), null);
  assert.equal(activeVersionForProducts(agreement({ status: 'pending_seller' }), [offer], new Date('2026-10-15')), null);
  assert.equal(activeVersionForProducts(agreement({ status: 'terminated' }), [offer], new Date('2026-10-15')), null);
  assert.equal(effectiveStatus(agreement(), new Date('2028-01-01')), 'expired');
  assert.equal(activeVersionForProducts(agreement(), [offer], new Date('2028-01-01')), null);
});
test('historical purchase orders retain their agreement snapshot after a later version', () => {
  const first = agreement();
  const version = first.versions[0];
  const order = new PurchaseOrder({ orderNumber: 'PO-PARTNERSHIP-SNAPSHOT', store: first.store,
    supplier: first.supplier, seller: id(), subtotal: 10, totalCost: 10,
    items: [{ supplierProduct: offer, productName: 'Synthetic offer', quantity: 1, unitPrice: 10, totalPrice: 10 }],
    partnershipSnapshot: { agreement: first._id, version: 1, hash: version.hash,
      acceptedAt: { seller: new Date(), supplier: new Date() }, terms: version.terms } });
  assert.equal(order.validateSync(), undefined);
  first.currentVersion = 2;
  first.status = 'terminated';
  assert.equal(order.partnershipSnapshot.hash, version.hash);
  assert.equal(order.partnershipSnapshot.version, 1);
});
test('existing Supplier offers remain open unless explicitly configured', () => {
  const legacySupplier = new Supplier({ user: id(), businessName: 'Legacy Supplier', contactPerson: 'Owner',
    email: 'legacy@example.test', phone: '0000000000', address: { street: 'Test', city: 'Test', province: 'Test' } });
  assert.equal(legacySupplier.partnershipRequired, false);
  const legacy = new SupplierProduct({ supplier: id(), name: 'Existing offer', sku: 'EXISTING',
    category: 'pet_food', wholesalePrice: 100, availableStock: 10 });
  assert.equal(legacy.partnershipRequired, false);
  assert.equal(legacy.pet, undefined);
  assert.equal(legacy.validateSync(), undefined);
});
test('index migration refuses conflicting index options before any write', async () => {
  const legacy = { name: 'supplier_1_pet_1', key: { supplier: 1, pet: 1 }, unique: true, sparse: true };
  const replacement = { name: 'supplier_live_pet_unique', key: { supplier: 1, pet: 1 }, unique: true,
    partialFilterExpression: { pet: { $type: 'objectId' } } };
  let writes = 0;
  const collection = indexes => ({
    indexes: async () => indexes,
    createIndex: async () => { writes += 1; },
    dropIndex: async () => { writes += 1; }
  });
  assert.deepEqual(await migrateSupplierProductLivePetIndex(collection([legacy, replacement])),
    { legacyPresent: true, replacementPresent: true, changed: false });
  await assert.rejects(migrateSupplierProductLivePetIndex(collection([
    legacy, { ...replacement, partialFilterExpression: { ...replacement.partialFilterExpression, isActive: true } }
  ]), { apply: true }), /Unexpected replacement index shape/);
  await assert.rejects(migrateSupplierProductLivePetIndex(collection([
    { ...legacy, collation: { locale: 'en' } }, replacement
  ]), { apply: true }), /Unexpected legacy index shape/);
  assert.equal(writes, 0);
});
