const Attendance = require('../models/Attendance');
const Store = require('../models/Store');
const User = require('../models/User');
const { calculateAttendance } = require('../utils/hrPolicy');
const { createNotification } = require('../controllers/notificationController');

const configuredMaximum = store => {
  const policy = store?.hrSettings?.autoClockOut;
  const minutes = Number(policy?.maximumShiftMinutes);
  return policy?.enabled === true && Number.isFinite(minutes) && minutes >= 60 && minutes <= 1440 ? minutes : null;
};

const systemTimeOutPoint = at => ({
  at,
  validationStatus: 'system_generated',
  userAgent: 'Pawzzle attendance automation'
});

const processStoreAutoClockOuts = async (store, now = new Date(), io = null, dependencies = {}) => {
  const AttendanceModel = dependencies.Attendance || Attendance;
  const UserModel = dependencies.User || User;
  const sendNotification = dependencies.createNotification || createNotification;
  const maximumShiftMinutes = configuredMaximum(store);
  if (!maximumShiftMinutes) return 0;
  const threshold = new Date(now.getTime() - maximumShiftMinutes * 60000);
  const openRecords = await AttendanceModel.find({
    store: store._id,
    'timeIn.at': { $lte: threshold },
    'timeOut.at': { $exists: false }
  });
  let processed = 0;
  for (const record of openRecords) {
    const generatedAt = new Date(record.timeIn.at.getTime() + maximumShiftMinutes * 60000);
    const computed = calculateAttendance({
      timeIn: record.timeIn.at,
      timeOut: generatedAt,
      schedule: record.schedule,
      graceMinutes: store.hrSettings?.gracePeriodMinutes,
      overtimeEnabled: store.hrSettings?.overtime?.enabled
    });
    const updated = await AttendanceModel.findOneAndUpdate(
      { _id: record._id, store: store._id, 'timeOut.at': { $exists: false } },
      {
        $set: {
          timeOut: systemTimeOutPoint(generatedAt),
          ...computed,
          autoClockOutReview: {
            status: 'pending',
            generatedAt,
            maximumShiftMinutes
          }
        },
        $addToSet: { suspiciousReasons: 'System auto clock-out requires review' }
      },
      { new: true, runValidators: true }
    );
    if (!updated) continue;
    processed += 1;
    await sendNotification({
      recipient: updated.employee,
      type: 'attendance_update',
      title: 'Attendance auto clock-out',
      message: `Your ${updated.workDate} attendance was closed at the configured maximum shift duration and requires review.`,
      relatedId: updated._id,
      relatedModel: 'Attendance',
      targetUrl: '/staff/attendance'
    }, io);
    const reviewers = await UserModel.find({
      store: store._id,
      isActive: true,
      isDeleted: false,
      $or: [
        { role: { $in: ['admin', 'store_owner', 'manager'] } },
        { role: 'staff', staffType: { $in: ['manager', 'administrative_support'] } }
      ]
    }).select('_id').lean();
    const employeeId = String(updated.employee?._id || updated.employee);
    await Promise.all(reviewers
      .filter(reviewer => String(reviewer._id) !== employeeId)
      .map(reviewer => sendNotification({
        recipient: reviewer._id,
        type: 'attendance_update',
        title: 'Auto clock-out review required',
        message: `An attendance record for ${updated.workDate} reached the Store's configured maximum shift duration.`,
        relatedId: updated._id,
        relatedModel: 'Attendance',
        targetUrl: '/admin/hr?tab=attendance'
      }, io)));
  }
  return processed;
};

const processAttendanceAutoClockOuts = async (io = null, now = new Date()) => {
  const stores = await Store.find({
    'hrSettings.autoClockOut.enabled': true,
    'hrSettings.autoClockOut.maximumShiftMinutes': { $gte: 60, $lte: 1440 }
  });
  let processed = 0;
  for (const store of stores) processed += await processStoreAutoClockOuts(store, now, io);
  return processed;
};

module.exports = {
  configuredMaximum,
  processStoreAutoClockOuts,
  processAttendanceAutoClockOuts
};
