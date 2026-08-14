const User = require('../models/User');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const crypto = require('crypto');
const { sendStaffInvitation } = require('../utils/emailService');
const Delivery = require('../models/Delivery');
const RiderEarning = require('../models/RiderEarning');
const RiderPayout = require('../models/RiderPayout');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const ActivityLog = require('../models/ActivityLog');
const { createNotification } = require('./notificationController');
const { normalizeRole, getEffectivePermissions } = require('../config/permissions');
const { policyForRole } = require('../services/rolePermissionService');
const {
    SPECIALIZED_STAFF_ROLES,
    getEnabledSpecializedRoles,
    isRoleEligibleForService,
    getStaffSpecializationRole,
    getProfessionalVerificationStatus
} = require('../utils/staffSpecialization');

const RIDER_STATUSES = ['active', 'inactive', 'suspended'];
const PHONE_PATTERN = /^(?:\+?63|0)9\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const cleanList = value => (Array.isArray(value) ? value : String(value || '').split(','))
    .map(item => String(item || '').trim()).filter(Boolean).slice(0, 30);
const cleanAvailability = (value = {}, existing = {}) => Object.fromEntries(DAYS.map(day => {
    const input = value?.[day] || existing?.[day];
    if (!input) return [day, undefined];
    return [day, {
        available: Boolean(input.available), start: input.start || '09:00', end: input.end || '17:00',
        breaks: (input.breaks || []).filter(item => item?.start && item?.end).slice(0, 4)
    }];
}));
const cleanLeaveSchedule = value => (Array.isArray(value) ? value : []).slice(0, 100).map(item => ({
    startDate: item?.startDate,
    endDate: item?.endDate,
    reason: String(item?.reason || '').trim().slice(0, 500)
})).filter(item => item.startDate && item.endDate && new Date(item.startDate) <= new Date(item.endDate));
const cleanUnavailable = (value = {}, existing = {}, emergency = false) => ({
    active: Boolean(value.active ?? existing.active),
    ...(emergency
        ? { since: value.since || existing.since || (value.active ? new Date() : undefined) }
        : { until: value.until || existing.until || undefined }),
    reason: String(value.reason ?? existing.reason ?? '').trim().slice(0, 500)
});
const cleanProfessionalProfile = (profile = {}, existing = {}) => ({
    staffId: String(profile.staffId ?? existing.staffId ?? '').trim().toUpperCase() || undefined,
    professionalTitle: String(profile.professionalTitle ?? existing.professionalTitle ?? '').trim(),
    specialty: String(profile.specialty ?? existing.specialty ?? '').trim(),
    qualifications: cleanList(profile.qualifications ?? existing.qualifications),
    certifications: cleanList(profile.certifications ?? (existing.certifications || []).map(item => item.name)).map(name => {
        const prior = (existing.certifications || []).find(item => item.name === name);
        const priorObject = prior?.toObject ? prior.toObject() : prior;
        return priorObject ? { ...priorObject, name } : { name };
    }),
    training: cleanList(profile.training ?? existing.training),
    areasOfExpertise: cleanList(profile.areasOfExpertise ?? existing.areasOfExpertise),
    languages: cleanList(profile.languages ?? existing.languages),
    experienceYears: Math.max(0, Number(profile.experienceYears ?? existing.experienceYears ?? 0)),
    registration: {
        type: String(profile.registration?.type ?? existing.registration?.type ?? '').trim(),
        number: String(profile.registration?.number ?? existing.registration?.number ?? '').trim(),
        issuingBody: String(profile.registration?.issuingBody ?? existing.registration?.issuingBody ?? '').trim(),
        expiresAt: profile.registration?.expiresAt || existing.registration?.expiresAt || undefined
    },
    verification: existing.verification?.toObject ? existing.verification.toObject() : (existing.verification || undefined),
    credentialDocuments: (existing.credentialDocuments || []).map(item => item?.toObject ? item.toObject() : item),
    availability: cleanAvailability(profile.availability, existing.availability),
    leaveSchedule: cleanLeaveSchedule(profile.leaveSchedule ?? existing.leaveSchedule),
    temporaryUnavailable: cleanUnavailable(profile.temporaryUnavailable, existing.temporaryUnavailable),
    emergencyUnavailable: cleanUnavailable(profile.emergencyUnavailable, existing.emergencyUnavailable, true),
    bio: String(profile.bio ?? existing.bio ?? '').trim(),
    isPublic: profile.isPublic ?? existing.isPublic ?? true,
    rating: Number(existing.rating || 0),
    reviewCount: Number(existing.reviewCount || 0)
});
const isSpecializedAccount = user => SPECIALIZED_STAFF_ROLES.includes(getStaffSpecializationRole(user));
const DIRECT_STAFF_ROLES = ['manager', 'service_staff', 'cashier', 'inventory_staff', 'procurement_officer', 'finance_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff', 'delivery_dispatcher', 'delivery_rider'];
const staffAccountFilter = (extra = {}, options = {}) => ({
    ...extra,
    isDeleted: false,
    ...(options.onlyArchived ? { staffStatus: 'archived' } : options.includeArchived ? {} : { staffStatus: { $ne: 'archived' } }),
    $or: [{ role: 'staff' }, { role: { $in: DIRECT_STAFF_ROLES } }]
});
const hasSufficientVerifiedCredential = (staff, now = new Date()) => {
    const role = getStaffSpecializationRole(staff);
    return (staff.professionalProfile?.credentialDocuments || []).some(document =>
        document.status === 'verified'
        && (!document.expiresAt || new Date(document.expiresAt) > now)
        && (role !== 'veterinarian' || document.documentType === 'professional_license')
    );
};
const validateSpecialist = (staffType, profile, phone, enabledRoles) => {
    if (!SPECIALIZED_STAFF_ROLES.includes(staffType)) return null;
    if (!enabledRoles.includes(staffType)) return 'This role is not enabled because the store does not currently offer a relevant service.';
    if (!profile.staffId) return 'Staff ID is required for specialized staff.';
    if (!profile.specialty) return 'Specialty or area of practice is required.';
    if (!PHONE_PATTERN.test(String(phone || '').replace(/[\s-]/g, ''))) return 'Enter a valid Philippine mobile number.';
    if (!Number.isFinite(profile.experienceYears) || profile.experienceYears < 0 || profile.experienceYears > 80) return 'Years of experience must be between 0 and 80.';
    return null;
};
const validateAssignedServices = async ({ storeId, staffType, assignedServices = [] }) => {
    const uniqueIds = [...new Set((assignedServices || []).map(String).filter(Boolean))];
    if (uniqueIds.some(id => !mongoose.Types.ObjectId.isValid(id))) throw Object.assign(new Error('One or more assigned services are invalid.'), { statusCode: 400 });
    const services = await Service.find({ _id: { $in: uniqueIds }, store: storeId, isActive: true, isDeleted: { $ne: true } });
    if (services.length !== uniqueIds.length) throw Object.assign(new Error('One or more assigned services are invalid or belong to another branch.'), { statusCode: 400 });
    const incompatible = services.find(service => !isRoleEligibleForService(staffType, service));
    if (incompatible) throw Object.assign(new Error(`${incompatible.name} is not appropriate for the selected staff role.`), { statusCode: 400 });
    return services;
};
const syncAssignedServices = async (staffId, storeId, serviceIds) => {
    await Service.updateMany({ store: storeId, assignedStaff: staffId, _id: { $nin: serviceIds } }, { $pull: { assignedStaff: staffId } });
    if (serviceIds.length) await Service.updateMany({ store: storeId, _id: { $in: serviceIds } }, { $addToSet: { assignedStaff: staffId } });
};
const getOwnedStoreIds = async (user) => {
    if (['super_admin', 'platform_admin'].includes(user.role)) return null;
    if (user.store) return [user.store._id || user.store];
    const stores = await Store.find({ owner: user._id }).select('_id');
    return stores.map(store => store._id);
};
const canAccessStore = async (user, storeId) => {
    if (['super_admin', 'platform_admin'].includes(user.role)) return true;
    const ids = await getOwnedStoreIds(user);
    return ids.some(id => id.toString() === storeId.toString());
};
const reserveStaffId = async storeId => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const store = await Store.findOneAndUpdate({ _id: storeId }, { $inc: { staffSequence: 1 } }, { new: true }).select('+staffSequence');
        if (!store) throw Object.assign(new Error('Store branch not found.'), { statusCode: 404 });
        const staffId = `STF-${String(store.staffSequence).padStart(4, '0')}`;
        const exists = await User.exists({ isDeleted: false, $or: [{ 'professionalProfile.staffId': staffId }, { 'riderProfile.staffId': staffId }] });
        if (!exists) return staffId;
    }
    throw Object.assign(new Error('Unable to allocate a unique staff ID.'), { statusCode: 409 });
};
const logStaffActivity = (staffId, action, details, req) => ActivityLog.create({ user: staffId, action, details, ipAddress: req.ip });
const notifyStaff = (staffId, req, title, message) => createNotification({
    recipient: staffId, sender: req.user._id, type: 'user_action', title, message,
    relatedId: staffId, relatedModel: 'User', targetUrl: '/profile'
}, req.app.get('socketio'));
const currentAvailabilityStatus = (member, activeWork = 0, now = new Date()) => {
    if (member.staffStatus === 'archived') return 'archived';
    if (!member.isActive || member.staffStatus !== 'active') return member.staffStatus || 'inactive';
    const profile = member.professionalProfile || {};
    if (profile.emergencyUnavailable?.active) return 'emergency_unavailable';
    if (profile.temporaryUnavailable?.active && (!profile.temporaryUnavailable.until || new Date(profile.temporaryUnavailable.until) >= now)) return 'temporary_unavailable';
    if ((profile.leaveSchedule || []).some(leave => new Date(leave.startDate) <= now && new Date(leave.endDate).setHours(23, 59, 59, 999) >= now)) return 'on_leave';
    const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const workingDay = profile.availability?.[day];
    if (workingDay?.available && (workingDay.breaks || []).some(item => item.start <= currentTime && currentTime < item.end)) return 'break';
    if (activeWork > 0) return 'busy';
    return 'available';
};
const cleanRiderProfile = (profile = {}, existing = {}) => ({
    staffId: String(profile.staffId || existing.staffId || '').trim().toUpperCase(),
    accountStatus: profile.accountStatus || existing.accountStatus || 'active',
    vehicleType: profile.vehicleType ?? existing.vehicleType ?? '',
    plateNumber: String(profile.plateNumber ?? existing.plateNumber ?? '').trim().toUpperCase(),
    licenseId: String(profile.licenseId ?? existing.licenseId ?? '').trim(),
    deliveryZone: String(profile.deliveryZone ?? existing.deliveryZone ?? '').trim(),
    earningRules: {
        baseRate: Number(profile.earningRules?.baseRate ?? existing.earningRules?.baseRate ?? 0),
        incentive: Number(profile.earningRules?.incentive ?? existing.earningRules?.incentive ?? 0),
        bonus: Number(profile.earningRules?.bonus ?? existing.earningRules?.bonus ?? 0),
        deduction: Number(profile.earningRules?.deduction ?? existing.earningRules?.deduction ?? 0)
    },
    payoutMethod: {
        type: profile.payoutMethod?.type ?? existing.payoutMethod?.type ?? '',
        accountName: String(profile.payoutMethod?.accountName ?? existing.payoutMethod?.accountName ?? '').trim(),
        accountNumber: String(profile.payoutMethod?.accountNumber ?? existing.payoutMethod?.accountNumber ?? '').trim(),
        bankName: String(profile.payoutMethod?.bankName ?? existing.payoutMethod?.bankName ?? '').trim()
    }
});
const validateRider = (profile, phone) => {
    if (!profile.staffId) return 'Staff ID is required for a Delivery Rider.';
    if (!PHONE_PATTERN.test(String(phone || '').replace(/[\s-]/g, ''))) return 'Enter a valid Philippine mobile number.';
    if (!profile.vehicleType) return 'Vehicle type is required for a Delivery Rider.';
    if (profile.vehicleType !== 'bicycle' && !profile.plateNumber) return 'Vehicle plate number is required.';
    if (!RIDER_STATUSES.includes(profile.accountStatus)) return 'Invalid rider account status.';
    if (Object.values(profile.earningRules).some(value => !Number.isFinite(value) || value < 0)) return 'Earning values must be valid non-negative amounts.';
    if (profile.earningRules.deduction > profile.earningRules.baseRate + profile.earningRules.incentive + profile.earningRules.bonus) return 'Deduction cannot exceed the rider earning.';
    if (profile.payoutMethod.type && (!profile.payoutMethod.accountName || !profile.payoutMethod.accountNumber)) return 'Complete the selected payout account details.';
    return null;
};

