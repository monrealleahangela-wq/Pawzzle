const crypto = require('crypto');
const AdoptionRequest = require('../models/AdoptionRequest');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const PayMongo = require('../services/paymongoService');
const { isPlatformAdmin, isOperationalStaff } = require('../config/permissions');
const { canOperateStore, idsEqual } = require('../utils/authorizationPolicy');
const { canAccessConversation } = require('../utils/conversationAuthorization');
const { requiresAcknowledgment, snapshotRefundPolicy } = require('../utils/refundPolicy');
const { createNotification } = require('./notificationController');
const {
    PET_PICKUP_POLICY,
    buildPickupAgreementSnapshot,
    calculateNoShowSettlement,
    getNoShowRestriction,
    pickupTimeline,
    publicPickupPolicy
} = require('../utils/petPickupPolicy');
const {
    finalizePetReservation,
    getPetAvailabilityIssue,
    releasePetReservation,
    reservePetForAdoption
} = require('../services/petAvailabilityService');

const ADOPTION_STATUSES = [
    'inquiry_submitted', 'under_review', 'reserved', 'approved', 'pickup_scheduling',
    'pickup_confirmed', 'pickup_missed', 'no_show_cancelled', 'completed', 'cancelled', 'declined', 'expired'
];
const ACTIVE_PURCHASE_STATUSES = ['inquiry_submitted', 'under_review', 'reserved', 'approved', 'pickup_scheduling', 'pickup_confirmed', 'pickup_missed'];
const PAID_STATUSES = ['partially_paid', 'deposit_paid', 'paid_in_full'];

const buildPurchaseFingerprint = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

const safeRequest = request => {
    const object = request?.toObject ? request.toObject() : { ...request };
    if (object?.pickupAgreement) delete object.pickupAgreement.acceptanceEvidence;
    return object;
};

const canManagePetPurchase = async (user, request) => {
    const isSeller = idsEqual(request.seller, user._id);
    return isSeller || isPlatformAdmin(user) || canOperateStore(user, request.store, ['pets.manage']);
};

const notifyPickupUpdate = async ({ request, sender, title, message }) => {
    await Promise.allSettled([
        createNotification({
            recipient: request.customer,
            sender,
            type: 'schedule_change',
            title,
            message,
            relatedId: request._id,
            relatedModel: 'AdoptionRequest',
            targetUrl: '/orders?tab=pets'
        }),
        Message.create({ conversation: request.conversation, sender, content: message, type: 'system' })
    ]);
};

const getCustomerPurchaseRestriction = async customerId => {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const cancelledRows = await AdoptionRequest.find({
        customer: customerId,
        status: 'no_show_cancelled',
        'pickupCompliance.cancelledAt': { $gte: cutoff }
    }).select('pickupCompliance.cancelledAt updatedAt').sort({ 'pickupCompliance.cancelledAt': -1 }).lean();
    return getNoShowRestriction(cancelledRows);
};

const getPickupPolicy = (_req, res) => res.json({ policy: publicPickupPolicy() });

const expireUnpaidCheckoutSession = async request => {
    const sessionId = request.paymentDetails?.sessionId;
    if (!sessionId || request.paymentDetails?.sessionStatus === 'expired') return;

    let session;
    try {
        session = await PayMongo.getCheckoutSession(sessionId);
    } catch (error) {
        if (error.response?.status !== 404) throw error;
    }

    if (session && PayMongo.getPaidPayment(session)) {
        const error = new Error('PayMongo has already confirmed payment. Complete or refund the transaction before closing it.');
        error.statusCode = 409;
        throw error;
    }
    if (session?.attributes?.status === 'active') await PayMongo.expireCheckoutSession(sessionId);

    request.paymentDetails.sessionStatus = 'expired';
    request.paymentDetails.paymentStatus = 'payment_cancelled';
    const historyRow = request.paymentDetails.sessionHistory?.find(row => row.sessionId === sessionId);
    if (historyRow) historyRow.status = 'expired';
};

