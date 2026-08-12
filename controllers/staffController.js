const User = require('../models/User');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendStaffInvitation } = require('../utils/emailService');
const Delivery = require('../models/Delivery');
const RiderEarning = require('../models/RiderEarning');
const RiderPayout = require('../models/RiderPayout');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const {
    SPECIALIZED_STAFF_ROLES,
    getEnabledSpecializedRoles,
    isRoleEligibleForService
} = require('../utils/staffSpecialization');

const DEFAULT_PERMISSIONS = {
    order_staff: {
        orders: { view: true, create: false, update: true, delete: false, fullAccess: false },
        bookings: { view: true, create: false, update: true, delete: false, fullAccess: false },
        customers: { view: true, create: false, update: false, delete: false, fullAccess: false },
        admin_chat: { view: true, create: true, update: true, delete: false, fullAccess: false }
    },
    inventory_staff: {
        pets: { view: true, create: true, update: true, delete: true, fullAccess: false },
        products: { view: true, create: true, update: true, delete: true, fullAccess: false },
        inventory: { view: true, create: true, update: true, delete: true, fullAccess: false }
    },
    service_staff: {
        services: { view: true, create: true, update: true, delete: true, fullAccess: false },
        bookings: { view: true, create: true, update: true, delete: false, fullAccess: false }
    },
    delivery_rider: {}
};

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
    experienceYears: Math.max(0, Number(profile.experienceYears ?? existing.experienceYears ?? 0)),
    registration: {
        type: String(profile.registration?.type ?? existing.registration?.type ?? '').trim(),
        number: String(profile.registration?.number ?? existing.registration?.number ?? '').trim(),
        issuingBody: String(profile.registration?.issuingBody ?? existing.registration?.issuingBody ?? '').trim(),
        expiresAt: profile.registration?.expiresAt || existing.registration?.expiresAt || undefined
    },
    availability: cleanAvailability(profile.availability, existing.availability),
    bio: String(profile.bio ?? existing.bio ?? '').trim(),
    isPublic: profile.isPublic ?? existing.isPublic ?? true,
    rating: Number(existing.rating || 0),
    reviewCount: Number(existing.reviewCount || 0)
});
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
        const { storeId } = req.query;
        let query = { role: 'staff', isDeleted: false };

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
        const services = staffIds.length ? await Service.find({ assignedStaff: { $in: staffIds }, isDeleted: { $ne: true } })
            .select('name category store assignedStaff duration isActive').lean() : [];
        const withServices = staff.map(member => ({
            ...member,
            assignedServices: services.filter(service => service.assignedStaff.some(id => id.toString() === member._id.toString()))
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
        const { firstName, lastName, email, username, phone, staffType, targetStoreId, permissions, riderProfile,
            professionalProfile, assignedServices = [], staffStatus = 'active' } = req.body;

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

        let normalizedRiderProfile;
        if (staffType === 'delivery_rider') {
            normalizedRiderProfile = cleanRiderProfile(riderProfile);
            const riderError = validateRider(normalizedRiderProfile, phone);
            if (riderError) return res.status(400).json({ message: riderError });
            const duplicateStaffId = await User.findOne({ 'riderProfile.staffId': normalizedRiderProfile.staffId, isDeleted: false });
            if (duplicateStaffId) return res.status(409).json({ message: 'Staff ID is already registered.' });
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
        const tempPassword = crypto.randomBytes(6).toString('hex');
        const store = await Store.findById(targetStoreId);
        if (!store) return res.status(404).json({ message: 'Store branch not found.' });
        const storeServices = await Service.find({ store: targetStoreId, isActive: true, isDeleted: { $ne: true } });
        const normalizedProfessionalProfile = cleanProfessionalProfile(professionalProfile);
        const specialistError = validateSpecialist(staffType, normalizedProfessionalProfile, phone, getEnabledSpecializedRoles(storeServices));
        if (specialistError) return res.status(400).json({ message: specialistError });
        if (SPECIALIZED_STAFF_ROLES.includes(staffType) && !assignedServices.length) return res.status(400).json({ message: 'Assign at least one existing service to specialized staff.' });
        const validatedServices = await validateAssignedServices({ storeId: targetStoreId, staffType, assignedServices });
        if (normalizedProfessionalProfile.staffId) {
            const duplicateProfessionalId = await User.findOne({ 'professionalProfile.staffId': normalizedProfessionalProfile.staffId, isDeleted: false });
            if (duplicateProfessionalId) return res.status(409).json({ message: 'Staff ID is already registered.' });
        }
        
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
            role: 'staff',
            staffType,
            store: targetStoreId,
            createdBy: req.user._id,
            isActive: staffType === 'delivery_rider' ? normalizedRiderProfile.accountStatus === 'active' : staffStatus === 'active',
            staffStatus: staffType === 'delivery_rider' ? normalizedRiderProfile.accountStatus : staffStatus,
            requiresPasswordChange: true,
            address: staffAddress,
            permissions: permissions || DEFAULT_PERMISSIONS[staffType] || {}
        });
        if (normalizedRiderProfile) staff.riderProfile = normalizedRiderProfile;
        if (SPECIALIZED_STAFF_ROLES.includes(staffType)) staff.professionalProfile = normalizedProfessionalProfile;

        await staff.save();
        await syncAssignedServices(staff._id, targetStoreId, validatedServices.map(service => service._id));
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
        const { firstName, lastName, phone, staffType, isActive, permissions, riderProfile,
            professionalProfile, assignedServices, staffStatus, confirmRoleChange, confirmUpcoming,
            targetStoreId, confirmBranchChange } = req.body;

        const query = { _id: id, role: 'staff', isDeleted: false };

        const staff = await User.findOne(query);
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found or access denied' });
        }
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found or access denied' });
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

        const resultingType = staffType || staff.staffType;
        if (!User.schema.path('staffType').enumValues.includes(resultingType)) return res.status(400).json({ message: 'Invalid staff role.' });
        if (staffType && staffType !== staff.staffType && !confirmRoleChange) {
            return res.status(409).json({ message: 'Confirm the staff role change before saving.', requiresRoleChangeConfirmation: true, previousRole: staff.staffType, newRole: staffType });
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
        if (branchChanged) {
            staff.store = resultingStoreId;
            const branchAddress = targetStore.contactInfo?.address;
            if (branchAddress) staff.address = {
                street: branchAddress.street || 'N/A', city: branchAddress.city || 'N/A',
                province: branchAddress.state || branchAddress.province || 'N/A', barangay: branchAddress.barangay || 'N/A',
                zipCode: branchAddress.zipCode || '', country: branchAddress.country || 'PH'
            };
        }
        if (staffType && staffType !== staff.staffType) {
            await Booking.updateMany(
                { staff: staff._id, $or: [{ staffRoleSnapshot: '' }, { staffRoleSnapshot: { $exists: false } }] },
                { $set: { staffRoleSnapshot: staff.staffType, staffSpecialtySnapshot: staff.professionalProfile?.specialty || '' } }
            );
            staff.roleChangeHistory.push({ from: staff.staffType, to: staffType, changedBy: req.user._id });
            staff.staffType = staffType;
        }
        staff.staffStatus = resultingStatus;
        staff.isActive = isActive !== undefined ? isActive : resultingStatus === 'active';
        
        if (permissions) {
            staff.permissions = permissions;
            staff.markModified('permissions'); // Ensure Mongoose detects object structure changes
        }
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
        if (SPECIALIZED_STAFF_ROLES.includes(resultingType)) staff.professionalProfile = normalizedProfessional;

        await staff.save();
        if (branchChanged) await syncAssignedServices(staff._id, originalStoreId, []);
        await syncAssignedServices(staff._id, resultingStoreId, validatedServices.map(service => service._id));

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
        const staff = await User.findOne({ _id: id, role: 'staff', isDeleted: false });
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
        const staff = await User.findOne({ _id: id, role: 'staff', isDeleted: false });
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found' });

        staff.isDeleted = true;
        staff.isActive = false;
        staff.staffStatus = 'inactive';
        await staff.save();
        await Service.updateMany({ assignedStaff: staff._id }, { $pull: { assignedStaff: staff._id } });

        res.json({ message: 'Staff account removed successfully' });
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

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const staff = await User.findOne({ _id: id, role: 'staff', isDeleted: false });
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found' });

        staff.password = newPassword; // Pre-save hook will hash it
        await staff.save();

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('resetStaffPassword error:', error);
        res.status(500).json({ message: 'Server error' });
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
            Store.findById(storeId).select('name businessType operationalModules'),
            Service.find({ store: storeId, isActive: true, isDeleted: { $ne: true } }).select('name category subCategory description duration'),
            Store.find(accessibleStoreIds?.length ? { _id: { $in: accessibleStoreIds } } : {}).select('name businessType')
        ]);
        if (!store) return res.status(404).json({ message: 'Store branch not found.' });
        res.json({ store, branches, services, enabledSpecializedRoles: getEnabledSpecializedRoles(services) });
    } catch (error) {
        console.error('getStaffConfiguration error:', error);
        res.status(500).json({ message: 'Unable to load staff configuration.' });
    }
};

