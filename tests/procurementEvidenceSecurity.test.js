const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  EVIDENCE_ACCESS_TTL_SECONDS,
  sanitizeReceivingReport,
  findEvidenceById,
  createTemporaryEvidenceUrl
} = require('../utils/procurementEvidence');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('procurement uploads use isolated authenticated Cloudinary storage while public uploads remain unchanged', () => {
  const upload = read('middleware/upload.js');
  const routes = read('routes/purchaseOrders.js');
  assert.match(upload, /folder: 'pawzzle\/procurement-evidence'[\s\S]*type: 'authenticated'/);
  assert.match(upload, /const uploadMultiple = uploadMulti\.array/);
  assert.match(upload, /const uploadProcurementEvidence = procurementEvidenceUpload\.array/);
  assert.match(routes, /authorizeReceivingInspectionUpload, uploadProcurementEvidence/);
  assert.match(routes, /authorizeResolutionReinspectionUpload, uploadProcurementEvidence/);
  assert.ok(routes.indexOf('authorizeReceivingInspectionUpload, uploadProcurementEvidence') > -1);
});

test('receiving report API metadata never exposes permanent URL or Cloudinary public ID', () => {
  const report = sanitizeReceivingReport({
    evidence: [{ _id: 'ev-1', url: 'https://example.test/permanent.jpg', publicId: 'secret-public-id', originalName: 'box.jpg' }],
    reinspections: [{ evidence: [{ _id: 'ev-2', url: 'https://example.test/retry.jpg', publicId: 'retry-id' }] }]
  });
  assert.equal(report.evidence[0].url, undefined);
  assert.equal(report.evidence[0].publicId, undefined);
  assert.equal(report.evidence[0].legacyPublicAsset, true);
  assert.equal(report.reinspections[0].evidence[0].url, undefined);
});

test('evidence lookup is restricted to the receiving report attached to the authorized PO', () => {
  const initial = { _id: 'ev-initial' };
  const replacement = { _id: 'ev-replacement' };
  const report = { evidence: [initial], reinspections: [{ evidence: [replacement] }] };
  assert.equal(findEvidenceById(report, 'ev-initial'), initial);
  assert.equal(findEvidenceById(report, 'ev-replacement'), replacement);
  assert.equal(findEvidenceById(report, 'another-store-evidence'), null);
});

test('temporary evidence access is signed, typed, and expires after the configured short lifetime', () => {
  let captured;
  const cloudinary = {
    utils: {
      private_download_url(publicId, format, options) {
        captured = { publicId, format, options };
        return 'https://api.cloudinary.test/signed-download';
      }
    }
  };
  const now = Date.UTC(2026, 0, 1);
  const result = createTemporaryEvidenceUrl({
    cloudinary,
    now,
    evidence: {
      publicId: 'pawzzle/procurement-evidence/asset',
      deliveryType: 'authenticated',
      resourceType: 'image',
      format: 'jpg'
    }
  });
  assert.equal(captured.publicId, 'pawzzle/procurement-evidence/asset');
  assert.equal(captured.options.type, 'authenticated');
  assert.equal(captured.options.expires_at, Math.floor(now / 1000) + EVIDENCE_ACCESS_TTL_SECONDS);
  assert.equal(result.legacyPublicAsset, false);
  assert.equal(new Date(result.expiresAt).getTime(), now + EVIDENCE_ACCESS_TTL_SECONDS * 1000);
});

test('missing/deleted database evidence and incomplete asset metadata fail closed', () => {
  assert.equal(findEvidenceById({ evidence: [] }, 'missing'), null);
  assert.throws(() => createTemporaryEvidenceUrl({
    cloudinary: { utils: { private_download_url() {} } },
    evidence: { format: 'jpg' }
  }), /metadata is incomplete/);
});

test('evidence access endpoint enforces PO party scope and does not accept a client URL', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const access = controller.match(/const getReceivingEvidenceAccess[\s\S]*?\n};/)?.[0] || '';
  assert.match(access, /userCanAccessPurchaseOrder/);
  assert.match(access, /purchaseOrder: order\._id[\s\S]*store: order\.store[\s\S]*supplier: order\.supplier/);
  assert.match(access, /findEvidenceById\(report, req\.params\.evidenceId\)/);
  assert.doesNotMatch(access, /req\.body\.(url|storeId|supplierId|publicId)/);
  assert.match(access, /Cache-Control', 'no-store, private'/);
});

test('frontend retrieves expiring access through Pawzzle instead of rendering persisted URLs', () => {
  const component = read('client/src/components/procurement/ProcurementEvidenceGallery.js');
  const supplier = read('client/src/pages/supplier/SupplierDashboard.js');
  const store = read('client/src/pages/admin/PurchaseOrders.js');
  const finance = read('client/src/pages/admin/FinanceManagement.js');
  assert.match(component, /purchaseOrderService\.getEvidenceAccess/);
  assert.match(component, /expiresAt/);
  assert.match(component, /ProcurementReinspectionEvidenceGallery/);
  assert.match(supplier, /ProcurementEvidenceGallery/);
  assert.match(store, /ProcurementEvidenceGallery/);
  assert.match(finance, /ProcurementEvidenceGallery/);
  assert.doesNotMatch(supplier, /href=\{image\.url\}/);
  assert.doesNotMatch(store, /href=\{image\.url\}/);
  assert.doesNotMatch(finance, /href=\{image\.url\}/);
});
