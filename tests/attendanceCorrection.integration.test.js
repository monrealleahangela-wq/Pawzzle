const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;

const assertDedicatedLocalReplicaSet = uri => {
  const value = String(uri || '');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('MONGODB_TRANSACTION_TEST_URI must be a valid MongoDB URI.');
  }
  const localHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'mongodb:' || !localHost || parsed.port !== '27018' || parsed.searchParams.get('replicaSet') !== 'pawzzleTestRS') {
    throw new Error('Attendance transaction tests require the dedicated local pawzzleTestRS instance on 127.0.0.1:27018.');
  }
};

test('attendance correction transactions, concurrency, payroll protection and authorization', { skip: !configuredUri }, async t => {
  assertDedicatedLocalReplicaSet(configuredUri);
  const databaseName = `pawzzle_attendance_test_${process.pid}_${Date.now()}`;
  await mongoose.connect(configuredUri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  const Store = require('../models/Store');
  const User = require('../models/User');
  const Attendance = require('../models/Attendance');
  const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
  const PayrollPeriod = require('../models/PayrollPeriod');
  const Notification = require('../models/Notification');
  const ActivityLog = require('../models/ActivityLog');
  const {
    submitCorrectionRequest, reviewCorrectionRequest, directCorrectAttendance, getEvidenceAccess
  } = require('../services/attendanceCorrectionService');
  const { computePayrollPeriodAtomically } = require('../services/payrollComputationService');

  try {
    await Promise.all([
      Attendance.syncIndexes(), AttendanceCorrectionRequest.syncIndexes(),
      PayrollPeriod.syncIndexes(), Notification.syncIndexes()
    ]);

    const storeId = new mongoose.Types.ObjectId();
    const otherStoreId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const managerId = new mongoose.Types.ObjectId();
    const secondManagerId = new mongoose.Types.ObjectId();
    await Store.collection.insertOne({
      _id: storeId, owner: managerId, name: 'Synthetic Attendance Store', slug: `attendance-${Date.now()}`,
      description: 'Synthetic transaction test data', businessType: 'pet_store', operationalModules: ['products'],
      contactInfo: { address: { coordinates: { lat: 14.299, lng: 120.958 } } },
      hrSettings: { gracePeriodMinutes: 10, overtime: { enabled: false }, attendanceRadiusMeters: 150, maximumLocationAccuracyMeters: 200, outsideGeofencePolicy: 'reject' }
    });
    await User.collection.insertMany([
      { _id: employeeId, username: 'attendance-employee', email: `employee-${Date.now()}@example.test`, role: 'staff', staffType: 'cashier', store: storeId, isActive: true, isDeleted: false, staffStatus: 'active', employmentProfile: { employmentStatus: 'active' } },
      { _id: managerId, username: 'attendance-manager', email: `manager-${Date.now()}@example.test`, role: 'manager', store: storeId, isActive: true, isDeleted: false },
      { _id: secondManagerId, username: 'attendance-manager-2', email: `manager2-${Date.now()}@example.test`, role: 'manager', store: storeId, isActive: true, isDeleted: false }
    ]);
    const employee = { _id: employeeId, store: storeId, role: 'staff', staffType: 'cashier', firstName: 'Synthetic' };
    const manager = { _id: managerId, store: storeId, role: 'manager' };
    const secondManager = { _id: secondManagerId, store: storeId, role: 'manager' };
    const schedule = { isWorkDay: true, start: '09:00', end: '17:00', breakMinutes: 60, timezone: 'Asia/Manila' };
    const evidence = suffix => ({ filename: `authenticated/${suffix}`, originalname: `${suffix}.jpg`, size: 512, format: 'jpg' });

    await t.test('manual clock-out uses one server timestamp and concurrent retries cannot duplicate it', async () => {
      const { timeOut } = require('../controllers/hrController');
      const now = new Date();
      const workDate = now.toISOString().slice(0, 10);
      const attendance = await Attendance.create({
        store: storeId, employee: employeeId, workDate, schedule,
        timeIn: { at: new Date(now.getTime() - 2 * 60000), validationStatus: 'valid' }, status: 'incomplete'
      });
      const invoke = async () => {
        let response;
        const req = {
          user: employee, body: { latitude: 14.299, longitude: 120.958, accuracy: 10 }, ip: '127.0.0.1',
          get: () => 'attendance-transaction-test', app: { get: () => null }
        };
        const res = {
          code: 200,
          status(value) { this.code = value; return this; },
          json(payload) { response = { code: this.code, payload }; return response; }
        };
        await timeOut(req, res);
        return response;
      };
      const before = Date.now();
      const results = await Promise.all([invoke(), invoke()]);
      const after = Date.now();
      assert.equal(results.filter(item => item.code === 200).length, 1);
      assert.equal(results.filter(item => item.code === 409).length, 1);
      const stored = await Attendance.findById(attendance._id);
      assert.equal(stored.timeOut.at.getTime() >= before && stored.timeOut.at.getTime() <= after, true);
      assert.equal(stored.timeOut.validationStatus, 'valid');
      assert.equal(await ActivityLog.countDocuments({ action: 'Attendance Time Out', subject: employeeId }), 1);
    });

    await t.test('a correction committed during payroll computation forces a retry with current attendance', async () => {
      const attendance = await Attendance.create({
        store: storeId, employee: employeeId, workDate: '2026-09-01', schedule,
        timeIn: { at: new Date('2026-09-01T01:00:00Z'), validationStatus: 'valid' }, status: 'incomplete'
      });
      const period = await PayrollPeriod.create({
        store: storeId, frequency: 'monthly', periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-09-30T00:00:00Z'),
        payDate: new Date('2026-10-05T00:00:00Z'), status: 'draft', policySnapshot: { payrollFrequency: 'monthly' }, generatedBy: managerId
      });
      let releaseFirstAttempt;
      let signalFirstRead;
      const firstRead = new Promise(resolve => { signalFirstRead = resolve; });
      const release = new Promise(resolve => { releaseFirstAttempt = resolve; });
      let attempts = 0;
      const computation = computePayrollPeriodAtomically({
        periodId: period._id,
        storeId,
        calculate: async ({ period: calculatingPeriod, session, inputRevision }) => {
          attempts += 1;
          const observed = await Attendance.findById(attendance._id).session(session).lean();
          if (attempts === 1) {
            signalFirstRead();
            await release;
          }
          calculatingPeriod.computedBy = managerId;
          calculatingPeriod.computedAt = new Date();
          return { observedTimeOut: observed.timeOut?.at || null, inputRevision };
        }
      });
      await firstRead;
      await directCorrectAttendance({
        actor: manager, storeId, attendanceId: attendance._id,
        input: {
          reason: 'Manager verified the attendance correction during payroll calculation.',
          confirmed: true, expectedVersion: attendance.__v,
          timeIn: '2026-09-01T01:00:00Z', timeOut: '2026-09-01T09:00:00Z'
        },
        now: new Date('2026-09-02T00:00:00Z')
      });
      releaseFirstAttempt();
      const completed = await computation;
      assert.equal(attempts >= 2, true);
      assert.equal(new Date(completed.result.observedTimeOut).toISOString(), '2026-09-01T09:00:00.000Z');
      const storedPeriod = await PayrollPeriod.findById(period._id);
      assert.equal(storedPeriod.status, 'computed');
      assert.equal(storedPeriod.computedInputRevision, storedPeriod.payrollInputRevision);
      assert.equal(storedPeriod.attendanceRecalculation.required, false);
    });

    await t.test('submission is separate from attendance and duplicate pending requests are rejected', async () => {
      const attendance = await Attendance.create({
        store: storeId, employee: employeeId, workDate: '2026-10-01', schedule,
        timeIn: { at: new Date('2026-10-01T01:00:00Z'), validationStatus: 'valid' }, status: 'incomplete'
      });
      const reviewedPeriod = await PayrollPeriod.create({
        store: storeId, frequency: 'monthly', periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-31T00:00:00Z'),
        payDate: new Date('2026-11-05T00:00:00Z'), status: 'reviewed', policySnapshot: { payrollFrequency: 'monthly' }, generatedBy: managerId
      });
      const request = await submitCorrectionRequest({
        actor: employee, attendanceId: attendance._id,
        input: { reasonCategory: 'forgot_before_leaving', reason: 'Forgot to clock out after closing duties.', proposedTimeOut: '2026-10-01T09:00:00Z' },
        file: evidence('first'), now: new Date('2026-10-02T00:00:00Z')
      });
      assert.equal(request.status, 'pending');
      assert.equal(request.evidence.publicId, undefined);
      assert.equal((await Attendance.findById(attendance._id)).timeOut, undefined);
      await assert.rejects(() => submitCorrectionRequest({
        actor: employee, attendanceId: attendance._id,
        input: { reasonCategory: 'other', reason: 'A second conflicting request.', proposedTimeOut: '2026-10-01T08:30:00Z' },
        file: evidence('duplicate'), now: new Date('2026-10-02T00:00:00Z')
      }), error => error.statusCode === 409);

      const settled = await Promise.allSettled([
        reviewCorrectionRequest({ actor: manager, storeId, requestId: request._id, action: 'approve', reviewerNote: 'Evidence and schedule verified.', now: new Date('2026-10-02T01:00:00Z') }),
        reviewCorrectionRequest({ actor: secondManager, storeId, requestId: request._id, action: 'approve', reviewerNote: 'Evidence and schedule verified.', now: new Date('2026-10-02T01:00:00Z') })
      ]);
      assert.equal(settled.filter(item => item.status === 'fulfilled').length, 1, settled.map(item => item.reason?.message || item.status).join(' | '));
      assert.equal(settled.filter(item => item.status === 'rejected').length, 1);
      const corrected = await Attendance.findById(attendance._id);
      assert.equal(corrected.timeOut.at.toISOString(), '2026-10-01T09:00:00.000Z');
      assert.equal(corrected.timeOut.validationStatus, 'employee_correction');
      const period = await PayrollPeriod.findById(reviewedPeriod._id);
      assert.equal(period.status, 'draft');
      assert.equal(period.attendanceRecalculation.required, true);
      assert.equal(await ActivityLog.countDocuments({ store: storeId, action: { $in: ['Attendance Correction Requested', 'Attendance Correction Approved'] } }), 2);
    });

    await t.test('rejection preserves incomplete attendance and permits a later new request', async () => {
      const attendance = await Attendance.create({
        store: storeId, employee: employeeId, workDate: '2026-11-01', schedule,
        timeIn: { at: new Date('2026-11-01T01:00:00Z'), validationStatus: 'valid' }, status: 'incomplete'
      });
      const request = await submitCorrectionRequest({
        actor: employee, attendanceId: attendance._id,
        input: { reasonCategory: 'device_or_internet', reason: 'The Store internet connection was unavailable.', proposedTimeOut: '2026-11-01T09:00:00Z' },
        file: evidence('reject'), now: new Date('2026-11-02T00:00:00Z')
      });
      await reviewCorrectionRequest({ actor: manager, storeId, requestId: request._id, action: 'reject', reviewerNote: 'Evidence does not establish the departure time.', now: new Date('2026-11-02T01:00:00Z') });
      assert.equal((await Attendance.findById(attendance._id)).timeOut, undefined);
      const replacement = await submitCorrectionRequest({
        actor: employee, attendanceId: attendance._id,
        input: { reasonCategory: 'other', reason: 'Submitting clearer evidence from the Store camera.', proposedTimeOut: '2026-11-01T08:55:00Z' },
        file: evidence('replacement'), now: new Date('2026-11-02T02:00:00Z')
      });
      assert.equal(replacement.status, 'pending');
    });

    await t.test('direct corrections require confirmation, reject self-dealing, serialize edits, and preserve finalized payroll', async () => {
      const attendance = await Attendance.create({
        store: storeId, employee: employeeId, workDate: '2026-12-01', schedule,
        timeIn: { at: new Date('2026-12-01T01:00:00Z'), validationStatus: 'valid' }, status: 'incomplete'
      });
      await PayrollPeriod.create({
        store: storeId, frequency: 'monthly', periodStart: new Date('2026-12-01T00:00:00Z'), periodEnd: new Date('2026-12-31T00:00:00Z'),
        payDate: new Date('2027-01-05T00:00:00Z'), status: 'approved', policySnapshot: { payrollFrequency: 'monthly' }, generatedBy: managerId, approvedBy: managerId, approvedAt: new Date()
      });
      await assert.rejects(() => directCorrectAttendance({ actor: employee, storeId, attendanceId: attendance._id, input: { reason: 'Trying to edit my own attendance.', confirmed: true, expectedVersion: attendance.__v } }), error => error.statusCode === 403);
      const payload = { reason: 'Manager verified the signed closing record.', confirmed: true, expectedVersion: attendance.__v, timeIn: '2026-12-01T01:00:00Z', timeOut: '2026-12-01T09:00:00Z' };
      const settled = await Promise.allSettled([
        directCorrectAttendance({ actor: manager, storeId, attendanceId: attendance._id, input: payload, now: new Date('2026-12-02T00:00:00Z') }),
        directCorrectAttendance({ actor: secondManager, storeId, attendanceId: attendance._id, input: { ...payload, timeOut: '2026-12-01T09:05:00Z' }, now: new Date('2026-12-02T00:00:00Z') })
      ]);
      assert.equal(settled.filter(item => item.status === 'fulfilled').length, 1);
      assert.equal(settled.filter(item => item.status === 'rejected').length, 1);
      const success = settled.find(item => item.status === 'fulfilled').value;
      assert.equal(success.payrollImpact.manualReconciliationRequired, true);
      const finalized = await PayrollPeriod.findOne({ store: storeId, periodStart: new Date('2026-12-01T00:00:00Z') });
      assert.equal(finalized.status, 'approved');
    });

    await t.test('evidence authorization is participant/store scoped and URLs are short-lived', async () => {
      const request = await AttendanceCorrectionRequest.findOne({ employee: employeeId });
      const cloudinary = { utils: { private_download_url: () => 'signed-test-url' } };
      const own = await getEvidenceAccess({ actor: employee, storeId, requestId: request._id, cloudinary, now: 1000000 });
      assert.equal(own.url, 'signed-test-url');
      await assert.rejects(() => getEvidenceAccess({
        actor: { _id: new mongoose.Types.ObjectId(), store: otherStoreId, role: 'manager' },
        storeId: otherStoreId, requestId: request._id, cloudinary, now: 1000000
      }), error => error.statusCode === 403);
    });

    assert.equal(await Notification.countDocuments({ recipient: employeeId, type: 'attendance_update' }) >= 2, true);
  } finally {
    if (mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
