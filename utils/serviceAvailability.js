const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const toMinutes = value => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const addMinutesToTime = (value, duration) => {
  const start = toMinutes(value);
  const minutes = Number(duration);
  if (start === null || !Number.isFinite(minutes) || minutes <= 0 || start + minutes >= 1440) return null;
  const end = start + minutes;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
};

const validateServiceSchedule = ({ service, store, bookingDate, startTime, duration }) => {
  const [year, month, day] = String(bookingDate || '').split('-').map(Number);
  const selectedDate = new Date(year, month - 1, day);
  if (!year || !month || !day || Number.isNaN(selectedDate.getTime())
      || selectedDate.getFullYear() !== year || selectedDate.getMonth() !== month - 1 || selectedDate.getDate() !== day) {
    return { valid: false, reason: 'Please select a valid booking date.' };
  }

  const endTime = addMinutesToTime(startTime, duration);
  if (!endTime) return { valid: false, reason: 'The selected service time range is invalid.' };

  const schedule = service?.schedule?.enabled ? service.schedule : store?.businessHours;
  const daySchedule = schedule?.[DAY_NAMES[selectedDate.getDay()]];
  if (!daySchedule || daySchedule.closed) return { valid: false, reason: 'The store is closed on the selected date.' };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const open = toMinutes(daySchedule.open);
  const close = toMinutes(daySchedule.close);
  if (open === null || close === null || start < open || end > close) {
    return { valid: false, reason: 'Please choose a time within the store’s service hours.' };
  }

  if (service?.schedule?.enabled) {
    const selectedKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isBlackout = (service.schedule.blackoutDates || []).some(value => {
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === selectedKey;
    });
    if (isBlackout) return { valid: false, reason: 'This service is unavailable on the selected date.' };
    const overlapsBreak = (service.schedule.breakTimes || []).some(item => {
      const breakStart = toMinutes(item.start);
      const breakEnd = toMinutes(item.end);
      return breakStart !== null && breakEnd !== null && start < breakEnd && end > breakStart;
    });
    if (overlapsBreak) return { valid: false, reason: 'The selected time overlaps a service break.' };
  }

  return { valid: true, reason: null, endTime };
};

module.exports = { addMinutesToTime, validateServiceSchedule };
