const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const DeliveryFeeService = require('../services/deliveryFeeService');
const Review = require('../models/Review');
const Delivery = require('../models/Delivery');
const {
  requiresPlatformVerification,
  getProfessionalVerificationStatus,
  isProfessionallyAssignable
} = require('../utils/staffSpecialization');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('delivery formula charges distance and only items after the first', () => {
  const rule = { baseFee: 40, includedKilometers: 1, ratePerKilometer: 10, additionalItemFee: 5, minimumFee: 0 };
  const one = DeliveryFeeService.__test.calculateBreakdown({ rule, distanceKm: 4, itemQuantity: 1 });
  const many = DeliveryFeeService.__test.calculateBreakdown({ rule, distanceKm: 4, itemQuantity: 4 });
  assert.equal(one.breakdown.distanceCharge, 30);
  assert.equal(one.breakdown.itemCharge, 0);
  assert.equal(one.finalShippingFee, 70);
  assert.equal(many.breakdown.itemCharge, 15);
  assert.equal(many.finalShippingFee, 85);
});

test('delivery distance and coordinate validation do not fabricate map locations', () => {
  const { haversineKm, validateCoordinates } = DeliveryFeeService.__test;
  assert.equal(validateCoordinates(), false);
  assert.equal(validateCoordinates({ lat: null, lng: null }), false);
  assert.ok(haversineKm({ lat: 14.3, lng: 120.9 }, { lat: 14.4, lng: 120.9 }) > 10);
  assert.doesNotMatch(source('client/src/pages/customer/Checkout.js'), /14\.3121|120\.9326/);
});

test('authoritative order pricing ignores submitted shipping amounts and snapshots the calculation', () => {
  const controller = source('controllers/orderController.js');
  const pricing = source('services/orderPricingService.js');
  assert.match(controller, /const createOrder = async/);
  assert.match(controller, /shippingFee: breakdown\.deliveryFee/);
  assert.match(controller, /deliveryFeeCalculation: pricing\.deliveryFeeCalculation/);
  assert.doesNotMatch(pricing, /req\.body\.shippingFee/);
  assert.match(pricing, /totalItemQuantity/);
});

test('delivery reviews have one source of truth and delivery-level duplicate protection', () => {
  assert.ok(Review.schema.path('deliveryId'));
  assert.ok(Review.schema.path('targetType').enumValues.includes('Delivery'));
  assert.ok(Delivery.schema.path('reviewStatus.isRated'));
  const controller = source('controllers/reviewController.js');
  assert.match(controller, /status: 'delivered'/);
  assert.match(controller, /assignmentType: 'internal'/);
  assert.match(controller, /customer: userId/);
  assert.match(controller, /'reviewStatus\.isRated': \{ \$ne: true \}/);
});

test('rider performance uses only reviews linked to the requested rider', () => {
  const controller = source('controllers/staffController.js');
  assert.match(controller, /targetType: 'Delivery', staffId: rider\._id/);
  assert.match(controller, /averageRating: \{ \$avg: '\$rating' \}/);
  assert.match(controller, /req\.user\._id\.toString\(\) !== rider\._id\.toString\(\)/);
  assert.match(controller, /canAccessStore\(req\.user, rider\.store/);
});

test('only required professional roles are platform-gated', () => {
  for (const role of ['veterinarian', 'groomer', 'trainer', 'boarding_staff']) {
    const staff = { role: 'staff', staffType: role, professionalProfile: { verification: { status: 'pending_verification', isRequired: true } } };
    assert.equal(requiresPlatformVerification(staff), true, role);
    assert.equal(isProfessionallyAssignable(staff), false, role);
    staff.professionalProfile.verification.status = 'verified';
    assert.equal(isProfessionallyAssignable(staff), true, role);
  }
  for (const role of ['manager', 'cashier', 'inventory_staff', 'procurement_officer', 'finance_staff', 'delivery_dispatcher', 'delivery_rider']) {
    assert.equal(requiresPlatformVerification({ role: 'staff', staffType: role }), false, role);
  }
});

test('legacy direct and staffType roles share the gate without locking trusted verified records', () => {
  assert.equal(requiresPlatformVerification({ role: 'groomer' }), true);
  assert.equal(requiresPlatformVerification({ role: 'staff', staffType: 'groomer' }), true);
  assert.equal(getProfessionalVerificationStatus({ role: 'trainer', isVerified: true }), 'verified');
  assert.equal(getProfessionalVerificationStatus({ role: 'trainer', isVerified: true, professionalProfile: { verification: { status: 'pending_verification' }, credentialDocuments: [] } }), 'verified');
  assert.equal(getProfessionalVerificationStatus({ role: 'trainer' }), 'pending_verification');
});

test('platform routes own verification and pending accounts are blocked server-side and in sockets', () => {
  const routes = source('routes/staff.js');
  assert.match(routes, /platform\/verifications'.*superAdminOnly/);
  assert.match(routes, /credentials\/:documentId\/verification'.*superAdminOnly/);
  assert.match(source('middleware/auth.js'), /PROFESSIONAL_VERIFICATION_REQUIRED/);
  assert.match(source('services/socketAuthorization.js'), /Professional verification required/);
  assert.match(source('utils/pricingEngine.js'), /isProfessionallyAssignable/);
});
