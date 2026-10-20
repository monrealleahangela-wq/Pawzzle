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
const {
    finalizePetReservation,
    getPetAvailabilityIssue,
    releasePetReservation,
    reservePetForAdoption
} = require('../services/petAvailabilityService');

const ADOPTION_STATUSES = [
    'inquiry_submitted', 'under_review', 'reserved', 'approved', 'pickup_scheduling',
    'pickup_confirmed', 'completed', 'cancelled', 'declined', 'expired'
];
const ACTIVE_PURCHASE_STATUSES = ['inquiry_submitted', 'under_review', 'reserved', 'approved', 'pickup_scheduling', 'pickup_confirmed'];

const buildPurchaseFingerprint = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

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
            pickupConfirmation, refundPolicyAcknowledged
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
            refundPolicyAcknowledged: refundPolicyAcknowledged === true
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
                return res.json({ message: 'Purchase checkout already started.', request: replay, replayed: true });
            }
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
                description: `Purchase checkout started for ${pet.name}. Payment provider: PayMongo.`,
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

        return res.status(201).json({ message: 'Purchase checkout started successfully.', request: adoptionRequest });
    } catch (error) {
        console.error('Create pet purchase error:', error);
        if (error.code === 11000) {
            if (req.body.purchaseRequestId) {
                const replay = await AdoptionRequest.findOne({
                    customer: req.user._id,
                    purchaseRequestId: req.body.purchaseRequestId
                });
                if (replay) return res.json({ message: 'Purchase checkout already started.', request: replay, replayed: true });
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
            inquiry_submitted: 'Inquiry Submitted 📋',
            under_review: 'Under Review 🔍',
            reserved: 'Reserved for You 🌟',
            approved: 'Inquiry Approved ✅',
            pickup_scheduling: 'Pickup Scheduling 📅',
            pickup_confirmed: 'Pickup Confirmed 🤝',
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

module.exports = {
    createAdoptionRequest,
    updateAdoptionStatus,
    getMyAdoptionRequests,
    getAdoptionByConversation,
    cancelAdoptionRequest,
    sendPaymentRequest,
};
