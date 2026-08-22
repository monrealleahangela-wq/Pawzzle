const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../client/src/components/auth/PasswordChangeModal.js'),
  'utf8'
);

test('first-login password dialog uses a compact viewport-safe layout', () => {
  assert.match(source, /max-w-md max-h-\[calc\(100vh-1\.5rem\)\] overflow-y-auto/);
  assert.match(source, /className="p-5 sm:p-6"/);
  assert.doesNotMatch(source, /max-w-lg|rounded-\[2\.5rem\]|p-8 sm:p-10 space-y-8|text-3xl/);
});

test('password dialog explains the required action in clear staff-friendly language', () => {
  assert.match(source, /Create a new password/);
  assert.match(source, /Required before you can continue to your staff account/);
  assert.match(source, /Temporary password/);
  assert.match(source, /New password/);
  assert.match(source, /Confirm new password/);
  assert.match(source, /Save new password/);
  assert.match(source, /Sign out instead/);
  assert.doesNotMatch(source, /Security Enforced|Temporary Credentials Detected|Update Password & Proceed/);
});

test('compact redesign preserves enforcement, password submission, visibility, and logout controls', () => {
  assert.match(source, /if \(!user\?\.requiresPasswordChange\) return null/);
  assert.match(source, /authService\.changePassword\(\{/);
  assert.match(source, /currentPassword: passwords\.current/);
  assert.match(source, /newPassword: passwords\.new/);
  assert.match(source, /requiresPasswordChange: false/);
  assert.match(source, /onClick=\{logout\}/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-label=\{showCurrent \?/);
  assert.match(source, /minLength=\{6\}/);
});
