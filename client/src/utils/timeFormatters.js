/**
 * Formats a 24-hour time string (HH:mm) to 12-hour format (h:mm AM/PM)
 * @param {string} time24 - Time in 24-hour format (e.g., "14:30")
 * @returns {string} - Time in 12-hour format (e.g., "2:30 PM")
 */
export const formatTime12h = (time24) => {
  if (!time24) return '';
  
  // Handle case where time might be a Date object
  if (time24 instanceof Date) {
    return time24.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  const [hours, minutes] = time24.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

/**
 * Formats a Date object or timestamp to 12-hour format (h:mm AM/PM)
 * @param {Date|string|number} date - Date object or timestamp
 * @returns {string} - Formatted time
 */
export const formatDateTime12h = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Formats accurately for chat timestamps
 */
export const formatChatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};
