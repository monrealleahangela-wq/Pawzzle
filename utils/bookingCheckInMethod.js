const BOOKING_CHECK_IN_METHODS = Object.freeze(['qr', 'backup_code']);

const isBookingCheckInMethod = value => BOOKING_CHECK_IN_METHODS.includes(value);

module.exports = {
  BOOKING_CHECK_IN_METHODS,
  isBookingCheckInMethod
};
