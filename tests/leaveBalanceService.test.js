const test = require('node:test');
const assert = require('node:assert/strict');
const { scheduledDays, scheduledDaysInYear } = require('../services/leaveBalanceService');

test('leave credit charge counts only configured workdays', () => {
  assert.equal(scheduledDays({ startDate: '2026-10-16', endDate: '2026-10-19', workDays: [1, 2, 3, 4, 5] }), 2);
  assert.equal(scheduledDays({ startDate: '2026-10-17', endDate: '2026-10-18', workDays: [1, 2, 3, 4, 5] }), 0);
});

test('leave usage spanning New Year is charged only to days in the requested year', () => {
  assert.equal(scheduledDaysInYear({
    startDate: '2025-12-29', endDate: '2026-01-02', year: 2026,
    workDays: [1, 2, 3, 4, 5]
  }), 2);
  assert.equal(scheduledDaysInYear({
    startDate: '2025-12-29', endDate: '2026-01-02', year: 2025,
    workDays: [1, 2, 3, 4, 5]
  }), 3);
});
