const AdoptionRequest = require('../models/AdoptionRequest');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Pet = require('../models/Pet');

// Create a structured pet purchase inquiry
const createAdoptionRequest = async (req, res) => {
    try {
        const { 
            petId, 
            conversationId, 
            notes,
            fullName,
            contactNumber,
            cityArea,
            preferredPickupDate,
            interestReason,
            previousExperience,
            pickupConfirmation,
            paymentMethod 
        } = req.body;

        // Validate that the preferred pickup date is not in the past
        const selectedDate = new Date(preferredPickupDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selectedDate < today) {
            return res.status(400).json({ message: 'Preferred pick-up date cannot be in the past. Please select today or a future date.' });
        }

        // Verify pet and conversation
        const pet = await Pet.findById(petId);
        if (!pet) {
            return res.status(404).json({ message: 'Pet not found' });
        }

        if (pet.status !== 'available' && pet.status !== 'available') {
            return res.status(400).json({ message: `This pet is currently ${pet.status} and not available for new inquiries` });
        }

        const conversation = await Conversation.findById(conversationId).populate('participants');
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // Check if an inquiry already exists
        const existingRequest = await AdoptionRequest.findOne({ pet: petId, customer: req.user._id, status: { $nin: ['cancelled', 'declined', 'expired'] } });
        if (existingRequest) {
            return res.status(400).json({ message: 'You already have an active inquiry for this pet', request: existingRequest });
        }

        const adoptionRequest = new AdoptionRequest({
            pet: petId,
            customer: req.user._id,
            seller: pet.addedBy,
            store: pet.store,
            conversation: conversationId,
            inquiryData: {
                fullName,
                contactNumber,
                cityArea,
                preferredPickupDate,
                interestReason,
                previousExperience,
                pickupConfirmation
            },
            paymentDetails: {
                method: paymentMethod,
                paymentStatus: paymentMethod === 'paymongo' ? 'payment_pending' : 'unpaid',
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
                description: `Initial purchase inquiry started for ${pet.name}. Preferred payment: ${paymentMethod.replace(/_/g, ' ').toUpperCase()}`,
                reason: 'Inquiry Submitted'
            }]
        });

        console.log(`[AdoptionDebug] Inquiry data prepared for pet: ${pet.name}. Saving...`);
        await adoptionRequest.save();
        console.log(`✅ [AdoptionDebug] Inquiry saved. ID: ${adoptionRequest._id}`);

        // Link inquiry to conversation
        conversation.adoptionRequest = adoptionRequest._id;
        await conversation.save();

        // Step 1: Send high-level system header
        try {
            const systemHeader = new Message({
                conversation: conversationId,
                sender: req.user._id, // System usually acts on behalf of action-taker
                content: `📢 Purchase inquiry started for ${pet.name}`,
                type: 'system'
            });
            await systemHeader.save();
        } catch (msgErr) {
            console.warn('[AdoptionDebug] Failed to send system header:', msgErr.message);
        }

        // Step 2: Send structured inquiry summary into chat
        try {
            const inquirySummary = new Message({
                conversation: conversationId,
                sender: req.user._id,
                content: `📋 **INQUIRY DETAILS**\n**Buyer:** ${fullName || 'N/A'}\n**Area:** ${cityArea || 'N/A'}\n**Experience:** ${previousExperience || 'N/A'}\n**Reason:** ${interestReason || 'N/A'}\n**Preferred Pickup:** ${preferredPickupDate ? new Date(preferredPickupDate).toLocaleDateString() : 'TBD'}`,
                type: 'text' // Sent as text so it's readable in chat history
            });
            await inquirySummary.save();
        } catch (msgErr) {
            console.warn('[AdoptionDebug] Failed to send inquiry summary:', msgErr.message);
        }

        res.status(201).json({ message: 'Inquiry submitted successfully', request: adoptionRequest });
    } catch (error) {
        console.error('Create inquiry error:', error);
        
        if (error.code === 11000) {
            return res.status(409).json({ message: 'You already have a record for this pet. Please check your existing inquiries.' });
        }
        
        res.status(500).json({ 
            message: 'Internal server error during inquiry submission',
            error: error.message 
        });
    }
};

// Update adoption status
const updateAdoptionStatus = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { status, reason } = req.body;

        const request = await AdoptionRequest.findById(requestId).populate('conversation');
        if (!request) {
            return res.status(404).json({ message: 'Adoption request not found' });
        }

        // Only seller, store staff, or admin can update status
        const isSeller = request.seller.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        const isStoreStaff = req.user.role === 'staff' && req.user.store && request.store && req.user.store.toString() === request.store.toString();

        if (!isSeller && !isAdmin && !isStoreStaff) {
            return res.status(403).json({ message: 'Not authorized to update this request' });
        }

        request.status = status;
        request.history.push({
            status,
            updatedBy: req.user._id,
            description: `Status changed to ${status.replace(/_/g, ' ')}`,
            reason
        });
        await request.save();

        // Sync Pet status based on pet inquiry status
        if (['reserved', 'approved', 'pickup_scheduling', 'pickup_confirmed'].includes(status)) {
            await Pet.findByIdAndUpdate(request.pet, {
                status: 'reserved',
                isAvailable: false 
            });
        } else if (status === 'completed') {
            const pet = await Pet.findById(request.pet);
            await Pet.findByIdAndUpdate(request.pet, {
                status: pet.listingType === 'adoption' ? 'adopted' : 'sold',
                isAvailable: false
            });
        } else if (['declined', 'cancelled', 'expired'].includes(status)) {
            // Check if there are ANY other active reserved/approved requests for this pet
            const otherActiveRequest = await AdoptionRequest.findOne({
                pet: request.pet,
                _id: { $ne: request._id },
                status: { $in: ['reserved', 'approved', 'pickup_scheduling', 'pickup_confirmed'] }
            });

            if (!otherActiveRequest) {
                const pet = await Pet.findById(request.pet);
                if (pet && (pet.status === 'reserved')) {
                    pet.status = 'available';
                    pet.isAvailable = true;
                    await pet.save();
                }
            }
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
        res.status(500).json({ message: 'Server error' });
    }
};

