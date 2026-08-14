const User = require('../models/User');
const Store = require('../models/Store');
const { createNotification } = require('../controllers/notificationController');

const DAY_MS = 24 * 60 * 60 * 1000;

const getExpirationWindow = (expiresAt, now = new Date()) => {
  if (!expiresAt) return null;
  const remainingDays = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS);
  if (remainingDays <= 0) return { key: 'expired', field: 'expiredSentAt', remainingDays };
  if (remainingDays <= 7) return { key: 'seven_day', field: 'sevenDaySentAt', remainingDays };
  if (remainingDays <= 30) return { key: 'thirty_day', field: 'thirtyDaySentAt', remainingDays };
  return null;
};

const processStaffCredentialExpirations = async (io) => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * DAY_MS);
  const staffMembers = await User.find({
    isDeleted: false,
    'professionalProfile.credentialDocuments': {
      $elemMatch: { status: { $in: ['pending_verification', 'verified'] }, expiresAt: { $lte: horizon } }
    }
  }).select('firstName lastName role staffType store professionalProfile.verification professionalProfile.credentialDocuments');

  let notificationsCreated = 0;
  for (const staff of staffMembers) {
    const store = staff.store ? await Store.findById(staff.store).select('owner') : null;
    for (const document of staff.professionalProfile?.credentialDocuments || []) {
      if (document.status === 'archived') continue;
      const window = getExpirationWindow(document.expiresAt, now);
      if (!window || document.reminderHistory?.[window.field]) continue;
      const set = { [`professionalProfile.credentialDocuments.$[document].reminderHistory.${window.field}`]: now };
      if (window.key === 'expired') {
        set['professionalProfile.credentialDocuments.$[document].status'] = 'expired';
        const role = staff.role === 'staff' ? staff.staffType : staff.role;
        const hasAlternateCredential = (staff.professionalProfile?.credentialDocuments || []).some(candidate =>
          String(candidate._id) !== String(document._id)
          && candidate.status === 'verified'
          && (!candidate.expiresAt || new Date(candidate.expiresAt) > now)
          && (role !== 'veterinarian' || candidate.documentType === 'professional_license')
        );
        const requiredCredentialExpired = !hasAlternateCredential
          && (role === 'veterinarian'
            ? document.documentType === 'professional_license'
            : staff.professionalProfile?.verification?.isRequired);
        if (requiredCredentialExpired) {
          set['professionalProfile.verification.status'] = 'expired';
        }
      }
      const claimed = await User.updateOne(
        {
          _id: staff._id,
          professionalProfile: { $exists: true },
          'professionalProfile.credentialDocuments': {
            $elemMatch: { _id: document._id, [`reminderHistory.${window.field}`]: { $exists: false } }
          }
        },
        { $set: set },
        { arrayFilters: [{ 'document._id': document._id }] }
      );
      if (!claimed.modifiedCount) continue;

      const title = window.key === 'expired' ? 'Professional Credential Expired' : 'Professional Credential Expiring Soon';
      const timing = window.key === 'expired' ? 'has expired' : `expires in ${window.remainingDays} day${window.remainingDays === 1 ? '' : 's'}`;
      const message = `${document.name} ${timing}. Renew it before accepting future assignments that require verification.`;
      const recipients = [...new Set([String(staff._id), store?.owner ? String(store.owner) : null].filter(Boolean))];
      await Promise.all(recipients.map(recipient => createNotification({
        recipient,
        type: 'schedule_change',
        title,
        message,
        relatedId: staff._id,
        relatedModel: 'User',
        targetUrl: recipient === String(staff._id) ? '/profile' : '/admin/staff'
      }, io)));
      notificationsCreated += recipients.length;
    }
  }
  return { staffChecked: staffMembers.length, notificationsCreated };
};

module.exports = { DAY_MS, getExpirationWindow, processStaffCredentialExpirations };
