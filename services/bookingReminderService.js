const Booking = require('../models/Booking');
const PetServiceUpdate = require('../models/PetServiceUpdate');
const { createNotification } = require('../controllers/notificationController');

const HOUR = 60 * 60 * 1000;

const getScheduledStart = booking => {
  const date = new Date(booking.bookingDate);
  const [hours, minutes] = String(booking.startTime || '').split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || Number.isNaN(date.getTime())) return null;
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const reminderWindow = (booking, now = new Date()) => {
  const scheduled = getScheduledStart(booking);
  if (!scheduled) return null;
  const remaining = scheduled.getTime() - now.getTime();
  if (remaining <= 0) return null;
  if (remaining <= 2 * HOUR) return { key: 'twoHourSentAt', label: '2-hour', remaining };
  if (remaining <= 24 * HOUR) return { key: 'twentyFourHourSentAt', label: '24-hour', remaining };
  return null;
};

const claimReminder = async (booking, window, now) => Booking.findOneAndUpdate({
  _id: booking._id,
  status: { $in: ['confirmed', 'approved'] },
  paymentStatus: 'paid',
  $or: [
    { [`reminders.${window.key}`]: { $exists: false } },
    { [`reminders.${window.key}`]: null }
  ]
}, { $set: { [`reminders.${window.key}`]: now, updatedAt: now } }, { new: false });

const processBookingReminders = async (now = new Date()) => {
  const horizon = new Date(now.getTime() + 25 * HOUR);
  const bookings = await Booking.find({
    status: { $in: ['confirmed', 'approved'] },
    paymentStatus: 'paid',
    bookingDate: { $lte: horizon },
    isDeleted: { $ne: true }
  }).populate('store', 'name').populate('staff', 'firstName lastName');

  let sent = 0;
  for (const booking of bookings) {
    const window = reminderWindow(booking, now);
    if (!window || booking.reminders?.[window.key]) continue;
    const claimed = await claimReminder(booking, window, now);
    if (!claimed) continue;
    const specialist = booking.staff
      ? `${booking.staff.firstName || ''} ${booking.staff.lastName || ''}`.trim()
      : 'your assigned specialist';
    const branch = booking.store?.name || 'the selected branch';
    const message = `${window.label} reminder: ${booking.pet?.name || 'Your pet'} is scheduled at ${booking.startTime} with ${specialist} at ${branch}.`;
    await Promise.all([
      PetServiceUpdate.create({
        booking: booking._id,
        pet: booking.petProfile || null,
        petSnapshot: { name: booking.pet?.name || 'Pet', type: booking.pet?.type || '' },
        customer: booking.customer,
        store: booking.store?._id || booking.store,
        entryType: 'reminder',
        visibility: 'customer',
        category: 'follow_up',
        stage: 'scheduled',
        message,
        createdBy: booking.addedBy
      }),
      createNotification({
        recipient: booking.customer,
        sender: booking.addedBy,
        type: 'schedule_change',
        title: `${window.label} Service Reminder`,
        message,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/bookings?id=${booking._id}`
      })
    ]);
    sent += 1;
  }
  return sent;
};

module.exports = { getScheduledStart, reminderWindow, processBookingReminders };
