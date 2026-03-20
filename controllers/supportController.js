const SupportMessage = require('../models/SupportMessage');
const User = require('../models/User');

// Create a support message (Public/Guest)
const createSupportMessage = async (req, res) => {
    try {
        const { email, subject, message } = req.body;

        if (!email || !message) {
            return res.status(400).json({ message: 'Email and message are required' });
        }

        // Try to link to a user if email matches
        const user = await User.findOne({ email });

        const newSupportMessage = new SupportMessage({
            email,
            subject: subject || 'Account Recovery Request',
            message,
            user: user ? user._id : null
        });

        await newSupportMessage.save();

        res.status(201).json({
            success: true,
            message: 'Support request sent successfully. Our team will review your request.',
            supportId: newSupportMessage._id
        });
    } catch (error) {
        console.error('Create support message error:', error);
        res.status(500).json({ message: 'Server error while sending support request' });
    }
};

// Get all support messages (Super Admin only)
const getAllSupportMessages = async (req, res) => {
    try {
        console.log('--- GET ALL SUPPORT MESSAGES ---');
        console.log('Query:', req.query);
        const { status, page = 1, limit = 10 } = req.query;
        const query = {};
        if (status) query.status = status;

        console.log('Executing messages query...');
        const messages = await SupportMessage.find(query)
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .populate('user', 'username firstName lastName role');

        console.log(`Found ${messages.length} messages`);
        console.log('Counting total messages...');
        const totalMessages = await SupportMessage.countDocuments(query);

        res.json({
            messages,
            pagination: {
                totalMessages,
                totalPages: Math.ceil(totalMessages / parseInt(limit)),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('Get all support messages error:', error);
        res.status(500).json({ 
            message: 'Server error while fetching support messages',
            error: error.message 
        });
    }
};

// Update support message status (Super Admin only)
const updateSupportMessageStatus = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status, adminNotes } = req.body;

        const supportMessage = await SupportMessage.findById(messageId);
        if (!supportMessage) {
            return res.status(404).json({ message: 'Support message not found' });
        }

        if (status) supportMessage.status = status;
        if (adminNotes !== undefined) supportMessage.adminNotes = adminNotes;

        await supportMessage.save();

        res.json({
            success: true,
            message: 'Support request updated successfully',
            supportMessage
        });
    } catch (error) {
        console.error('Update support message error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    createSupportMessage,
    getAllSupportMessages,
    updateSupportMessageStatus
};
