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
