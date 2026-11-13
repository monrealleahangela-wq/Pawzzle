export const formatDurationMinutes = value => {
  const totalMinutes = Number(value);
  if (!Number.isFinite(totalMinutes)) return '—';

  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = Number((safeMinutes - (hours * 60)).toFixed(2));
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes || !hours) parts.push(`${minutes}m`);
  return parts.join(' ');
};

export const durationPartsToMinutes = (hoursValue, minutesValue) => {
  const hours = hoursValue === '' || hoursValue == null ? 0 : Number(hoursValue);
  const minutes = minutesValue === '' || minutesValue == null ? 0 : Number(minutesValue);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return (hours * 60) + minutes;
};
