const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MANILA_OFFSET = '+08:00';

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const isValidCoordinates = (lat, lng) => Number.isFinite(Number(lat))
  && Number.isFinite(Number(lng))
  && Number(lat) >= -90 && Number(lat) <= 90
  && Number(lng) >= -180 && Number(lng) <= 180;

const distanceMeters = (from, to) => {
  if (!isValidCoordinates(from?.lat, from?.lng) || !isValidCoordinates(to?.lat, to?.lng)) return null;
  const radians = degrees => Number(degrees) * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = radians(Number(to.lat) - Number(from.lat));
  const dLng = radians(Number(to.lng) - Number(from.lng));
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
};

const dateKeyInTimezone = (date = new Date(), timezone = 'Asia/Manila') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dateAtTime = (dateKey, time = '00:00', timezone = 'Asia/Manila') => {
  // Pawzzle stores operate in the Philippines; retaining the named timezone in
  // snapshots keeps policy explicit while avoiding client-controlled offsets.
  const offset = timezone === 'Asia/Manila' ? MANILA_OFFSET : 'Z';
  return new Date(`${dateKey}T${time}:00${offset}`);
};

const minutesBetween = (start, end) => Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));

const getScheduleForDate = (employee, store, dateKey) => {
  const settings = store?.hrSettings || {};
  const timezone = settings.timezone || 'Asia/Manila';
  const dayNumber = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const professional = employee?.professionalProfile?.availability?.[DAY_NAMES[dayNumber]];
  const hasProfessionalSchedule = typeof professional?.available === 'boolean';
  const isWorkDay = hasProfessionalSchedule
    ? professional.available
    : (settings.defaultWorkDays || [1, 2, 3, 4, 5]).includes(dayNumber);
  const start = professional?.start || settings.defaultShift?.start || '09:00';
  const end = professional?.end || settings.defaultShift?.end || '17:00';
  const professionalBreakMinutes = Array.isArray(professional?.breaks)
    ? professional.breaks.reduce((total, item) => total + minutesBetween(
      dateAtTime(dateKey, item.start, timezone), dateAtTime(dateKey, item.end, timezone)
    ), 0)
    : 0;
  return {
    isWorkDay,
    start: isWorkDay ? start : null,
    end: isWorkDay ? end : null,
    breakMinutes: isWorkDay ? (professionalBreakMinutes || settings.defaultShift?.breakMinutes || 0) : 0,
    timezone
  };
};

const calculateAttendance = ({ timeIn, timeOut, schedule, graceMinutes = 0, overtimeEnabled = false }) => {
  if (!timeIn) return { status: schedule.isWorkDay ? 'absent' : 'rest_day', workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0 };
  if (!timeOut) return { status: 'incomplete', workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0 };
  if (!schedule.isWorkDay) {
    const workedMinutes = Math.max(0, minutesBetween(timeIn, timeOut) - (schedule.breakMinutes || 0));
    return { status: 'present', workedMinutes, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: overtimeEnabled ? workedMinutes : 0 };
  }
  const workDate = dateKeyInTimezone(new Date(timeIn), schedule.timezone);
  const scheduledStart = dateAtTime(workDate, schedule.start, schedule.timezone);
  const scheduledEnd = dateAtTime(workDate, schedule.end, schedule.timezone);
  const workedMinutes = Math.max(0, minutesBetween(timeIn, timeOut) - (schedule.breakMinutes || 0));
  const lateMinutes = Math.max(0, minutesBetween(scheduledStart, timeIn) - Number(graceMinutes || 0));
  const undertimeMinutes = Math.max(0, minutesBetween(timeOut, scheduledEnd));
  const overtimeMinutes = overtimeEnabled ? Math.max(0, minutesBetween(scheduledEnd, timeOut)) : 0;
  const status = lateMinutes > 0 ? 'late' : undertimeMinutes > 0 ? 'undertime' : 'present';
  return { status, workedMinutes, lateMinutes, undertimeMinutes, overtimeMinutes };
};

const startOfUtcDate = value => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const dateWithDay = (year, month, day) => new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month))));

