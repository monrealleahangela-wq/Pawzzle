const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(
  path.join(__dirname, '..', 'client/src/pages/admin/StoreApplications.js'),
  'utf8'
);

test('store application review uses one continuous modal scroll area', () => {
  assert.match(
    page,
    /data-testid="store-application-review-modal"[^>]*max-h-\[calc\(100dvh-1rem\)\][^>]*overflow-y-auto[^>]*overscroll-contain/
  );
  assert.match(page, /sticky top-0 z-30/);
  assert.match(page, /data-testid="store-application-review-content" className="p-6 sm:p-8 space-y-8"/);
  assert.doesNotMatch(page, /data-testid="store-application-review-content"[^>]*overflow-y-auto/);
});

test('document review precedes correction and decision controls in the shared flow', () => {
  const documents = page.indexOf('Verification Documents');
  const actions = page.indexOf('data-testid="store-application-review-actions"');
  const corrections = page.indexOf('Mark Corrections Needed');
  const feedback = page.indexOf('Decision Feedback');

  assert.ok(documents >= 0, 'document review section is missing');
  assert.ok(actions > documents, 'review actions must follow the documents');
  assert.ok(corrections > actions, 'correction controls must stay inside the actions section');
  assert.ok(feedback > corrections, 'decision feedback must follow correction controls');
});
