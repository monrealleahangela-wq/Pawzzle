const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const controller = read('controllers/reviewController.js');
const reviewSection = read('client/src/components/ReviewSection.js');

test('store review eligibility is shared by the preflight endpoint and review creation', () => {
  assert.match(controller, /const getStoreReviewEligibility = async/);
  assert.match(controller, /else if \(targetType === 'Store'\) \{[\s\S]{0,1000}getStoreReviewEligibility\(userId, targetId\)/);
  assert.match(controller, /const storeEligibility = await getStoreReviewEligibility\(userId, targetId\);/);
  assert.match(controller, /Review\.exists\(\{[\s\S]{0,200}targetType: 'Store'/);
});

test('only completed same-store orders or bookings that have not been reviewed qualify a store review', () => {
  assert.match(controller, /Order\.findOne\(\{ customer: userId, store: storeId, status: \{ \$in: \['delivered', 'completed'\] \}, 'reviewStatus\.isRated': \{ \$ne: true \} \}/);
  assert.match(controller, /Booking\.findOne\(\{ customer: userId, store: storeId, status: 'completed', 'reviewStatus\.isRated': \{ \$ne: true \} \}/);
  assert.match(controller, /reason: order \|\| booking \|\| adoption \? null : 'no_completed_transaction'/);
});

test('store profile review UI waits for the authoritative eligibility result', () => {
  assert.match(reviewSection, /reviewService\.checkReviewEligibility\(targetType, targetId\)/);
  assert.match(reviewSection, /isAuthenticated && eligibilityChecked/);
  assert.match(reviewSection, /isEligible \? \(/);
  assert.match(reviewSection, /Complete a purchase or service from this store before leaving a review\./);
  assert.doesNotMatch(reviewSection, /Verified Buyers Only/);
});
