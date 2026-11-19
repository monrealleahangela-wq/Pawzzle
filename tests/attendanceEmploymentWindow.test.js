const test = require('node:test');
const assert = require('node:assert/strict');
const { attendanceStartDateKey, isAttendanceDateEligible } = require('../utils/attendanceEmploymentWindow');
const { __test: { addDerivedAbsences, resolveTimeInEligibility } } = require('../controllers/hrController');

test('attendance begins on the explicit employment start date', () => {
  const employee = {
    createdAt: new Date('2026-10-01T01:00:00.000Z'),
    employmentProfile: { dateHired: new Date('2026-11-20T00:00:00.000Z') }
  };

  assert.equal(attendanceStartDateKey(employee, 'Asia/Manila'), '2026-11-20');
  assert.equal(isAttendanceDateEligible(employee, '2026-11-19', 'Asia/Manila'), false);
  assert.equal(isAttendanceDateEligible(employee, '2026-11-20', 'Asia/Manila'), true);
});

test('legacy staff without a hire date use the local account-created date', () => {
  const employee = { createdAt: new Date('2026-11-19T16:30:00.000Z') };

  assert.equal(attendanceStartDateKey(employee, 'Asia/Manila'), '2026-11-20');
  assert.equal(isAttendanceDateEligible(employee, '2026-11-19', 'Asia/Manila'), false);
  assert.equal(isAttendanceDateEligible(employee, '2026-11-20', 'Asia/Manila'), true);
});

test('legacy records without an employment or creation date retain existing behavior', () => {
  assert.equal(attendanceStartDateKey({}, 'Asia/Manila'), null);
  assert.equal(isAttendanceDateEligible({}, '2026-11-01', 'Asia/Manila'), true);
});

test('calendar projection removes pre-hire rows and only derives absences from the hire date', () => {
  const employee = {
    _id: 'employee-1',
    employmentProfile: { dateHired: new Date('2026-11-10T00:00:00.000Z') },
    professionalProfile: {}
  };
  const store = {
    hrSettings: {
      timezone: 'Asia/Manila',
      defaultWorkDays: [1, 2, 3, 4, 5],
      defaultShift: { start: '09:00', end: '17:00' }
    }
  };
  const projected = addDerivedAbsences([
    { _id: 'incorrect-old-row', employee, workDate: '2026-11-09', status: 'absent' }
  ], [employee], store, '2026-11-09', '2026-11-12', new Date('2026-11-20T00:00:00.000Z'));

  assert.equal(projected.some(row => row.workDate === '2026-11-09'), false);
  assert.deepEqual(projected.map(row => row.workDate).sort(), ['2026-11-10', '2026-11-11', '2026-11-12']);
  assert.equal(projected.every(row => row.status === 'absent' && row.isDerived), true);
});

test('clock-in eligibility never falls back to a work date before employment starts', () => {
  const employee = {
    employmentProfile: { dateHired: new Date('2026-11-20T00:00:00.000Z') },
    professionalProfile: {}
  };
  const store = {
    hrSettings: {
      timezone: 'Asia/Manila',
      defaultWorkDays: [1, 2, 3, 4, 5],
      defaultShift: { start: '09:00', end: '17:00' },
      timeInWindow: { earlyMinutes: 60, lateMinutes: 60 }
    }
  };
  const result = resolveTimeInEligibility(employee, store, new Date('2026-11-19T01:00:00.000Z'));

  assert.equal(result.window.allowed, false);
  assert.match(result.window.message, /Attendance begins on 2026-11-20/);
});