const getStaffProfile = async (req, res) => {
    try {
        const staff = await User.findOne({ _id: req.params.id, role: 'staff', isDeleted: false })
            .select('-password -twoFactorSecret').populate('store', 'name').lean();
        if (!staff || !(await canAccessStore(req.user, staff.store?._id || staff.store))) return res.status(404).json({ message: 'Staff member not found.' });
        const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
        const [services, bookings] = await Promise.all([
            Service.find({ assignedStaff: staff._id, isDeleted: { $ne: true } }).select('name category duration isActive').lean(),
            Booking.find({ staff: staff._id, isDeleted: { $ne: true } }).select('service bookingDate startTime endTime status pet.name createdAt').populate('service', 'name').sort({ bookingDate: -1 }).limit(200).lean()
        ]);
        const upcoming = bookings.filter(item => new Date(item.bookingDate) >= startToday && !['finished', 'completed', 'cancelled', 'no_show'].includes(item.status));
        res.json({
            staff: { ...staff, assignedServices: services },
            activity: {
                upcoming: upcoming.sort((a, b) => new Date(a.bookingDate) - new Date(b.bookingDate)).slice(0, 20),
                completed: bookings.filter(item => ['finished', 'completed'].includes(item.status)).length,
                cancelled: bookings.filter(item => ['cancelled', 'no_show'].includes(item.status)).length,
                total: bookings.length,
                history: bookings.slice(0, 40)
            }
        });
    } catch (error) {
        console.error('getStaffProfile error:', error);
        res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Staff member not found.' : 'Unable to load staff profile.' });
    }
};

const getEligibleRiders = async (req, res) => {
    try {
        const storeIds = ['super_admin', 'platform_admin'].includes(req.user.role)
            ? (req.query.storeId ? [req.query.storeId] : [])
            : await getOwnedStoreIds(req.user);
        const query = {
            role: 'staff', staffType: 'delivery_rider', isDeleted: false, isActive: true,
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
        const rider = await User.findOne({ _id: req.params.id, role: 'staff', staffType: 'delivery_rider', isDeleted: false })
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
    if (req.user.role !== 'staff' || req.user.staffType !== 'delivery_rider') return res.status(403).json({ message: 'Delivery Rider access only.' });
    req.params.id = req.user._id.toString();
    return getRiderDetails(req, res);
};

const createRiderPayout = async (req, res) => {
    try {
        const rider = await User.findOne({ _id: req.params.id, role: 'staff', staffType: 'delivery_rider', isDeleted: false });
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
    createStaff,
    updateStaff,
    toggleStaffStatus,
    deleteStaff,
    resetStaffPassword,
    getEligibleRiders,
    getRiderDetails,
    getMyRiderDetails,
    createRiderPayout,
    updateRiderPayout
};
