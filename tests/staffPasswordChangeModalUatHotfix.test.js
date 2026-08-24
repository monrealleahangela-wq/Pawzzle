const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../client/src/components/auth/PasswordChangeModal.js'),
  'utf8'
);
const authController = fs.readFileSync(
  path.join(__dirname, '../controllers/authController.js'),
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
  assert.match(source, /requiresPasswordChange: result\?\.requiresPasswordChange \?\? false/);
  assert.match(source, /onClick=\{logout\}/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-label=\{showCurrent \?/);
  assert.match(source, /minLength=\{6\}/);
});

test('successful password changes clear the authoritative first-login flag', () => {
  const changePasswordStart = authController.indexOf('const changePassword =');
  const changePasswordEnd = authController.indexOf('const toggle2FA =', changePasswordStart);
  const changePassword = authController.slice(changePasswordStart, changePasswordEnd);

  assert.match(changePassword, /user\.password = newPassword;\s*user\.requiresPasswordChange = false;\s*await user\.save\(\)/);
  assert.match(changePassword, /requiresPasswordChange: false/);
});

test('login and verified password reset cannot restore a stale password-change prompt', () => {
  const summaryStart = authController.indexOf('const userSummary =');
  const summaryEnd = authController.indexOf('const otpFailureMessage', summaryStart);
  const summary = authController.slice(summaryStart, summaryEnd);
  const resetStart = authController.indexOf('const verifyOTPAndResetPassword =');
  const resetEnd = authController.indexOf('const resendPasswordResetOTP =', resetStart);
  const reset = authController.slice(resetStart, resetEnd);

  assert.match(summary, /requiresPasswordChange: Boolean\(user\.requiresPasswordChange\)/);
  assert.match(reset, /user\.password = newPassword;\s*user\.requiresPasswordChange = false;\s*await user\.save\(\)/);
});
