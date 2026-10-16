const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const {
  normalizeCorrectionInput, evidenceFromFile, evidenceMetadata, temporaryEvidenceUrl
} = require('../utils/attendanceCorrection');
const { configuredMaximum, processStoreAutoClockOuts, processAttendanceAutoClockOuts } = require('../services/attendanceAutomationService');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const attendance = {
  timeIn: { at: new Date('2026-10-15T01:00:00.000Z') },
  status: 'incomplete'
};

test('correction input accepts a valid past clock-out but never mutates attendance', () => {
  const result = normalizeCorrectionInput({
    attendance,
    now: new Date('2026-10-15T12:00:00.000Z'),
    body: {
      reasonCategory: 'forgot_before_leaving',
      reason: 'I forgot to clock out after closing the Store.',
      proposedTimeOut: '2026-10-15T09:00:00.000Z'
    }
  });
  assert.equal(result.proposedTimeOut.toISOString(), '2026-10-15T09:00:00.000Z');
  assert.equal(attendance.timeOut, undefined);
});

test('blank explanation and invalid or future times are rejected', () => {
  assert.throws(() => normalizeCorrectionInput({ attendance, body: { reasonCategory: 'other', reason: '   ', proposedTimeOut: '2026-10-15T09:00:00Z' } }), /meaningful/);
  assert.throws(() => normalizeCorrectionInput({ attendance, now: new Date('2026-10-15T08:00:00Z'), body: { reasonCategory: 'other', reason: 'A sufficiently detailed reason', proposedTimeOut: '2026-10-15T09:00:00Z' } }), /future/);
  assert.throws(() => normalizeCorrectionInput({ attendance: { ...attendance, timeOut: { at: new Date() } }, body: {} }), /incomplete/);
});

test('evidence is mandatory, bounded and returned without private storage identifiers', () => {
  assert.throws(() => evidenceFromFile(null, 'employee-a'), /required/);
  assert.throws(() => evidenceFromFile({ filename: 'x', originalname: 'evidence.pdf', size: 100, format: 'pdf' }, 'employee-a'), /JPG/);
  assert.throws(() => evidenceFromFile({ filename: 'x', originalname: 'evidence.jpg', size: 6 * 1024 * 1024, format: 'jpg' }, 'employee-a'), /5 MB/);
  const evidence = evidenceFromFile({ filename: 'private-id', originalname: 'proof.jpg', size: 100, format: 'jpg' }, 'employee-a');
  assert.deepEqual(Object.keys(evidenceMetadata(evidence)).sort(), ['originalName', 'size', 'uploadedAt'].sort());
  assert.equal(evidenceMetadata(evidence).publicId, undefined);
});

test('evidence access uses an authenticated short-lived signed URL', () => {
  let options;
  const cloudinary = { utils: { private_download_url: (_id, _format, value) => { options = value; return 'signed-private-url'; } } };
  const access = temporaryEvidenceUrl({ cloudinary, evidence: { publicId: 'private-id', format: 'jpg', deliveryType: 'authenticated' }, now: 1000000 });
  assert.equal(access.url, 'signed-private-url');
  assert.equal(options.type, 'authenticated');
  assert.equal(options.expires_at, 1300);
});

test('only one pending request per attendance is enforced while rejected requests remain historical', () => {
  const index = AttendanceCorrectionRequest.schema.indexes().find(([, options]) => options.name === 'attendance_one_pending_correction');
  assert.deepEqual(index[0], { attendance: 1 });
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, { status: 'pending' });
});

test('automatic clock-out compatibility entry points perform no work', async () => {
  assert.equal(configuredMaximum({ hrSettings: { autoClockOut: { enabled: true, maximumShiftMinutes: 480 } } }), null);
  assert.equal(await processStoreAutoClockOuts(), 0);
  assert.equal(await processAttendanceAutoClockOuts(), 0);
  assert.doesNotMatch(source('server.js'), /processAttendanceAutoClockOuts/);
  assert.doesNotMatch(source('controllers/hrController.js'), /processStoreAutoClockOuts/);
});

test('routes separate self-service, review, evidence, and direct correction authority', () => {
  const routes = source('routes/hr.js');
  assert.match(routes, /me\/attendance\/corrections/);
  assert.match(routes, /uploadAttendanceEvidence/);
  assert.match(routes, /attendance\/corrections\/:id\/review.*attendance\.review/);
  assert.match(routes, /attendance\/corrections\/:id\/evidence/);
  assert.match(routes, /attendance\/:id\/correct.*attendance\.review/);
  assert.doesNotMatch(routes, /auto-clock-out-review/);
});

test('transaction service protects store scope, self-review, concurrency and finalized payroll', () => {
  const service = source('services/attendanceCorrectionService.js');
  assert.match(service, /store: actor\.store, employee: actor\._id/);
  assert.match(service, /You cannot review your own attendance correction request/);
  assert.match(service, /__v: priorVersion/);
  assert.match(service, /status: 'pending', __v: request\.__v/);
  assert.match(service, /\['approved', 'paid'\]/);
  assert.match(service, /manualReconciliationRequired/);
});

test('payroll recomputation marker and legacy system-generated clock-out blocker are preserved', () => {
  assert.match(source('models/PayrollPeriod.js'), /attendanceRecalculation/);
  assert.match(source('models/PayrollPeriod.js'), /payrollInputRevision/);
  assert.match(source('models/PayrollPeriod.js'), /computedInputRevision/);
  assert.match(source('services/payrollComputationService.js'), /mongoose\.connection\.transaction/);
  assert.match(source('services/attendanceCorrectionService.js'), /payrollInputRevision = Number/);
  assert.match(source('controllers/hrController.js'), /legacy_system_clock_out/);
  assert.match(source('controllers/hrController.js'), /computePayrollPeriodAtomically/);
  assert.match(source('controllers/hrController.js'), /computedInputRevision[\s\S]*payrollInputRevision/);
});

test('employee and manager UI expose request, evidence, review and confirmation states', () => {
  const employee = source('client/src/components/hr/AttendanceCorrectionRequestPanel.js');
  const manager = source('client/src/components/hr/AttendanceCorrectionReviewPanel.js');
  assert.match(employee, /Supporting evidence/);
  assert.match(employee, /pending review/);
  assert.match(manager, /View evidence/);
  assert.match(manager, /window\.confirm/);
  assert.match(manager, /rejection reason/i);
});