/**
 * Get all staff under the current admin's store
 */
const getMyStaff = async (req, res) => {
    try {
        const { storeId, archived } = req.query;
        let query = staffAccountFilter({}, { onlyArchived: archived === 'true', includeArchived: archived === 'all' });

        if (['super_admin', 'platform_admin'].includes(req.user.role)) {
            if (storeId) query.store = storeId;
        } else {
            const storeIds = await getOwnedStoreIds(req.user);

            if (storeId) {
                if (!storeIds.map(id => id.toString()).includes(storeId)) {
                    return res.status(403).json({ message: 'Access denied to this store' });
                }
                query.store = storeId;
            } else {
                query.store = { $in: storeIds };
            }
        }

        const staff = await User.find(query)
            .populate('store', 'name')
            .select('-password')
            .sort({ createdAt: -1 }).lean();

        const staffIds = staff.map(member => member._id);
        const [services, workloads] = await Promise.all([
            staffIds.length ? Service.find({ assignedStaff: { $in: staffIds }, isDeleted: { $ne: true } })
                .select('name category store assignedStaff duration isActive').lean() : [],
            staffIds.length ? Booking.aggregate([
                { $match: { staff: { $in: staffIds }, status: { $in: ['processing', 'finished'] }, isDeleted: { $ne: true } } },
                { $group: { _id: '$staff', count: { $sum: 1 } } }
            ]) : []
        ]);
        const workloadMap = new Map(workloads.map(row => [String(row._id), row.count]));
        const withServices = staff.map(member => ({
            ...member,
            staffType: getStaffSpecializationRole(member),
            assignedServices: services.filter(service => service.assignedStaff.some(id => id.toString() === member._id.toString())),
            activeWorkload: workloadMap.get(String(member._id)) || 0,
            availabilityStatus: currentAvailabilityStatus(member, workloadMap.get(String(member._id)) || 0)
        }));

        res.json({ staff: withServices });
    } catch (error) {
        console.error('getMyStaff error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Create a new staff account under the admin's store
 */
const createStaff = async (req, res) => {
    console.log('--- 🚀 INITIATING STAFF ONBOARDING 🚀 ---');
    try {
        const { firstName, lastName, email, username, phone, address, avatar, staffType, targetStoreId, riderProfile,
            professionalProfile, assignedServices = [], staffStatus = 'active', temporaryPassword } = req.body;

        // Standardize inputs
        const cleanEmail = email?.trim().toLowerCase();
        const cleanUsername = username?.trim();
        const cleanFirstName = firstName?.trim();
        const cleanLastName = lastName?.trim();

        if (!cleanEmail || !cleanFirstName || !cleanLastName || !cleanUsername || !staffType || !targetStoreId) {
            return res.status(400).json({ message: 'Missing required staff metadata fields' });
        }
        if (!EMAIL_PATTERN.test(cleanEmail)) return res.status(400).json({ message: 'Enter a valid email address.' });
        if (!User.schema.path('staffType').enumValues.includes(staffType)) return res.status(400).json({ message: 'Invalid staff role.' });
        if (!['active', 'inactive', 'suspended'].includes(staffStatus)) return res.status(400).json({ message: 'Invalid staff status.' });

        // Verify store access
        if (!['super_admin', 'platform_admin'].includes(req.user.role)) {
            if (!(await canAccessStore(req.user, targetStoreId))) {
                return res.status(403).json({ message: 'Store access denied' });
            }
        }

        // Check uniqueness
        const existingUser = await User.findOne({
            $or: [{ email: cleanEmail }, { username: cleanUsername }],
            isDeleted: false
        });

        if (existingUser) {
            return res.status(409).json({
                message: existingUser.email === cleanEmail
                    ? 'Email is already registered.'
                    : 'Username is already taken.'
            });
        }

        // 🛡️ SECURITY: Generate temporary secure password
        const generatedPassword = `Pw!${crypto.randomBytes(7).toString('hex')}`;
        const tempPassword = String(temporaryPassword || generatedPassword);
        if (temporaryPassword && (tempPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(tempPassword))) {
            return res.status(400).json({ message: 'Temporary password must include upper, lower, numeric, and symbol characters.' });
        }
        const store = await Store.findById(targetStoreId);
        if (!store) return res.status(404).json({ message: 'Store branch not found.' });
        const generatedStaffId = await reserveStaffId(targetStoreId);
        const storeServices = await Service.find({ store: targetStoreId, isActive: true, isDeleted: { $ne: true } });
        const normalizedProfessionalProfile = cleanProfessionalProfile(professionalProfile);
        normalizedProfessionalProfile.staffId = generatedStaffId;
        let normalizedRiderProfile;
        if (staffType === 'delivery_rider') {
            normalizedRiderProfile = cleanRiderProfile({ ...(riderProfile || {}), staffId: generatedStaffId });
            const riderError = validateRider(normalizedRiderProfile, phone);
            if (riderError) return res.status(400).json({ message: riderError });
        }
        if (SPECIALIZED_STAFF_ROLES.includes(staffType)) {
            normalizedProfessionalProfile.verification = {
                status: 'pending_verification',
                isRequired: staffType === 'veterinarian' || Boolean(professionalProfile?.verification?.isRequired),
                notes: ''
            };
        }
        const specialistError = validateSpecialist(staffType, normalizedProfessionalProfile, phone, getEnabledSpecializedRoles(storeServices));
        if (specialistError) return res.status(400).json({ message: specialistError });
        if (SPECIALIZED_STAFF_ROLES.includes(staffType) && !assignedServices.length) return res.status(400).json({ message: 'Assign at least one existing service to specialized staff.' });
        const validatedServices = await validateAssignedServices({ storeId: targetStoreId, staffType, assignedServices });
        // Use store address as base
        let staffAddress = { street: 'N/A', city: 'N/A', province: 'Cavite', barangay: 'N/A', country: 'PH' };
        if (store?.contactInfo?.address) {
            staffAddress = {
                street: store.contactInfo.address.street || 'N/A',
                city: store.contactInfo.address.city || 'N/A',
                province: store.contactInfo.address.state || store.contactInfo.address.province || 'Cavite',
                barangay: store.contactInfo.address.barangay || 'N/A',
                zipCode: store.contactInfo.address.zipCode || '',
                country: 'PH'
            };
        }

        const staff = new User({
            firstName: cleanFirstName,
            lastName: cleanLastName,
            email: cleanEmail,
            username: cleanUsername,
            password: tempPassword,
            phone: phone || '',
            avatar: String(avatar || '').trim(),
            role: 'staff',
            staffType,
            store: targetStoreId,
            createdBy: req.user._id,
            isActive: staffType === 'delivery_rider' ? normalizedRiderProfile.accountStatus === 'active' : staffStatus === 'active',
            staffStatus: staffType === 'delivery_rider' ? normalizedRiderProfile.accountStatus : staffStatus,
            requiresPasswordChange: true,
            address: staffAddress,
            permissions: {}
        });
        if (normalizedRiderProfile) staff.riderProfile = normalizedRiderProfile;
        staff.professionalProfile = normalizedProfessionalProfile;

        await staff.save();
        await syncAssignedServices(staff._id, targetStoreId, validatedServices.map(service => service._id));
        await logStaffActivity(staff._id, 'Staff Created', `${cleanFirstName} ${cleanLastName} was created as ${staffType} with ID ${generatedStaffId}.`, req);
        await notifyStaff(staff._id, req, staff.isActive ? 'Staff Account Activated' : 'Staff Account Created', `Your ${staffType.replaceAll('_', ' ')} account was created for ${store.name}.`);
        console.log('✅ Staff record saved.');

        // 📧 Send Invitation Email
        let emailResult = { success: false };
        try {
            emailResult = await sendStaffInvitation(cleanEmail, tempPassword, cleanFirstName);
        } catch (emailErr) {
            console.error('❌ Email Task Error:', emailErr.message);
            emailResult = { success: false, error: emailErr.message };
        }
        
        const emailSent = emailResult.success;
        const staffObj = staff.toObject();
        delete staffObj.password;

        let message = emailSent 
            ? 'Staff account created and invitation sent successfully.' 
            : `Staff created, but email failed: ${emailResult.errorMessage || emailResult.error || 'Unknown service error'}.`;
        
        return res.status(201).json({ 
            message: message,
            staff: staffObj,
            emailSent: emailSent,
            emailProvider: emailResult.provider,
            emailError: emailResult.errorMessage || emailResult.error,
            credentialsProvided: true
        });
    } catch (error) {
        console.error('CRITICAL: createStaff catch-all triggered:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: `Validation Failed: ${messages.join(', ')}` });
        }
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : error.code === 11000 ? 'Identity already exists' : 'Internal server failure during staff boarding',
            error: error.message
        });
    }
};

/**
 * Update a staff member's details
 */
const updateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, phone, address, avatar, staffType, isActive, riderProfile,
            professionalProfile, assignedServices, staffStatus, confirmRoleChange, confirmUpcoming,
            targetStoreId, confirmBranchChange } = req.body;

        const query = staffAccountFilter({ _id: id });

        const staff = await User.findOne(query);
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found or access denied' });
        }
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found or access denied' });
        const previousStatus = staff.staffStatus;
        const previousRole = getStaffSpecializationRole(staff);
        const previousSchedule = JSON.stringify(staff.professionalProfile?.availability || {});
        const originalStoreId = staff.store;
        const resultingStoreId = targetStoreId || staff.store;
        const branchChanged = String(resultingStoreId) !== String(staff.store);
        if (branchChanged) {
            if (!(await canAccessStore(req.user, resultingStoreId))) return res.status(403).json({ message: 'Store branch access denied.' });
            if (!confirmBranchChange) return res.status(409).json({ message: 'Confirm the staff branch change before saving.', requiresBranchChangeConfirmation: true });
            if (!confirmUpcoming) {
                const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
                const upcomingBookings = await Booking.countDocuments({ staff: staff._id, bookingDate: { $gte: startToday }, status: { $nin: ['completed', 'cancelled', 'no_show'] }, isDeleted: { $ne: true } });
                if (upcomingBookings) return res.status(409).json({ message: `${upcomingBookings} upcoming booking${upcomingBookings === 1 ? '' : 's'} remain associated with the current branch.`, requiresUpcomingConfirmation: true, upcomingBookings });
            }
        }

        const existingType = getStaffSpecializationRole(staff);
        const resultingType = staffType || existingType;
        if (!User.schema.path('staffType').enumValues.includes(resultingType) && !(staff.role !== 'staff' && resultingType === staff.role)) return res.status(400).json({ message: 'Invalid staff role.' });
        if (staffType && staffType !== existingType && staff.role !== 'staff') return res.status(400).json({ message: 'Direct specialized roles cannot be converted through the legacy staff-role editor.' });
        if (staffType && staffType !== existingType && !confirmRoleChange) {
            return res.status(409).json({ message: 'Confirm the staff role change before saving.', requiresRoleChangeConfirmation: true, previousRole: existingType, newRole: staffType });
        }
        const resultingStatus = staffStatus || staff.staffStatus || (staff.isActive ? 'active' : 'inactive');
        if (!['active', 'inactive', 'suspended'].includes(resultingStatus)) return res.status(400).json({ message: 'Invalid staff status.' });
        if (staff.isActive && resultingStatus !== 'active' && !confirmUpcoming) {
            const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
            const upcomingBookings = await Booking.countDocuments({ staff: staff._id, bookingDate: { $gte: startToday }, status: { $nin: ['completed', 'cancelled', 'no_show'] }, isDeleted: { $ne: true } });
            if (upcomingBookings) return res.status(409).json({ message: `${upcomingBookings} upcoming booking${upcomingBookings === 1 ? '' : 's'} are assigned to this staff member.`, requiresUpcomingConfirmation: true, upcomingBookings });
        }
        const [targetStore, storeServices] = await Promise.all([
            Store.findById(resultingStoreId),
            Service.find({ store: resultingStoreId, isActive: true, isDeleted: { $ne: true } })
        ]);
        if (!targetStore) return res.status(404).json({ message: 'Store branch not found.' });
        const normalizedProfessional = cleanProfessionalProfile(professionalProfile || {}, staff.professionalProfile || {});
        const specialistError = validateSpecialist(resultingType, normalizedProfessional, phone !== undefined ? phone : staff.phone, getEnabledSpecializedRoles(storeServices));
        if (specialistError) return res.status(400).json({ message: specialistError });
        const requestedServices = assignedServices === undefined
            ? (branchChanged ? [] : storeServices.filter(service => service.assignedStaff.some(memberId => memberId.toString() === staff._id.toString())).map(service => service._id))
            : assignedServices;
        if (SPECIALIZED_STAFF_ROLES.includes(resultingType) && !requestedServices.length) return res.status(400).json({ message: 'Assign at least one existing service to specialized staff.' });
        const validatedServices = await validateAssignedServices({ storeId: resultingStoreId, staffType: resultingType, assignedServices: requestedServices });
        if (normalizedProfessional.staffId) {
            const duplicate = await User.findOne({ _id: { $ne: staff._id }, 'professionalProfile.staffId': normalizedProfessional.staffId, isDeleted: false });
            if (duplicate) return res.status(409).json({ message: 'Staff ID is already registered.' });
        }

        if (firstName) staff.firstName = firstName;
        if (lastName) staff.lastName = lastName;
        if (phone !== undefined) staff.phone = phone;
        if (avatar !== undefined) staff.avatar = String(avatar || '').trim();
        if (branchChanged) {
            staff.store = resultingStoreId;
            const branchAddress = targetStore.contactInfo?.address;
            if (branchAddress) staff.address = {
                street: branchAddress.street || 'N/A', city: branchAddress.city || 'N/A',
                province: branchAddress.state || branchAddress.province || 'N/A', barangay: branchAddress.barangay || 'N/A',
                zipCode: branchAddress.zipCode || '', country: branchAddress.country || 'PH'
            };
        }
        if (address && typeof address === 'object') {
            staffAddress = {
                street: String(address.street || staffAddress.street).trim().slice(0, 200),
                city: String(address.city || staffAddress.city).trim().slice(0, 100),
                province: String(address.province || address.state || staffAddress.province).trim().slice(0, 100),
                barangay: String(address.barangay || staffAddress.barangay).trim().slice(0, 100),
                zipCode: String(address.zipCode || staffAddress.zipCode || '').trim().slice(0, 20),
                country: String(address.country || staffAddress.country || 'PH').trim().slice(0, 100)
            };
        }
        if (address && typeof address === 'object') {
            const currentAddress = staff.address || {};
            staff.address = {
                street: String(address.street || currentAddress.street || 'N/A').trim().slice(0, 200),
                city: String(address.city || currentAddress.city || 'N/A').trim().slice(0, 100),
                province: String(address.province || address.state || currentAddress.province || 'N/A').trim().slice(0, 100),
                barangay: String(address.barangay || currentAddress.barangay || 'N/A').trim().slice(0, 100),
                zipCode: String(address.zipCode || currentAddress.zipCode || '').trim().slice(0, 20),
                country: String(address.country || currentAddress.country || 'PH').trim().slice(0, 100)
            };
        }
        if (staff.role === 'staff' && staffType && staffType !== existingType) {
            await Booking.updateMany(
                { staff: staff._id, $or: [{ staffRoleSnapshot: '' }, { staffRoleSnapshot: { $exists: false } }] },
                { $set: { staffRoleSnapshot: existingType, staffSpecialtySnapshot: staff.professionalProfile?.specialty || '' } }
            );
            staff.roleChangeHistory.push({ from: existingType, to: staffType, changedBy: req.user._id });
            staff.staffType = staffType;
        }
        staff.staffStatus = resultingStatus;
        staff.isActive = isActive !== undefined ? isActive : resultingStatus === 'active';
        
        if (resultingType === 'delivery_rider') {
            const normalized = cleanRiderProfile(riderProfile, staff.riderProfile || {});
            const riderError = validateRider(normalized, phone !== undefined ? phone : staff.phone);
            if (riderError) return res.status(400).json({ message: riderError });
            const duplicate = await User.findOne({ _id: { $ne: staff._id }, 'riderProfile.staffId': normalized.staffId, isDeleted: false });
            if (duplicate) return res.status(409).json({ message: 'Staff ID is already registered.' });
            staff.riderProfile = normalized;
            staff.isActive = normalized.accountStatus === 'active';
            staff.staffStatus = normalized.accountStatus;
        }
        // Scheduling and availability belong to the shared staff profile for
        // every operational role; credentials remain conditionally displayed.
        staff.professionalProfile = normalizedProfessional;

        await staff.save();
        if (branchChanged) await syncAssignedServices(staff._id, originalStoreId, []);
        await syncAssignedServices(staff._id, resultingStoreId, validatedServices.map(service => service._id));
        if (previousRole !== getStaffSpecializationRole(staff)) {
            await logStaffActivity(staff._id, 'Role Assigned', `${previousRole} changed to ${getStaffSpecializationRole(staff)}.`, req);
            await notifyStaff(staff._id, req, 'Staff Role Updated', `Your role is now ${getStaffSpecializationRole(staff).replaceAll('_', ' ')}. Role permissions apply automatically.`);
        }
        if (previousStatus !== staff.staffStatus) {
            await logStaffActivity(staff._id, 'Account Status Updated', `${previousStatus} changed to ${staff.staffStatus}.`, req);
            await notifyStaff(staff._id, req, 'Account Status Updated', `Your staff account is now ${staff.staffStatus}.`);
        }
        if (previousSchedule !== JSON.stringify(staff.professionalProfile?.availability || {})) {
            await logStaffActivity(staff._id, 'Schedule Changed', 'Working hours or breaks were updated.', req);
            await notifyStaff(staff._id, req, 'Schedule Updated', 'Your working schedule or break times were updated.');
        }

        const staffObj = staff.toObject();
        delete staffObj.password;

        res.json({ message: 'Staff updated successfully', staff: staffObj });
    } catch (error) {
        console.error('updateStaff error:', error);
        res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error' });
    }
};

