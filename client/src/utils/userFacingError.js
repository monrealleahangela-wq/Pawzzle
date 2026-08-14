const FRIENDLY_STATUS_MESSAGES = {
  400: 'Please review the information and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to perform this action.",
  404: 'The requested record could not be found.',
  409: 'This record changed or already exists. Refresh and try again.',
  413: 'The selected file is too large.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'The server could not complete this request. Please try again.'
};

export const getUserFacingError = (error, fallback = 'Something went wrong. Please try again.') => {
  if (!error?.response) {
    if (error?.code === 'ECONNABORTED') return 'The request took too long. Please try again.';
    return 'Unable to reach the server. Check your connection and try again.';
  }
  const status = Number(error.response.status);
  const message = error.response.data?.message;
  if ([403, 404, 429, 500].includes(status)) return FRIENDLY_STATUS_MESSAGES[status];
  if (typeof message === 'string' && message.trim() && !/^\d{3}$/.test(message.trim())) return message;
  return FRIENDLY_STATUS_MESSAGES[status] || fallback;
};

export default getUserFacingError;
