const AdoptionRequest = require('../models/AdoptionRequest');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Pet = require('../models/Pet');

// Create an adoption request
const createAdoptionRequest = async (req, res) => {
    try {
        const { petId, conversationId, notes } = req.body;

        // Verify pet and conversation
        const pet = await Pet.findById(petId);
        if (!pet) {
            return res.status(404).json({ message: 'Pet not found' });
        }

        if (pet.status !== 'available') {
            return res.status(400).json({ message: `This pet is currently ${pet.status} and not available for new requests` });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // Check if a request already exists
        const existingRequest = await AdoptionRequest.findOne({ pet: petId, customer: req.user._id });
        if (existingRequest) {
            return res.status(400).json({ message: 'You already have an active adoption request for this pet', request: existingRequest });
        }

        const adoptionRequest = new AdoptionRequest({
            pet: petId,
            customer: req.user._id,
            seller: pet.addedBy,
            store: pet.store,
            conversation: conversationId,
            notes,
            history: [{
                status: 'pending',
                updatedBy: req.user._id,
                reason: 'Initial request'
            }]
        });

        await adoptionRequest.save();

        // Link adoption request to conversation
        conversation.adoptionRequest = adoptionRequest._id;
        await conversation.save();

        // Send system message to chat
        const systemMsg = new Message({
            conversation: conversationId,
            sender: req.user._id,
            content: 'A new inquiry has been submitted.',
            type: 'system'
        });
        await systemMsg.save();

        res.status(201).json({ message: 'Inquiry submitted successfully', request: adoptionRequest });
    } catch (error) {
        console.error('Create adoption request error:', error);
        res.status(500).json({ message: 'Server error' });
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
            reason
        });
        await request.save();

        // Sync Pet status based on adoption status
        if (status === 'reserved' || status === 'approved' || status === 'ready_for_pickup' || status === 'shipped') {
            await Pet.findByIdAndUpdate(request.pet, {
                status: 'reserved',
                isAvailable: false // Once reserved/approved/shipped, it shouldn't be available for new requests
            });
        } else if (status === 'delivered') {
            await Pet.findByIdAndUpdate(request.pet, {
                status: 'adopted',
                isAvailable: false
            });
        } else if (status === 'rejected' || status === 'cancelled') {
            // Check if there are ANY other active approved/delivered requests for this pet
            const otherActiveRequest = await AdoptionRequest.findOne({
                pet: request.pet,
                _id: { $ne: request._id },
                status: { $in: ['reserved', 'approved', 'ready_for_pickup', 'shipped', 'delivered'] }
            });

            if (!otherActiveRequest) {
                const pet = await Pet.findById(request.pet);
                if (pet && (pet.status === 'reserved' || pet.status === 'adopted')) {
                    pet.status = 'available';
                    pet.isAvailable = true;
                    await pet.save();
                }
            }
        }

        // Send system message to chat
        const statusLabels = {
            approved: 'approved ✅',
            rejected: 'rejected ❌',
            ready_for_pickup: 'ready for pickup 🏪',
            shipped: 'shipped 🚚',
            delivered: 'delivered 🏠',
            cancelled: 'cancelled'
        };

        const systemMsg = new Message({
            conversation: request.conversation._id,
            sender: req.user._id,
            content: `Inquiry status has been updated to: ${statusLabels[status] || status}` + (reason ? `\nReason: ${reason}` : ''),
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

module.exports = {
    createAdoptionRequest,
    updateAdoptionStatus,
    getMyAdoptionRequests,
    getAdoptionByConversation,
    cancelAdoptionRequest
};