// Get adoption requests for current user
const getMyAdoptionRequests = async (req, res) => {
    try {
        let filter = {};

        if (req.user.role === 'customer') {
            filter = { customer: req.user._id };
        } else if (req.user.role === 'super_admin') {
            filter = {}; // Super-admin sees everything
            console.log('🔓 Super-admin viewing all adoptions');
        } else if (req.user.role === 'staff') {
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
        if (['delivered', 'cancelled', 'rejected', 'shipped'].includes(request.status)) {
            return res.status(400).json({ message: `Cannot cancel a request that is already ${request.status.replace(/_/g, ' ')}` });
        }

        request.status = 'cancelled';
        request.history.push({
            status: 'cancelled',
            updatedBy: req.user._id,
            reason: 'Cancelled by customer'
        });

        await request.save();

        // Sync Pet status back to available if it was reserved or adopted
        const pet = await Pet.findById(request.pet);
        if (pet && (pet.status === 'reserved' || pet.status === 'adopted')) {
            pet.status = 'available';
            pet.isAvailable = true;
            await pet.save();
        }

        // Send system message to chat
        const systemMsg = new Message({
            conversation: request.conversation,
            sender: req.user._id,
            content: 'Inquiry has been cancelled by the customer.',
            type: 'system'
        });
        await systemMsg.save();

        res.json({ message: 'Inquiry cancelled successfully', request });
    } catch (error) {
        console.error('Cancel adoption request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get single adoption request by conversation ID
const getAdoptionByConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const request = await AdoptionRequest.findOne({ conversation: conversationId })
            .populate('pet', 'name species breed images price')
            .populate('history.updatedBy', 'firstName lastName role');

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
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        if (!isSeller && !isAdmin) return res.status(403).json({ message: 'Unauthorized' });

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
            content: `💳 **PAYMENT REQUESTED**\n\nThe seller has requested payment of **₱${amount.toLocaleString()}** via **${request.paymentDetails.method.replace(/_/g, ' ').toUpperCase()}**.\n\nPlease upload your proof of payment once settled.`,
            type: 'system'
        });
        await systemMsg.save();

        res.json({ message: 'Payment request sent', request });
    } catch (error) {
        console.error('Send payment request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update Payment Status
const updatePaymentStatus = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { status, amount, proofUrl, notes } = req.body;

        const request = await AdoptionRequest.findById(requestId);
        if (!request) return res.status(404).json({ message: 'Request not found' });

        const isSeller = request.seller.toString() === req.user._id.toString();
        const isCustomer = request.customer.toString() === req.user._id.toString();
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);

        if (!isSeller && !isCustomer && !isAdmin) return res.status(403).json({ message: 'Unauthorized' });

        // Update logic
        if (proofUrl) request.paymentDetails.paymentProof = proofUrl;
        if (status) request.paymentDetails.paymentStatus = status;
        
        if (amount) {
            request.paymentDetails.paidAmount = (request.paymentDetails.paidAmount || 0) + parseFloat(amount);
            request.paymentDetails.pricingBreakdown.paidAmount = request.paymentDetails.paidAmount;
            request.paymentDetails.pricingBreakdown.balanceDue = request.paymentDetails.pricingBreakdown.totalPrice - request.paymentDetails.paidAmount;
            
            // Auto status update based on amount
            if (request.paymentDetails.pricingBreakdown.balanceDue <= 0) {
                request.paymentDetails.paymentStatus = 'paid_in_full';
            } else if (request.paymentDetails.pricingBreakdown.depositAmount > 0 && request.paymentDetails.paidAmount >= request.paymentDetails.pricingBreakdown.depositAmount) {
                request.paymentDetails.paymentStatus = 'deposit_paid';
            }
        }

        request.paymentDetails.history.push({
            status: request.paymentDetails.paymentStatus,
            amount: amount || 0,
            description: notes || `Payment status updated to ${request.paymentDetails.paymentStatus}`
        });

        if (request.paymentDetails.paymentStatus === 'paid_in_full' || request.paymentDetails.paymentStatus === 'deposit_paid') {
            request.paymentDetails.paidAt = Date.now();
        }

        await request.save();

        const systemMsg = new Message({
            conversation: request.conversation,
            sender: req.user._id,
            content: `💰 **PAYMENT STATUS UPDATED**\n\nNew Status: **${request.paymentDetails.paymentStatus.replace(/_/g, ' ').toUpperCase()}**\nAmount: ₱${(amount || 0).toLocaleString()}\nBalance: ₱${request.paymentDetails.pricingBreakdown.balanceDue.toLocaleString()}`,
            type: 'system'
        });
        await systemMsg.save();

        res.json({ message: 'Payment status updated', request });
    } catch (error) {
        console.error('Update payment status error:', error);
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
    updatePaymentStatus
};