const generatePayrollPeriod = (referenceDate, settings = {}) => {
  const reference = startOfUtcDate(referenceDate);
  const frequency = settings.payrollFrequency || 'semi_monthly';
  let periodStart;
  let periodEnd;
  let payDate;
  if (frequency === 'weekly') {
    const startDay = settings.weekly?.weekStartsOn ?? 1;
    const delta = (reference.getUTCDay() - startDay + 7) % 7;
    periodStart = addDays(reference, -delta);
    periodEnd = addDays(periodStart, 6);
    payDate = addDays(periodEnd, settings.weekly?.payDelayDays ?? 2);
  } else if (frequency === 'monthly') {
    const cutoff = settings.monthly?.cutoffDay ?? 25;
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    if (reference.getUTCDate() <= cutoff) {
      periodEnd = dateWithDay(year, month, cutoff);
      const previous = new Date(Date.UTC(year, month - 1, 1));
      periodStart = addDays(dateWithDay(previous.getUTCFullYear(), previous.getUTCMonth(), cutoff), 1);
    } else {
      periodStart = addDays(dateWithDay(year, month, cutoff), 1);
      const next = new Date(Date.UTC(year, month + 1, 1));
      periodEnd = dateWithDay(next.getUTCFullYear(), next.getUTCMonth(), cutoff);
    }
    payDate = dateWithDay(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), settings.monthly?.payDay ?? 30);
    if (payDate < periodEnd) payDate = dateWithDay(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, settings.monthly?.payDay ?? 30);
  } else {
    const cutoff = settings.semiMonthly?.firstCutoffDay ?? 15;
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    if (reference.getUTCDate() <= cutoff) {
      periodStart = dateWithDay(year, month, 1);
      periodEnd = dateWithDay(year, month, cutoff);
      payDate = dateWithDay(year, month, settings.semiMonthly?.firstPayDay ?? 20);
    } else {
      periodStart = dateWithDay(year, month, cutoff + 1);
      periodEnd = dateWithDay(year, month, daysInMonth(year, month));
      payDate = dateWithDay(year, month + 1, settings.semiMonthly?.secondPayDay ?? 5);
    }
  }
  return { frequency, periodStart, periodEnd, payDate };
};

const computePay = ({ compensation, summary, settings }) => {
  const type = compensation.compensationType || 'salary';
  const rate = Number(compensation.baseRate || 0);
  const scheduledDays = Math.max(1, Number(summary.scheduledWorkDays || 0));
  const scheduledHours = Math.max(1, minutesBetween(
    dateAtTime('2020-01-01', settings.defaultShift?.start || '09:00'),
    dateAtTime('2020-01-01', settings.defaultShift?.end || '17:00')
  ) / 60 - Number(settings.defaultShift?.breakMinutes || 0) / 60);
  const minuteRate = type === 'hourly' ? rate / 60
    : type === 'daily' ? rate / (scheduledHours * 60)
      : rate / (scheduledDays * scheduledHours * 60);
  let basePay = rate;
  let absenceDeduction = 0;
  let unpaidLeaveDeduction = 0;
  if (type === 'hourly') {
    basePay = minuteRate * (Number(summary.workedMinutes || 0) + Number(summary.paidLeaveDays || 0) * scheduledHours * 60);
  } else if (type === 'daily') {
    basePay = rate * (Number(summary.daysPresent || 0) + Number(summary.paidLeaveDays || 0));
  } else {
    const dailyRate = rate / scheduledDays;
    absenceDeduction = dailyRate * Number(summary.absences || 0);
    unpaidLeaveDeduction = dailyRate * Number(summary.unpaidLeaveDays || 0);
  }
  const lateDeduction = type === 'hourly' || settings.lateDeductionEnabled === false
    ? 0 : minuteRate * Number(summary.lateMinutes || 0);
  const undertimeDeduction = type === 'hourly' || settings.undertimeDeductionEnabled === false
    ? 0 : minuteRate * Number(summary.undertimeMinutes || 0);
  const overtimePay = settings.overtime?.enabled
    ? minuteRate * Number(summary.overtimeMinutes || 0) * Number(settings.overtime.multiplier || 1)
    : 0;
  return {
    basePay: roundMoney(basePay),
    overtimePay: roundMoney(overtimePay),
    absenceDeduction: roundMoney(absenceDeduction),
    unpaidLeaveDeduction: roundMoney(unpaidLeaveDeduction),
    lateDeduction: roundMoney(lateDeduction),
    undertimeDeduction: roundMoney(undertimeDeduction)
  };
};

module.exports = {
  isValidCoordinates,
  distanceMeters,
  dateKeyInTimezone,
  dateAtTime,
  getScheduleForDate,
  calculateAttendance,
  generatePayrollPeriod,
  computePay,
  roundMoney,
  addDays
};
