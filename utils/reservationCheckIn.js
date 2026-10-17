const crypto = require('crypto');

const QR_PREFIX = 'PZQ1.';
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, 5 bits each
// The credential is visible before the appointment, but check-in itself opens
// at the scheduled start and closes at the scheduled end.
const EARLY_MINUTES = 0;
const LATE_MINUTES = 0;

const getMasterKey = (value = process.env.RESERVATION_CREDENTIAL_ENCRYPTION_KEY) => {
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/i.test(value)) {
    const error = new Error('Reservation verification is temporarily unavailable.');
    error.code = 'RESERVATION_KEY_UNAVAILABLE';
    throw error;
  }
  return Buffer.from(value, 'hex');
};

const deriveKey = (purpose, master) => Buffer.from(crypto.hkdfSync(
  'sha256', master || getMasterKey(), Buffer.from('pawzzle-reservation-v1'), Buffer.from(purpose), 32
));

const digestSecret = (secret, kind, master) => crypto.createHmac('sha256', deriveKey(`lookup:${kind}`, master))
  .update(secret, 'utf8').digest('hex');

const encryptSecret = (secret, master) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('encryption', master), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('hex') };
};

const decryptSecret = (value, master) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('encryption', master), Buffer.from(value.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'hex')), decipher.final()]).toString('utf8');
};

const generateCredentials = () => {
  const qrToken = `${QR_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  const bytes = crypto.randomBytes(16);
  const backupCode = Array.from(bytes, byte => BACKUP_ALPHABET[byte & 31]).join('').match(/.{1,4}/g).join('-');
  return { qrToken, backupCode };
};

const normalizeBackupCode = value => typeof value === 'string'
  ? value.toUpperCase().replace(/[\s-]/g, '')
  : '';

const bookingFingerprint = booking => crypto.createHash('sha256').update(JSON.stringify([
  String(booking._id), String(booking.customer?._id || booking.customer), String(booking.store?._id || booking.store),
  String(booking.service?._id || booking.service), String(booking.staff?._id || booking.staff || ''),
  booking.bookingLocalDate || booking.bookingDate?.toISOString?.() || '', booking.startTime, booking.endTime,
  Number(booking.proposal?.revision || 0), String(booking.paymentDetails?.paymentId || '')
])).digest('hex');

const parseDateAndTime = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const validDate = new Date(Date.UTC(year, month - 1, day));
  if (validDate.getUTCFullYear() !== year || validDate.getUTCMonth() !== month - 1 || validDate.getUTCDate() !== day) return null;
  return { year, month, day, hour, minute };
};

const zonedLocalTimeToUtc = (date, time, timeZone) => {
  const desired = parseDateAndTime(date, time);
  if (!desired || typeof timeZone !== 'string') return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    const target = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
    const offsets = new Set();
    for (let hours = -48; hours <= 48; hours += 6) {
      const probe = target + hours * 3600000;
      const parts = Object.fromEntries(formatter.formatToParts(new Date(probe)).map(part => [part.type, part.value]));
      const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
      offsets.add(Math.round((represented - probe) / 60000));
    }
    const candidates = [...offsets].map(offset => new Date(target - offset * 60000)).filter(candidate => {
      const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]));
      return Number(parts.year) === desired.year && Number(parts.month) === desired.month && Number(parts.day) === desired.day
        && Number(parts.hour) === desired.hour && Number(parts.minute) === desired.minute && Number(parts.second) === 0;
    });
    const unique = [...new Map(candidates.map(candidate => [candidate.getTime(), candidate])).values()];
    return unique.length === 1 ? unique[0] : null;
  } catch (error) {
    return null;
  }
};

const getCheckInWindow = (booking, timeZone = 'Asia/Manila') => {
  let date = booking.bookingLocalDate;
  if (!date) {
    try {
      date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(booking.bookingDate));
    } catch (error) { return null; }
  }
  const start = zonedLocalTimeToUtc(date, booking.startTime, timeZone);
  if (!start) return null;
  const startParts = parseDateAndTime(date, booking.startTime);
  const [endHour, endMinute] = String(booking.endTime || '').split(':').map(Number);
  if (!startParts || !Number.isInteger(endHour) || !Number.isInteger(endMinute)) return null;
  let endDate = date;
  if (endHour * 60 + endMinute < startParts.hour * 60 + startParts.minute) {
    const nextDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day + 1));
    endDate = nextDate.toISOString().slice(0, 10);
  }
  const end = zonedLocalTimeToUtc(endDate, booking.endTime, timeZone);
  return end && end > start ? { start, end, opensAt: start, closesAt: end } : null;
};

const getWindowState = (booking, now, timeZone) => {
  if (booking.isScanned || booking.checkedInAt || booking.serviceProgress?.status === 'pet_arrived') return { state: 'checked_in', reason: 'already_checked_in', window: null };
  if (['cancelled', 'no_show', 'rejected', 'confirmation_expired'].includes(booking.status)) return { state: 'cancelled', reason: 'cancelled', window: null };
  if (!['confirmed', 'approved'].includes(booking.status)) return { state: 'unconfirmed', reason: 'unconfirmed', window: null };
  if (booking.paymentStatus !== 'paid') return { state: 'unavailable', reason: 'payment_required', window: null };
  const window = getCheckInWindow(booking, timeZone);
  if (!window) return { state: 'unavailable', reason: 'ineligible', window: null };
  if (now < window.opensAt) return { state: 'too_early', reason: 'too_early', window };
  if (now > window.closesAt) return { state: 'expired', reason: 'window_expired', window };
  return { state: 'available', reason: null, window };
};

module.exports = {
  QR_PREFIX, EARLY_MINUTES, LATE_MINUTES, getMasterKey, deriveKey, digestSecret,
  encryptSecret, decryptSecret, generateCredentials, normalizeBackupCode,
  bookingFingerprint, zonedLocalTimeToUtc, getCheckInWindow, getWindowState
};