// Server-authoritative purchase/reservation checkout.
const createAdoptionRequest = async (req, res) => {
    try {
        const {
            petId, conversationId, purchaseRequestId, notes, fullName,
            contactNumber, cityArea, preferredPickupDate,
            pickupConfirmation, refundPolicyAcknowledged,
            pickupAgreementAccepted, pickupAgreementVersion
        } = req.body;

        if (req.user?.role !== 'customer') {
            return res.status(403).json({ message: 'Only authenticated customer accounts can purchase a pet.' });
        }
        if (!petId || !conversationId) {
            return res.status(400).json({ message: 'Pet and seller conversation are required.' });
        }
        if (![fullName, contactNumber, cityArea].every(value => typeof value === 'string' && value.trim())) {
            return res.status(400).json({ message: 'Buyer name, contact number, and city or area are required.' });
        }
        if (fullName.trim().length > 160 || contactNumber.trim().length > 40 || cityArea.trim().length > 200) {
            return res.status(400).json({ message: 'Buyer contact information is too long.' });
        }
        if (pickupConfirmation !== true) {
            return res.status(400).json({ message: 'Pickup-only acknowledgment is required.' });
        }
        if (pickupAgreementAccepted !== true || pickupAgreementVersion !== PET_PICKUP_POLICY.version) {
            return res.status(400).json({ message: 'You must read and accept the current Pet Purchase and Pickup Agreement before payment.' });
        }
        if (purchaseRequestId !== undefined
            && (typeof purchaseRequestId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(purchaseRequestId))) {
            return res.status(400).json({ message: 'Invalid purchase request identifier.' });
        }

        const selectedDate = new Date(preferredPickupDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (!preferredPickupDate || Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
            return res.status(400).json({ message: 'Preferred pick-up date cannot be in the past. Please select today or a future date.' });
        }

        const normalizedRequestId = purchaseRequestId?.trim();
        const fingerprint = buildPurchaseFingerprint({
            petId: String(petId),
            fullName: fullName.trim(),
            contactNumber: contactNumber.trim(),
            cityArea: cityArea.trim(),
            preferredPickupDate: selectedDate.toISOString().slice(0, 10),
            pickupConfirmation: true,
            refundPolicyAcknowledged: refundPolicyAcknowledged === true,
            pickupAgreementVersion
        });
        if (normalizedRequestId) {
            const replay = await AdoptionRequest.findOne({
                customer: req.user._id,
                purchaseRequestId: normalizedRequestId
            }).select('+purchaseFingerprint');
            if (replay) {
                if (replay.purchaseFingerprint !== fingerprint) {
                    return res.status(409).json({ message: 'This checkout request was already used for different purchase details.' });
                }
                replay.purchaseFingerprint = undefined;
                return res.json({ message: 'Purchase checkout already started.', request: safeRequest(replay), replayed: true });
            }
        }

        const restriction = await getCustomerPurchaseRestriction(req.user._id);
        if (restriction.restricted) {
            return res.status(403).json({
                code: 'PET_PURCHASE_RESTRICTED',
                message: `Pet purchases are temporarily restricted after repeated missed pickups until ${restriction.restrictedUntil.toLocaleDateString()}.`,
                restriction
            });
        }

        const pet = await Pet.findById(petId);
        if (!pet) return res.status(404).json({ message: 'Pet not found.' });
        const availabilityIssue = getPetAvailabilityIssue(pet, 1);
        if (availabilityIssue) return res.status(409).json({ message: availabilityIssue });
        if (idsEqual(pet.addedBy, req.user._id) || await canOperateStore(req.user, pet.store)) {
            return res.status(403).json({ message: 'You cannot purchase a pet from your own listing.' });
        }

        const store = pet.store ? await Store.findOne({
            _id: pet.store,
            isActive: { $ne: false },
            isDeleted: { $ne: true }
        }).select('name refundPolicy') : null;
        if (!store) return res.status(409).json({ message: 'This pet Store is no longer available for checkout.' });
        const refundPolicy = snapshotRefundPolicy(store?.refundPolicy);
        const policyAcknowledgmentRequired = requiresAcknowledgment(refundPolicy);
        if (policyAcknowledgmentRequired && refundPolicyAcknowledged !== true) {
            return res.status(400).json({ message: 'You must acknowledge the Store refund policy before payment.' });
        }

        const conversation = await Conversation.findById(conversationId).populate('participants.user');
        if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
        const participantIds = (conversation.participants || [])
            .map(participant => participant?.user?._id || participant?.user || participant?._id || participant);
        const hasBuyer = participantIds.some(participant => idsEqual(participant, req.user._id));
        const hasSeller = participantIds.some(participant => idsEqual(participant, pet.addedBy));
        if (!idsEqual(conversation.pet, petId) || !hasBuyer || !hasSeller
            || !(await canAccessConversation(req.user, conversation))) {
            return res.status(403).json({ message: 'This conversation is not authorized for the selected pet.' });
        }

        const existingRequest = await AdoptionRequest.findOne({
            pet: petId,
            customer: req.user._id,
            status: { $in: ACTIVE_PURCHASE_STATUSES }
        });
        if (existingRequest) {
            return res.status(409).json({
                message: 'You already have an active purchase or reservation for this pet.',
                request: existingRequest
            });
        }

        const adoptionRequest = new AdoptionRequest({
            purchaseRequestId: normalizedRequestId,
            purchaseFingerprint: fingerprint,
            isActivePurchase: true,
            pet: petId,
            customer: req.user._id,
            seller: pet.addedBy,
            store: pet.store,
            conversation: conversationId,
            inquiryData: {
                fullName: fullName.trim(),
                contactNumber: contactNumber.trim(),
                cityArea: cityArea.trim(),
                preferredPickupDate: selectedDate,
                pickupConfirmation: true
            },
            refundPolicySnapshot: refundPolicy,
            refundPolicyAcknowledgment: {
                required: policyAcknowledgmentRequired,
                acknowledged: policyAcknowledgmentRequired ? true : refundPolicyAcknowledged === true,
                acknowledgedAt: refundPolicyAcknowledged === true ? new Date() : undefined,
                acknowledgedBy: refundPolicyAcknowledged === true ? req.user._id : undefined
            },
            pickupAgreement: buildPickupAgreementSnapshot({
                acceptedBy: req.user._id,
                ipAddress: req.ip,
                userAgent: req.get?.('user-agent') || req.headers?.['user-agent'] || ''
            }),
            pickupCompliance: {
                status: 'scheduled',
                scheduledFor: selectedDate,
                rescheduleCount: 0,
                contactAttempts: []
            },
            paymentDetails: {
                method: 'paymongo',
                paymentStatus: 'payment_pending',
                pricingBreakdown: {
                    totalPrice: pet.price,
                    depositAmount: pet.paymentConfig === 'deposit_first' ? pet.depositAmount : 0,
                    paidAmount: 0,
                    balanceDue: pet.price
                }
            },
            notes,
            status: 'inquiry_submitted',
            history: [{
                status: 'inquiry_submitted',
                updatedBy: req.user._id,
                description: `Purchase checkout started for ${pet.name}. Pickup agreement ${PET_PICKUP_POLICY.version} accepted. Payment provider: PayMongo.`,
                reason: 'Purchase Checkout Started'
            }]
        });
        await adoptionRequest.save();

        conversation.adoptionRequest = adoptionRequest._id;
        await conversation.save();
        try {
            await new Message({
                conversation: conversationId,
                sender: req.user._id,
                content: `Purchase checkout started for ${pet.name}. Buyer: ${fullName.trim()}. Preferred pickup: ${selectedDate.toLocaleDateString()}. Payment is confirmed only after PayMongo verification.`,
                type: 'system'
            }).save();
        } catch (messageError) {
            console.warn('Purchase record saved, but chat notification could not be sent:', messageError.message);
        }

        return res.status(201).json({ message: 'Purchase checkout started successfully.', request: safeRequest(adoptionRequest) });
    } catch (error) {
        console.error('Create pet purchase error:', error);
        if (error.code === 11000) {
            if (req.body.purchaseRequestId) {
                const replay = await AdoptionRequest.findOne({
                    customer: req.user._id,
                    purchaseRequestId: req.body.purchaseRequestId
                });
                if (replay) return res.json({ message: 'Purchase checkout already started.', request: safeRequest(replay), replayed: true });
            }
            return res.status(409).json({ message: 'You already have an active purchase or reservation for this pet.' });
        }
        if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid pet or conversation identifier.' });
        return res.status(500).json({ message: 'Internal server error while starting the purchase checkout.' });
    }
};

// Update adoption status
const updateAdoptionStatus = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { status, reason } = req.body;

        if (!ADOPTION_STATUSES.includes(status)) {
            return res.status(400).json({ message: 'Invalid adoption request status.' });
        }
        if (['pickup_missed', 'no_show_cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Use the protected pickup no-show workflow for this status.' });
        }

        const request = await AdoptionRequest.findById(requestId).populate('conversation');
        if (!request) {
            return res.status(404).json({ message: 'Adoption request not found' });
        }

        // Only seller, store staff, or admin can update status
        const isSeller = request.seller.toString() === req.user._id.toString();
        const isAdmin = isPlatformAdmin(req.user);
        const isStoreStaff = await canOperateStore(req.user, request.store, ['pets.manage']);

        if (!isSeller && !isAdmin && !isStoreStaff) {
            return res.status(403).json({ message: 'Not authorized to update this request' });
        }

        const closingStatuses = ['declined', 'cancelled', 'expired'];
        const reservingStatuses = ['reserved', 'approved', 'pickup_scheduling', 'pickup_confirmed'];

        if (closingStatuses.includes(status) && PAID_STATUSES.includes(request.paymentDetails?.paymentStatus)) {
            return res.status(409).json({ message: 'A verified paid purchase cannot be closed through the general status action. Use the applicable handover, refund, or protected pickup no-show workflow.' });
        }
        if (['pickup_confirmed', 'completed'].includes(status)
            && !PAID_STATUSES.includes(request.paymentDetails?.paymentStatus)) {
            return res.status(409).json({ message: 'PayMongo must confirm payment before pickup or handover can be completed.' });
        }
        if (status === 'completed' && request.status !== 'pickup_confirmed') {
            return res.status(409).json({ message: 'Confirm the pickup before recording the completed handover.' });
        }

        if (request.status === status) {
            if ([...closingStatuses, 'completed'].includes(status) && request.isActivePurchase !== false) {
                request.isActivePurchase = false;
                await request.save();
            }
            if (closingStatuses.includes(status)) {
                await expireUnpaidCheckoutSession(request);
                await request.save();
                await releasePetReservation({ petId: request.pet, source: 'adoption', referenceId: request._id });
            } else if (status === 'completed') {
                const pet = await Pet.findById(request.pet);
                const finalStatus = pet?.listingType === 'adoption' ? 'adopted' : 'sold';
                const ownedCompletion = String(pet?.reservation?.adoptionRequest || '') === String(request._id);
                if (pet?.status === finalStatus && !ownedCompletion) {
                    return res.status(409).json({ message: 'This pet was completed by another transaction.' });
                }
                if (pet && pet.status !== finalStatus) {
                    const completedPet = await finalizePetReservation({
                        petId: request.pet,
                        source: 'adoption',
                        referenceId: request._id,
                        status: finalStatus
                    });
                    if (!completedPet) return res.status(409).json({ message: 'This pet is not reserved for this request.' });
                }
            } else if (reservingStatuses.includes(status)) {
                const reservedPet = await reservePetForAdoption(request.pet, request._id);
                if (!reservedPet) return res.status(409).json({ message: 'This pet is not reserved for this request.' });
            }
            return res.json({ message: 'Status is already up to date', request });
        }

        if (closingStatuses.includes(status)) {
            await expireUnpaidCheckoutSession(request);
        }

        if (reservingStatuses.includes(status) || status === 'completed') {
            const reservedPet = await reservePetForAdoption(request.pet, request._id);
            if (!reservedPet) {
                return res.status(409).json({ message: 'This pet is already reserved, sold, adopted, unavailable, or linked to another active transaction.' });
            }
        }

        request.status = status;
        request.isActivePurchase = ![...closingStatuses, 'completed'].includes(status);
        request.pickupCompliance = request.pickupCompliance || {};
        request.scheduling = request.scheduling || {};
        if (status === 'pickup_confirmed') {
            const scheduledFor = request.scheduling?.confirmedDate
                || request.pickupCompliance?.scheduledFor
                || request.inquiryData?.preferredPickupDate;
            request.scheduling.confirmedDate = scheduledFor;
            request.pickupCompliance.status = 'scheduled';
            request.pickupCompliance.scheduledFor = scheduledFor;
        }
        if (status === 'completed') request.pickupCompliance.status = 'completed';
        request.history.push({
            status,
            updatedBy: req.user._id,
            description: `Status changed to ${status.replace(/_/g, ' ')}`,
            reason
        });
        await request.save();

        if (status === 'completed') {
            const pet = await Pet.findById(request.pet);
            const completedPet = await finalizePetReservation({
                petId: request.pet,
                source: 'adoption',
                referenceId: request._id,
                status: pet?.listingType === 'adoption' ? 'adopted' : 'sold'
            });
            if (!completedPet) return res.status(409).json({ message: 'This pet is not reserved for this request.' });
        }

        // Sync Pet status based on pet inquiry status
        if (closingStatuses.includes(status)) {
            await releasePetReservation({ petId: request.pet, source: 'adoption', referenceId: request._id });
        }

        // Send professional system message to chat
        const statusLabels = {
            inquiry_submitted: 'Purchase Checkout Started 📋',
            under_review: 'Under Review 🔍',
            reserved: 'Reserved for You 🌟',
            approved: 'Purchase Approved ✅',
            pickup_scheduling: 'Pickup Scheduling 📅',
            pickup_confirmed: 'Pickup Confirmed 🤝',
            pickup_missed: 'Pickup Missed',
            no_show_cancelled: 'Cancelled After Missed Pickup',
            completed: 'Pet Handed Over 🏠✨',
            cancelled: 'Cancelled ⚪',
            declined: 'Declined ❌',
            expired: 'Reservation Expired ⏰'
        };

        const systemMsg = new Message({
            conversation: request.conversation._id,
            sender: req.user._id,
            content: `📢 Status Update: ${statusLabels[status] || status.replace(/_/g, ' ')}` + (reason ? `\n\nNote: ${reason}` : ''),
            type: 'system'
        });
        await systemMsg.save();

        res.json({ message: 'Status updated successfully', request });
    } catch (error) {
        console.error('Update adoption status error:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
};

// Get adoption requests for current user
const getMyAdoptionRequests = async (req, res) => {
    try {
        let filter = {};

        if (req.user.role === 'customer') {
            filter = { customer: req.user._id };
        } else if (isPlatformAdmin(req.user)) {
            filter = {}; // Super-admin sees everything
            console.log('🔓 Super-admin viewing all adoptions');
        } else if (isOperationalStaff(req.user)) {
            // Staff sees requests for their store
            if (req.user.store) {
                filter = { store: req.user.store };
            } else {
                return res.status(403).json({ message: 'Staff account not assigned to a store.' });
            }
        } else {
            // Admin/Seller sees requests for their pets or their store
            const Store = require('../models/Store');
            const store = await Store.findOne({ owner: req.user._id });
            if (store) {
                filter = { $or: [{ seller: req.user._id }, { store: store._id }] };
            } else {
                filter = { seller: req.user._id };
            }
        }

        const requests = await AdoptionRequest.find(filter)
            .populate('pet', 'name species breed images price')
            .populate('customer', 'firstName lastName email')
            .populate('seller', 'firstName lastName email')
            .sort({ updatedAt: -1 });

        res.json({ requests });
    } catch (error) {
        console.error('Get my adoption requests error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Cancel adoption request (customer)
const cancelAdoptionRequest = async (req, res) => {
    try {
        const { requestId } = req.params;

        const request = await AdoptionRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: 'Adoption request not found' });
        }

        // Only the customer who made the request can cancel it
        if (request.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to cancel this request' });
        }

        // Check if the request is already in a final state or shipped
        if (['completed', 'cancelled', 'declined', 'expired'].includes(request.status)) {
            return res.status(400).json({ message: `Cannot cancel a request that is already ${request.status.replace(/_/g, ' ')}` });
        }
        if (PAID_STATUSES.includes(request.paymentDetails?.paymentStatus)) {
            return res.status(409).json({ message: 'A verified paid purchase cannot be cancelled through the unpaid purchase action. Contact the seller or platform support.' });
        }

        await expireUnpaidCheckoutSession(request);

        request.status = 'cancelled';
        request.isActivePurchase = false;
        request.history.push({
            status: 'cancelled',
            updatedBy: req.user._id,
            reason: 'Cancelled by customer'
        });

        await request.save();

        // Release only the reservation owned by this request. Sold/adopted pets
        // can never be reopened by cancelling an inquiry.
        await releasePetReservation({ petId: request.pet, source: 'adoption', referenceId: request._id });

        // Send system message to chat
        const systemMsg = new Message({
            conversation: request.conversation,
            sender: req.user._id,
            content: 'The purchase or reservation was cancelled by the customer.',
            type: 'system'
        });
        await systemMsg.save();

        res.json({ message: 'Purchase or reservation cancelled successfully', request });
    } catch (error) {
        console.error('Cancel adoption request error:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
};

// Get single adoption request by conversation ID
const getAdoptionByConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const request = await AdoptionRequest.findOne({ conversation: conversationId })
            .populate('pet', 'name species breed images price')
            .populate('history.updatedBy', 'firstName lastName role');

        if (request) {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation || !(await canAccessConversation(req.user, conversation))) {
                return res.status(403).json({ message: 'Access denied to this adoption request.' });
            }
        }

        res.json({ request });
    } catch (error) {
        console.error('Get adoption by conversation error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Send Payment Request
const sendPaymentRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const request = await AdoptionRequest.findById(requestId).populate('pet');
        
        if (!request) return res.status(404).json({ message: 'Request not found' });

        // Authorization (Seller/Staff/Admin)
        const isSeller = request.seller.toString() === req.user._id.toString();
        const isAdmin = isPlatformAdmin(req.user);
        const isAuthorizedStore = await canOperateStore(req.user, request.store, ['pets.manage']);
        if (!isSeller && !isAdmin && !isAuthorizedStore) return res.status(403).json({ message: 'Unauthorized' });

        request.paymentDetails.paymentStatus = 'payment_pending';
        request.paymentDetails.history.push({
            status: 'payment_pending',
            description: 'Seller requested payment'
        });
        
        await request.save();

        const amount = request.paymentDetails.pricingBreakdown.depositAmount > 0 
            ? request.paymentDetails.pricingBreakdown.depositAmount 
            : request.paymentDetails.pricingBreakdown.totalPrice;

        const systemMsg = new Message({
            conversation: request.conversation,
            sender: req.user._id,
            content: `💳 **PAYMONGO PAYMENT REQUESTED**\n\nThe seller has requested payment of **₱${amount.toLocaleString()}**. Use the secure PayMongo payment button in this conversation. Payment status updates automatically after PayMongo confirmation.`,
            type: 'system'
        });
        await systemMsg.save();

        res.json({ message: 'Payment request sent', request });
    } catch (error) {
        console.error('Send payment request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const markPickupMissed = async (req, res) => {
    try {
        const request = await AdoptionRequest.findById(req.params.requestId);
        if (!request) return res.status(404).json({ message: 'Pet purchase not found.' });
        if (!(await canManagePetPurchase(req.user, request))) {
            return res.status(403).json({ message: 'You are not authorized to manage this pickup.' });
        }
        if (request.status !== 'pickup_confirmed') {
            return res.status(409).json({ message: 'Only a confirmed pickup can be marked missed.' });
        }
        if (!PAID_STATUSES.includes(request.paymentDetails?.paymentStatus)) {
            return res.status(409).json({ message: 'A missed-pickup consequence applies only after a verified payment.' });
        }
        if (!request.pickupAgreement?.accepted) {
            return res.status(409).json({ message: 'The no-show consequence cannot be applied because this purchase predates the pickup agreement.' });
        }
        const scheduledFor = request.pickupCompliance?.scheduledFor
            || request.scheduling?.confirmedDate
            || request.inquiryData?.preferredPickupDate;
        const scheduled = new Date(scheduledFor);
        if (Number.isNaN(scheduled.getTime())) {
            return res.status(409).json({ message: 'Confirm a valid pickup date before reporting a missed pickup.' });
        }
        if (Date.now() < scheduled.getTime() + 24 * 60 * 60 * 1000) {
            return res.status(409).json({ message: 'The pickup date must finish before it can be marked missed.' });
        }

        const missedAt = new Date();
        const timeline = pickupTimeline(missedAt);
        request.status = 'pickup_missed';
        request.pickupCompliance = request.pickupCompliance || {};
        request.pickupCompliance.status = 'pickup_missed';
        request.pickupCompliance.scheduledFor = scheduled;
        request.pickupCompliance.missedAt = missedAt;
        request.pickupCompliance.graceEndsAt = timeline.graceEndsAt;
        request.pickupCompliance.cancellationEligibleAt = timeline.cancellationEligibleAt;
        request.history.push({
            status: 'pickup_missed',
            updatedBy: req.user._id,
            description: 'The confirmed pickup was missed. The 24-hour grace period has started.',
            reason: String(req.body?.reason || 'Buyer did not arrive for the confirmed pickup.').slice(0, 1000)
        });
        await request.save();
        await notifyPickupUpdate({
            request,
            sender: req.user._id,
            title: 'Missed Pet Pickup',
            message: `The pickup was marked missed. Contact the seller during the 24-hour grace period to explain or request the one permitted reschedule. Care fees may apply after ${timeline.graceEndsAt.toLocaleString()}.`
        });
        return res.json({ message: 'Pickup marked missed and grace period started.', request: safeRequest(request) });
    } catch (error) {
        console.error('Mark pickup missed error:', error);
        return res.status(error.name === 'CastError' ? 400 : 500).json({ message: error.name === 'CastError' ? 'Invalid pet purchase identifier.' : 'Unable to mark this pickup missed.' });
    }
};

const recordPickupContactAttempt = async (req, res) => {
    try {
        const request = await AdoptionRequest.findById(req.params.requestId);
        if (!request) return res.status(404).json({ message: 'Pet purchase not found.' });
        if (!(await canManagePetPurchase(req.user, request))) {
            return res.status(403).json({ message: 'You are not authorized to manage this pickup.' });
        }
        if (request.status !== 'pickup_missed') {
            return res.status(409).json({ message: 'Contact attempts are recorded only for a missed pickup.' });
        }
        request.pickupCompliance = request.pickupCompliance || {};
        request.pickupCompliance.contactAttempts = request.pickupCompliance.contactAttempts || [];
        const channel = ['chat', 'phone', 'email', 'other'].includes(req.body?.channel) ? req.body.channel : 'chat';
        const note = String(req.body?.note || '').trim();
        if (note.length < 3 || note.length > 500) {
            return res.status(400).json({ message: 'Provide a short contact-attempt note between 3 and 500 characters.' });
        }
        const attempts = request.pickupCompliance?.contactAttempts || [];
        const latest = attempts[attempts.length - 1]?.attemptedAt;
        if (latest && Date.now() - new Date(latest).getTime() < 30 * 60 * 1000) {
            return res.status(429).json({ message: 'Wait at least 30 minutes before recording another contact attempt.' });
        }
        const attemptNumber = attempts.length + 1;
        request.pickupCompliance.contactAttempts.push({
            attemptedAt: new Date(),
            attemptedBy: req.user._id,
            channel,
            note
        });
        request.history.push({
            status: 'pickup_missed',
            updatedBy: req.user._id,
            description: `Pickup contact attempt ${attemptNumber} recorded by ${channel}.`,
            reason: note
        });
        await request.save();
        await notifyPickupUpdate({
            request,
            sender: req.user._id,
            title: 'Seller Tried to Contact You',
            message: `The seller recorded a ${channel} contact attempt about the missed pickup. Please respond through Pawzzle Messages.`
        });
        return res.json({ message: 'Contact attempt recorded.', request: safeRequest(request) });
    } catch (error) {
        console.error('Record pickup contact error:', error);
        return res.status(error.name === 'CastError' ? 400 : 500).json({ message: error.name === 'CastError' ? 'Invalid pet purchase identifier.' : 'Unable to record the contact attempt.' });
    }
};

const reschedulePickup = async (req, res) => {
    try {
        const request = await AdoptionRequest.findById(req.params.requestId);
        if (!request) return res.status(404).json({ message: 'Pet purchase not found.' });
        if (!(await canManagePetPurchase(req.user, request))) {
            return res.status(403).json({ message: 'You are not authorized to reschedule this pickup.' });
        }
        if (!['approved', 'pickup_confirmed', 'pickup_missed'].includes(request.status)) {
            return res.status(409).json({ message: 'This purchase is not eligible for pickup rescheduling.' });
        }
        if (Number(request.pickupCompliance?.rescheduleCount || 0) >= PET_PICKUP_POLICY.freeReschedules) {
            return res.status(409).json({ message: 'The agreement permits only one standard reschedule. Contact platform support for exceptional circumstances.' });
        }
        const selectedDate = new Date(req.body?.pickupDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
            return res.status(400).json({ message: 'Select today or a future pickup date.' });
        }
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3 || reason.length > 500) {
            return res.status(400).json({ message: 'Provide the agreed rescheduling reason.' });
        }

        request.pickupCompliance = request.pickupCompliance || {};
        request.scheduling = request.scheduling || {};
        request.status = 'pickup_confirmed';
        request.scheduling.confirmedDate = selectedDate;
        request.pickupCompliance.status = 'rescheduled';
        request.pickupCompliance.scheduledFor = selectedDate;
        request.pickupCompliance.rescheduleCount = Number(request.pickupCompliance.rescheduleCount || 0) + 1;
        request.pickupCompliance.missedAt = undefined;
        request.pickupCompliance.graceEndsAt = undefined;
        request.pickupCompliance.cancellationEligibleAt = undefined;
        request.history.push({
            status: 'pickup_confirmed',
            updatedBy: req.user._id,
            description: `Pickup rescheduled to ${selectedDate.toLocaleDateString()}.`,
            reason
        });
        await request.save();
        await notifyPickupUpdate({
            request,
            sender: req.user._id,
            title: 'Pet Pickup Rescheduled',
            message: `Your pet pickup was rescheduled to ${selectedDate.toLocaleDateString()}. Reason: ${reason}`
        });
        return res.json({ message: 'Pickup rescheduled.', request: safeRequest(request) });
    } catch (error) {
        console.error('Reschedule pickup error:', error);
        return res.status(error.name === 'CastError' ? 400 : 500).json({ message: error.name === 'CastError' ? 'Invalid pet purchase identifier.' : 'Unable to reschedule the pickup.' });
    }
};

const cancelForPickupNoShow = async (req, res) => {
    try {
        const request = await AdoptionRequest.findById(req.params.requestId);
        if (!request) return res.status(404).json({ message: 'Pet purchase not found.' });
        if (!(await canManagePetPurchase(req.user, request))) {
            return res.status(403).json({ message: 'You are not authorized to manage this pickup.' });
        }
        if (request.status !== 'pickup_missed') {
            return res.status(409).json({ message: 'Only a recorded missed pickup can be cancelled under the no-show policy.' });
        }
        if (!request.pickupAgreement?.accepted) {
            return res.status(409).json({ message: 'The no-show consequence cannot be applied because this purchase predates the pickup agreement.' });
        }
        const eligibleAt = new Date(request.pickupCompliance?.cancellationEligibleAt);
        if (Number.isNaN(eligibleAt.getTime()) || eligibleAt > new Date()) {
            return res.status(409).json({ message: `The seven-day response period has not ended${Number.isNaN(eligibleAt.getTime()) ? '.' : `; cancellation becomes available on ${eligibleAt.toLocaleString()}.`}` });
        }
        const attempts = request.pickupCompliance?.contactAttempts || [];
        if (attempts.length < PET_PICKUP_POLICY.minimumContactAttempts) {
            return res.status(409).json({ message: `Record at least ${PET_PICKUP_POLICY.minimumContactAttempts} genuine contact attempts before cancellation.` });
        }
        const pricing = request.paymentDetails?.pricingBreakdown || {};
        const settlement = calculateNoShowSettlement({
            totalPrice: pricing.totalPrice,
            paidAmount: pricing.paidAmount ?? request.paymentDetails?.paidAmount,
            scheduledFor: request.pickupCompliance.missedAt,
            refundPolicyType: request.refundPolicySnapshot?.type
        });
        const reason = String(req.body?.reason || 'Buyer remained unresponsive after the pickup no-show period.').slice(0, 1000);
        request.paymentDetails = request.paymentDetails || {};
        request.paymentDetails.history = request.paymentDetails.history || [];
        request.status = 'no_show_cancelled';
        request.isActivePurchase = false;
        request.pickupCompliance.status = 'no_show_cancelled';
        request.pickupCompliance.settlement = settlement;
        request.pickupCompliance.cancelledAt = new Date();
        request.pickupCompliance.cancelledBy = req.user._id;
        request.pickupCompliance.cancellationReason = reason;
        request.paymentDetails.paymentStatus = settlement.refundDue > 0 ? 'refund_review_required' : 'no_show_fees_applied';
        request.paymentDetails.history.push({
            status: request.paymentDetails.paymentStatus,
            amount: settlement.refundDue,
            description: settlement.refundDue > 0
                ? 'No-show cancellation calculated; remaining balance requires verified refund processing.'
                : 'No-show fees applied under the accepted pickup agreement.',
            timestamp: new Date()
        });
        request.history.push({
            status: 'no_show_cancelled',
            updatedBy: req.user._id,
            description: 'Purchase cancelled after the seven-day missed-pickup response period. The pet may be relisted.',
            reason
        });
        await request.save();
        await releasePetReservation({ petId: request.pet, source: 'adoption', referenceId: request._id });
        await notifyPickupUpdate({
            request,
            sender: req.user._id,
            title: 'Pet Purchase Cancelled After Missed Pickup',
            message: settlement.refundDue > 0
                ? `The purchase was cancelled under the accepted pickup agreement. PHP ${settlement.deductionTotal.toFixed(2)} was calculated in no-show and care deductions; PHP ${settlement.refundDue.toFixed(2)} is pending verified refund processing.`
                : `The purchase was cancelled under the accepted pickup agreement. PHP ${settlement.deductionTotal.toFixed(2)} was applied to the disclosed no-show and care fees.`
        });
        return res.json({
            message: settlement.refundDue > 0
                ? 'No-show cancellation recorded. The calculated balance now requires authorized refund processing.'
                : 'No-show cancellation and disclosed fees recorded.',
            request: safeRequest(request),
            settlement
        });
    } catch (error) {
        console.error('Cancel missed pickup error:', error);
        return res.status(error.name === 'CastError' ? 400 : 500).json({ message: error.name === 'CastError' ? 'Invalid pet purchase identifier.' : 'Unable to cancel this missed pickup.' });
    }
};

module.exports = {
    createAdoptionRequest,
    updateAdoptionStatus,
    getMyAdoptionRequests,
    getAdoptionByConversation,
    cancelAdoptionRequest,
    sendPaymentRequest,
    getPickupPolicy,
    markPickupMissed,
    recordPickupContactAttempt,
    reschedulePickup,
    cancelForPickupNoShow,
};
