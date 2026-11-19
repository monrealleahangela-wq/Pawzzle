const { dateKeyInTimezone } = require('./hrPolicy');

const dateOnly = value => {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const attendanceStartDateKey = (employee, timezone) => {
  const hired = dateOnly(employee?.employmentProfile?.dateHired);
  if (hired) return hired;
  const createdAt = employee?.createdAt ? new Date(employee.createdAt) : null;
  return createdAt && !Number.isNaN(createdAt.getTime())
    ? dateKeyInTimezone(createdAt, timezone)
    : null;
};

const isAttendanceDateEligible = (employee, workDate, timezone) => {
  const startDate = attendanceStartDateKey(employee, timezone);
  return !startDate || String(workDate || '').slice(0, 10) >= startDate;
};

module.exports = { attendanceStartDateKey, isAttendanceDateEligible };