/**
 * Deactivate / reactivate a staff account
 */
const toggleStaffStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await User.findOne(staffAccountFilter({ _id: id }));
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found' });

        if (staff.isActive && req.body.confirmUpcoming !== true) {
            const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
            const upcomingBookings = await Booking.countDocuments({
                staff: staff._id, bookingDate: { $gte: startToday },
                status: { $nin: ['completed', 'cancelled', 'no_show'] }, isDeleted: { $ne: true }
            });
            if (upcomingBookings) return res.status(409).json({
                message: `${upcomingBookings} upcoming booking${upcomingBookings === 1 ? '' : 's'} are assigned to this staff member. Deactivation prevents new assignments but preserves this history.`,
                requiresUpcomingConfirmation: true,
                upcomingBookings
            });
        }

        staff.isActive = !staff.isActive;
        staff.staffStatus = staff.isActive ? 'active' : 'inactive';
        if (staff.staffType === 'delivery_rider') staff.riderProfile.accountStatus = staff.staffStatus;
        await staff.save();
        await logStaffActivity(staff._id, staff.isActive ? 'Account Activated' : 'Account Deactivated', `Staff account was ${staff.isActive ? 'activated' : 'deactivated'}.`, req);
        await notifyStaff(staff._id, req, staff.isActive ? 'Account Activated' : 'Account Deactivated', `Your staff account was ${staff.isActive ? 'activated' : 'deactivated'} by a store administrator.`);

        res.json({
            message: `Staff account ${staff.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: staff.isActive
        });
    } catch (error) {
        console.error('toggleStaffStatus error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Permanently delete (soft-delete) a staff account
 */
const deleteStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await User.findOne(staffAccountFilter({ _id: id }));
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found' });

        staff.archivedAt = new Date();
        staff.archivedBy = req.user._id;
        staff.isActive = false;
        staff.staffStatus = 'archived';
        await staff.save();
        await Service.updateMany({ assignedStaff: staff._id }, { $pull: { assignedStaff: staff._id } });

        await logStaffActivity(staff._id, 'Archived', 'Staff account moved to the archive. Historical records were preserved.', req);
        res.json({ message: 'Staff account archived successfully' });
    } catch (error) {
        console.error('deleteStaff error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Reset staff password (admin action)
 */
const resetStaffPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(newPassword)) {
            return res.status(400).json({ message: 'Password must be at least 8 characters and include upper, lower, numeric, and symbol characters' });
        }

        const staff = await User.findOne(staffAccountFilter({ _id: id }));
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found' });

        staff.password = newPassword; // Pre-save hook will hash it
        staff.requiresPasswordChange = true;
        await staff.save();
        await logStaffActivity(staff._id, 'Password Reset', 'A store administrator reset the temporary password.', req);
        await notifyStaff(staff._id, req, 'Password Reset', 'Your password was reset. Sign in with the temporary password and change it immediately.');

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('resetStaffPassword error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const restoreStaff = async (req, res) => {
    try {
        const staff = await User.findOne(staffAccountFilter({ _id: req.params.id }, { onlyArchived: true }));
        if (!staff || !(await canAccessStore(req.user, staff.store))) return res.status(404).json({ message: 'Archived staff member not found.' });
        staff.archivedAt = null;
        staff.archivedBy = null;
        staff.staffStatus = 'active';
        staff.isActive = true;
        if (staff.staffType === 'delivery_rider') staff.riderProfile.accountStatus = 'active';
        await staff.save();
        await logStaffActivity(staff._id, 'Restored', 'Staff account restored from archive.', req);
        await notifyStaff(staff._id, req, 'Account Restored', 'Your staff account was restored and activated.');
        res.json({ message: 'Staff account restored.', staff });
    } catch (error) {
        res.status(500).json({ message: 'Unable to restore staff account.' });
    }
};

const permanentlyDeleteStaff = async (req, res) => {
    try {
        if (req.body.confirmation !== 'PERMANENTLY DELETE') return res.status(400).json({ message: 'Type PERMANENTLY DELETE to confirm.' });
        const staff = await User.findOne(staffAccountFilter({ _id: req.params.id }, { onlyArchived: true }));
        if (!staff || !(await canAccessStore(req.user, staff.store))) return res.status(404).json({ message: 'Archived staff member not found.' });
        staff.isDeleted = true;
        staff.isActive = false;
        staff.staffStatus = 'archived';
        await staff.save();
        await logStaffActivity(staff._id, 'Permanently Deleted', 'Account login identity was permanently disabled; historical relationships remain.', req);
        res.json({ message: 'Staff login account permanently disabled. Historical business records were preserved.' });
    } catch (error) {
        res.status(500).json({ message: 'Unable to permanently delete staff account.' });
    }
};

const getStaffConfiguration = async (req, res) => {
    try {
        let storeId = req.query.storeId || req.user.store?._id || req.user.store;
        if (!storeId && !['super_admin', 'platform_admin'].includes(req.user.role)) {
            storeId = (await Store.findOne({ owner: req.user._id }).select('_id'))?._id;
        }
        if (!storeId && ['super_admin', 'platform_admin'].includes(req.user.role)) {
            storeId = (await Store.findOne({ isActive: { $ne: false } }).select('_id'))?._id;
        }
        if (!storeId) return res.status(400).json({ message: 'Select a store branch to configure specialized staff.' });
        if (!['super_admin', 'platform_admin'].includes(req.user.role) && !(await canAccessStore(req.user, storeId))) {
            return res.status(403).json({ message: 'Store access denied.' });
        }
        const accessibleStoreIds = await getOwnedStoreIds(req.user);
        const [store, services, branches] = await Promise.all([
            Store.findById(storeId).select('name businessType operationalModules +staffSequence'),
            Service.find({ store: storeId, isActive: true, isDeleted: { $ne: true } }).select('name category subCategory description duration'),
            Store.find(accessibleStoreIds?.length ? { _id: { $in: accessibleStoreIds } } : {}).select('name businessType')
        ]);
        if (!store) return res.status(404).json({ message: 'Store branch not found.' });
        res.json({
            store,
            branches,
            services,
            enabledSpecializedRoles: getEnabledSpecializedRoles(services),
            nextStaffId: `STF-${String(Number(store.staffSequence || 0) + 1).padStart(4, '0')}`,
            availableRoles: ['manager', 'service_staff', 'cashier', 'inventory_staff', 'procurement_officer', 'finance_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff', 'delivery_dispatcher', 'delivery_rider']
        });
    } catch (error) {
        console.error('getStaffConfiguration error:', error);
        res.status(500).json({ message: 'Unable to load staff configuration.' });
    }
};

const getStaffProfile = async (req, res) => {
    try {
        const staff = await User.findOne(staffAccountFilter({ _id: req.params.id }, { includeArchived: true }))
            .select('-password -twoFactorSecret').populate('store', 'name').lean();
        if (!staff || !(await canAccessStore(req.user, staff.store?._id || staff.store))) return res.status(404).json({ message: 'Staff member not found.' });
        const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
        const [services, bookings, ratingSummary, recentReviews, activityTimeline, policyStore] = await Promise.all([
            Service.find({ assignedStaff: staff._id, isDeleted: { $ne: true } }).select('name category duration isActive').lean(),
            Booking.find({ $or: [{ staff: staff._id }, { serviceProvider: staff._id }], isDeleted: { $ne: true } }).select('service bookingDate startTime endTime status pet.name createdAt').populate('service', 'name').sort({ bookingDate: -1 }).limit(500).lean(),
            Review.aggregate([
                { $match: { targetType: 'Booking', staffId: staff._id, isApproved: true, isDeleted: { $ne: true } } },
                { $group: { _id: '$staffId', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
            ]),
            Review.find({ targetType: 'Booking', staffId: staff._id, isApproved: true, isDeleted: { $ne: true } })
                .populate('user', 'firstName lastName avatar').select('user rating comment complimentTags isAnonymous createdAt').sort({ createdAt: -1 }).limit(10).lean(),
            ActivityLog.find({ user: staff._id }).sort({ createdAt: -1 }).limit(50).lean(),
            Store.findById(staff.store?._id || staff.store).select('rolePermissions').lean()
        ]);
        const upcoming = bookings.filter(item => new Date(item.bookingDate) >= startToday && !['finished', 'completed', 'cancelled', 'no_show'].includes(item.status));
        const completed = bookings.filter(item => item.status === 'completed').length;
        const active = bookings.filter(item => ['processing', 'finished'].includes(item.status)).length;
        const cancelled = bookings.filter(item => ['cancelled', 'no_show'].includes(item.status)).length;
        const started = bookings.filter(item => ['processing', 'finished', 'completed'].includes(item.status)).length;
        const rating = ratingSummary[0];
        const role = normalizeRole(staff);
        const effectivePermissions = getEffectivePermissions({ ...staff, rolePolicyPermissions: policyForRole(policyStore, role) });
        res.json({
            staff: { ...staff, assignedServices: services, professionalVerificationStatus: getProfessionalVerificationStatus(staff), effectiveRole: role, effectivePermissions },
            activity: {
                upcoming: upcoming.sort((a, b) => new Date(a.bookingDate) - new Date(b.bookingDate)).slice(0, 20),
                completed,
                active,
                cancelled,
                total: bookings.length,
                history: bookings.slice(0, 40)
            },
            performance: {
                completedServices: completed,
                averageRating: rating ? Number(rating.averageRating.toFixed(2)) : 0,
                reviewCount: rating?.reviewCount || 0,
                upcomingBookings: upcoming.length,
                activeServices: active,
                cancellationRate: bookings.length ? Number(((cancelled / bookings.length) * 100).toFixed(1)) : 0,
                successRate: started ? Number(((completed / started) * 100).toFixed(1)) : 0
            },
            recentReviews: recentReviews.map(review => ({ ...review, user: review.isAnonymous ? null : review.user })),
            activityTimeline
        });
    } catch (error) {
        console.error('getStaffProfile error:', error);
        res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Staff member not found.' : 'Unable to load staff profile.' });
    }
};

const getMyProfessionalProfile = async (req, res) => {
    const originalId = req.params.id;
    req.params.id = String(req.user._id);
    try {
        if (!isSpecializedAccount(req.user)) return res.status(403).json({ message: 'Specialized staff access only.' });
        return await getStaffProfile(req, res);
    } finally {
        req.params.id = originalId;
    }
};

const updateMyProfessionalProfile = async (req, res) => {
    try {
        const staff = await User.findOne({ _id: req.user._id, isDeleted: false });
        if (!staff || !isSpecializedAccount(staff)) return res.status(403).json({ message: 'Specialized staff access only.' });
        const profile = staff.professionalProfile || {};
        if (req.body.bio !== undefined) profile.bio = String(req.body.bio || '').trim().slice(0, 3000);
        if (req.body.areasOfExpertise !== undefined) profile.areasOfExpertise = cleanList(req.body.areasOfExpertise);
        if (req.body.languages !== undefined) profile.languages = cleanList(req.body.languages);
        if (req.body.specializations !== undefined) profile.specializations = cleanList(req.body.specializations);
        staff.professionalProfile = profile;
        await staff.save();
        res.json({ message: 'Professional profile updated.', professionalProfile: staff.professionalProfile });
    } catch (error) {
        console.error('updateMyProfessionalProfile error:', error);
        res.status(500).json({ message: 'Unable to update professional profile.' });
    }
};

const findManagedSpecialist = async (req, id) => {
    const staff = await User.findOne({ _id: id, isDeleted: false });
    if (!staff || !isSpecializedAccount(staff)) return null;
    return (await canAccessStore(req.user, staff.store)) ? staff : null;
};
const findManagedStaff = async (req, id) => {
    const staff = await User.findOne(staffAccountFilter({ _id: id }));
    if (!staff) return null;
    return (await canAccessStore(req.user, staff.store)) ? staff : null;
};

const authorizeCredentialManagement = async (req, res, next) => {
    try {
        const staff = await findManagedSpecialist(req, req.params.id);
        if (!staff) return res.status(404).json({ message: 'Specialized staff member not found.' });
        req.managedStaff = staff;
        next();
    } catch (error) {
        res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Specialized staff member not found.' : 'Unable to verify staff access.' });
    }
};

const uploadCredentialDocument = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Select a license or certificate document.' });
        const staff = req.managedStaff || await findManagedSpecialist(req, req.params.id);
        if (!staff) return res.status(404).json({ message: 'Specialized staff member not found.' });
        const allowedTypes = ['professional_license', 'certification', 'training_certificate'];
        if (!allowedTypes.includes(req.body.documentType)) return res.status(400).json({ message: 'Invalid credential document type.' });
        const name = String(req.body.name || '').trim();
        if (!name || name.length > 160) return res.status(400).json({ message: 'Credential name is required and must be 160 characters or fewer.' });
        const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : undefined;
        if (expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ message: 'Enter a valid credential expiration date.' });

        if (!staff.professionalProfile.verification) staff.professionalProfile.verification = { status: 'pending_verification', isRequired: false };
        if (!staff.professionalProfile.credentialDocuments) staff.professionalProfile.credentialDocuments = [];
        const documents = staff.professionalProfile.credentialDocuments;
        let replaced;
        if (req.body.replacesDocumentId) {
            replaced = documents.id(req.body.replacesDocumentId);
            if (!replaced || replaced.status === 'archived') return res.status(400).json({ message: 'The credential being replaced is unavailable.' });
            replaced.status = 'archived';
            replaced.archivedAt = new Date();
            replaced.archivedBy = req.user._id;
        }
        documents.push({
            documentType: req.body.documentType,
            name,
            issuingBody: String(req.body.issuingBody || '').trim().slice(0, 160),
            credentialNumber: String(req.body.credentialNumber || '').trim().slice(0, 160),
            documentUrl: req.file.path,
            publicId: req.file.filename,
            originalName: req.file.originalname,
            uploadedBy: req.user._id,
            expiresAt,
            status: 'pending_verification',
            replacesDocument: replaced?._id
        });
        staff.professionalProfile.verification.status = 'pending_verification';
        if (staff.staffType === 'veterinarian' || staff.role === 'veterinarian') staff.professionalProfile.verification.isRequired = true;
        await staff.save();
        await createNotification({
            recipient: staff._id,
            sender: req.user._id,
            type: 'schedule_change',
            title: replaced ? 'Credential Renewal Submitted' : 'Credential Uploaded',
            message: `${name} is awaiting administrator verification.`,
            relatedId: staff._id,
            relatedModel: 'User',
            targetUrl: '/profile'
        }, req.app.get('socketio'));
        await logStaffActivity(staff._id, replaced ? 'Credential Renewed' : 'Credential Uploaded', `${name} submitted for verification.`, req);
        res.status(201).json({ message: replaced ? 'Credential renewed; the previous document remains archived.' : 'Credential uploaded for verification.', professionalProfile: staff.professionalProfile });
    } catch (error) {
        console.error('uploadCredentialDocument error:', error);
        res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Specialized staff member not found.' : 'Unable to upload credential.' });
    }
};

const updateCredentialVerification = async (req, res) => {
    try {
        const staff = await findManagedSpecialist(req, req.params.id);
        if (!staff) return res.status(404).json({ message: 'Specialized staff member not found.' });
        if (!staff.professionalProfile.verification) staff.professionalProfile.verification = { status: 'pending_verification', isRequired: false };
        const document = staff.professionalProfile.credentialDocuments?.id(req.params.documentId);
        if (!document || document.status === 'archived') return res.status(404).json({ message: 'Active credential document not found.' });
        const status = req.body.status;
        if (!['pending_verification', 'verified', 'expired', 'suspended'].includes(status)) return res.status(400).json({ message: 'Invalid verification status.' });
        document.status = status;
        if (status === 'verified') {
            document.verifiedAt = new Date();
            document.verifiedBy = req.user._id;
            staff.professionalProfile.verification.verifiedAt = document.verifiedAt;
            staff.professionalProfile.verification.verifiedBy = req.user._id;
        }
        if (req.body.isRequired !== undefined) staff.professionalProfile.verification.isRequired = Boolean(req.body.isRequired);
        if (staff.staffType === 'veterinarian' || staff.role === 'veterinarian') staff.professionalProfile.verification.isRequired = true;
        const credentialSufficient = hasSufficientVerifiedCredential(staff);
        staff.professionalProfile.verification.status = status === 'suspended'
            ? 'suspended'
            : status === 'verified'
                ? (credentialSufficient ? 'verified' : 'pending_verification')
                : (staff.professionalProfile.verification.isRequired && !credentialSufficient ? status : (credentialSufficient ? 'verified' : 'pending_verification'));
        staff.professionalProfile.verification.notes = String(req.body.notes || '').trim().slice(0, 1000);
        await staff.save();
        await createNotification({
            recipient: staff._id,
            sender: req.user._id,
            type: 'schedule_change',
            title: `Credential ${status.replaceAll('_', ' ')}`,
            message: `${document.name} was marked ${status.replaceAll('_', ' ')} by an administrator.`,
            relatedId: staff._id,
            relatedModel: 'User',
            targetUrl: '/profile'
        }, req.app.get('socketio'));
        await logStaffActivity(staff._id, 'Verification Updated', `${document.name} marked ${status.replaceAll('_', ' ')}.`, req);
        res.json({ message: 'Credential verification updated.', professionalProfile: staff.professionalProfile });
    } catch (error) {
        console.error('updateCredentialVerification error:', error);
        res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Credential not found.' : 'Unable to update credential verification.' });
    }
};

const updateStaffAvailability = async (req, res) => {
    try {
        const staff = await findManagedStaff(req, req.params.id);
        if (!staff) return res.status(404).json({ message: 'Staff member not found.' });
        const current = staff.professionalProfile || {};
        const leaveSchedule = cleanLeaveSchedule(req.body.leaveSchedule ?? current.leaveSchedule);
        if (Array.isArray(req.body.leaveSchedule) && leaveSchedule.length !== req.body.leaveSchedule.length) {
            return res.status(400).json({ message: 'Every leave period requires a valid start date on or before its end date.' });
        }
        current.availability = cleanAvailability(req.body.availability, current.availability);
        current.leaveSchedule = leaveSchedule;
        current.temporaryUnavailable = cleanUnavailable(req.body.temporaryUnavailable, current.temporaryUnavailable);
        current.emergencyUnavailable = cleanUnavailable(req.body.emergencyUnavailable, current.emergencyUnavailable, true);
        staff.professionalProfile = current;
        await staff.save();
        await logStaffActivity(staff._id, 'Schedule Changed', 'Working hours, breaks, leave, or availability were updated.', req);
        await notifyStaff(staff._id, req, 'Schedule Updated', 'Your working schedule or availability was updated.');
        res.json({ message: 'Staff availability updated.', availability: {
            workingSchedule: staff.professionalProfile.availability,
            leaveSchedule: staff.professionalProfile.leaveSchedule,
            temporaryUnavailable: staff.professionalProfile.temporaryUnavailable,
            emergencyUnavailable: staff.professionalProfile.emergencyUnavailable
        } });
    } catch (error) {
        console.error('updateStaffAvailability error:', error);
        res.status(500).json({ message: 'Unable to update staff availability.' });
    }
};

const getEligibleRiders = async (req, res) => {
    try {
        const storeIds = ['super_admin', 'platform_admin'].includes(req.user.role)
            ? (req.query.storeId ? [req.query.storeId] : [])
            : await getOwnedStoreIds(req.user);
        const query = {
            $or: [{ role: 'delivery_rider' }, { role: 'staff', staffType: 'delivery_rider' }],
            isDeleted: false, isActive: true,
            'riderProfile.accountStatus': 'active'
        };
        if (storeIds?.length) query.store = { $in: storeIds };
        const riders = await User.find(query).select('-password').populate('store', 'name').lean();
        const counts = await Delivery.aggregate([
            { $match: { assignedRider: { $in: riders.map(r => r._id) }, status: { $nin: ['delivered', 'cancelled', 'returned_to_store'] } } },
            { $group: { _id: '$assignedRider', count: { $sum: 1 } } }
        ]);
        const byRider = Object.fromEntries(counts.map(row => [row._id.toString(), row.count]));
        res.json({ riders: riders.map(rider => {
            const activeDeliveryCount = byRider[rider._id.toString()] || 0;
            return { ...rider, activeDeliveryCount, availability: activeDeliveryCount ? 'on_delivery' : 'available' };
        }) });
    } catch (error) {
        console.error('getEligibleRiders error:', error);
        res.status(500).json({ message: 'Unable to load eligible riders.' });
    }
};

const getRiderDetails = async (req, res) => {
    try {
        const rider = await User.findOne({ _id: req.params.id, $or: [{ role: 'delivery_rider' }, { role: 'staff', staffType: 'delivery_rider' }], isDeleted: false })
            .select('-password').populate('store', 'name').lean();
        if (!rider) return res.status(404).json({ message: 'Delivery Rider not found.' });
        if (req.user._id.toString() !== rider._id.toString() && !(await canAccessStore(req.user, rider.store._id || rider.store))) return res.status(403).json({ message: 'Access denied.' });
        const [deliveries, earnings, payouts] = await Promise.all([
            Delivery.find({ assignedRider: rider._id }).populate({ path: 'order', populate: { path: 'customer', select: 'firstName lastName' } }).sort({ createdAt: -1 }).limit(100).lean(),
            RiderEarning.find({ rider: rider._id }).populate('delivery', 'trackingToken status deliveredAt proofOfDelivery').sort({ earnedAt: -1 }).lean(),
            RiderPayout.find({ rider: rider._id }).sort({ createdAt: -1 }).lean()
        ]);
        const completed = deliveries.filter(d => d.status === 'delivered').length;
        const failed = deliveries.filter(d => ['failed_attempt', 'returned_to_store'].includes(d.status)).length;
        const totalFinished = completed + failed;
        const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
        const sum = (items, predicate = () => true) => items.filter(predicate).reduce((total, item) => total + item.amount, 0);
        res.json({
            rider,
            stats: { totalAssigned: deliveries.length, completed, failed, successRate: totalFinished ? Math.round(completed / totalFinished * 100) : 0 },
            earnings: {
                today: sum(earnings, e => new Date(e.earnedAt) >= startToday),
                available: sum(earnings, e => e.status === 'available'),
                pending: sum(earnings, e => e.status === 'processing'),
                totalPaid: sum(earnings, e => e.status === 'paid'),
                records: earnings
            },
            payouts,
            deliveries
        });
    } catch (error) {
        console.error('getRiderDetails error:', error);
        res.status(500).json({ message: 'Unable to load rider information.' });
    }
};

const getMyRiderDetails = async (req, res) => {
    if (req.user.role !== 'delivery_rider' && !(req.user.role === 'staff' && req.user.staffType === 'delivery_rider')) return res.status(403).json({ message: 'Delivery Rider access only.' });
    req.params.id = req.user._id.toString();
    return getRiderDetails(req, res);
};

const createRiderPayout = async (req, res) => {
    try {
        const rider = await User.findOne({ _id: req.params.id, $or: [{ role: 'delivery_rider' }, { role: 'staff', staffType: 'delivery_rider' }], isDeleted: false });
        if (!rider) return res.status(404).json({ message: 'Delivery Rider not found.' });
        if (!(await canAccessStore(req.user, rider.store))) return res.status(403).json({ message: 'Access denied.' });
        const earnings = await RiderEarning.find({ rider: rider._id, status: 'available' });
        if (!earnings.length) return res.status(400).json({ message: 'This rider has no available earnings.' });
        const amount = earnings.reduce((total, earning) => total + earning.amount, 0);
        const method = rider.riderProfile?.payoutMethod;
        if (!method?.type || !method.accountName || !method.accountNumber) return res.status(400).json({ message: 'Configure the rider payout method first.' });
        const payout = await RiderPayout.create({ rider: rider._id, store: rider.store, amount, earnings: earnings.map(e => e._id), paymentMethod: method });
        await RiderEarning.updateMany({ _id: { $in: earnings.map(e => e._id) } }, { status: 'processing', payout: payout._id });
        res.status(201).json({ message: 'Rider payout created.', payout });
    } catch (error) {
        console.error('createRiderPayout error:', error);
        res.status(500).json({ message: 'Unable to create rider payout.' });
    }
};

const updateRiderPayout = async (req, res) => {
    try {
        const payout = await RiderPayout.findById(req.params.payoutId);
        if (!payout) return res.status(404).json({ message: 'Payout not found.' });
        if (!(await canAccessStore(req.user, payout.store))) return res.status(403).json({ message: 'Access denied.' });
        const { status, referenceNumber, notes } = req.body;
        if (!['processing', 'paid', 'failed'].includes(status)) return res.status(400).json({ message: 'Invalid payout status.' });
        if (status === 'paid' && !String(referenceNumber || '').trim()) return res.status(400).json({ message: 'Reference number is required for paid payouts.' });
        payout.status = status; payout.referenceNumber = referenceNumber || payout.referenceNumber; payout.notes = notes || payout.notes;
        payout.processedBy = req.user._id; payout.processedAt = new Date(); await payout.save();
        await RiderEarning.updateMany({ _id: { $in: payout.earnings } }, { status: status === 'paid' ? 'paid' : status === 'failed' ? 'available' : 'processing', payout: status === 'failed' ? null : payout._id });
        res.json({ message: `Payout marked ${status}.`, payout });
    } catch (error) {
        console.error('updateRiderPayout error:', error);
        res.status(500).json({ message: 'Unable to update rider payout.' });
    }
};

module.exports = {
    getMyStaff,
    getStaffConfiguration,
    getStaffProfile,
    getMyProfessionalProfile,
    updateMyProfessionalProfile,
    uploadCredentialDocument,
    authorizeCredentialManagement,
    updateCredentialVerification,
    updateStaffAvailability,
    createStaff,
    updateStaff,
    toggleStaffStatus,
    deleteStaff,
    restoreStaff,
    permanentlyDeleteStaff,
    resetStaffPassword,
    getEligibleRiders,
    getRiderDetails,
    getMyRiderDetails,
    createRiderPayout,
    updateRiderPayout
};
