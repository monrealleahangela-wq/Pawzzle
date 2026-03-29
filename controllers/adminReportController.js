const Report = require('../models/Report');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Store = require('../models/Store');

// Create a report against a user
const createReport = async (req, res) => {
    try {
        const { reportedUserId, reason, details, evidence, reportType, storeId } = req.body;

        const reportedUser = await User.findById(reportedUserId);
        if (!reportedUser) {
            return res.status(404).json({ message: 'Reported user not found' });
        }

        const report = new Report({
            reporter: req.user._id,
            reportedUser: reportedUserId,
            reason,
            details,
            evidence: evidence || [],
            reportType: reportType || 'other',
            store: storeId || req.user.store || null
        });

        await report.save();

        // Notify reported user
        await new Notification({
            recipient: reportedUserId,
            sender: req.user._id,
            type: 'report',
            title: 'Report Filed Against You',
            message: `A report has been filed against your account for: ${reason}. Our team is reviewing it.`,
            relatedId: report._id,
            relatedModel: 'Report'
        }).save();

        res.status(201).json({ message: 'Report submitted successfully', report });
    } catch (error) {
        console.error('Create report error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get reports created by the seller or all reports if super admin
const getAllReports = async (req, res) => {
    try {
        const { status, storeId, page = 1, limit = 10 } = req.query;
        let filter = {};

        if (req.user.role === 'super_admin') {
            if (storeId) filter.store = storeId;
        } else if (req.user.role === 'staff') {
            if (req.user.store) {
                filter.store = req.user.store;
            } else {
                return res.status(403).json({ message: 'Staff not assigned to a store' });
            }
        } else {
            // Admin
            const Store = require('../models/Store');
            const adminStores = await Store.find({ owner: req.user._id }).select('_id');
            const storeIds = adminStores.map(s => s._id);

            if (storeId) {
                if (!storeIds.map(id => id.toString()).includes(storeId)) {
                    return res.status(403).json({ message: 'Access denied to this store' });
                }
                filter.store = storeId;
            } else if (storeIds.length > 0) {
                filter.store = { $in: storeIds };
            } else {
                filter.reporter = req.user._id;
            }
        }

        if (status) {
            filter.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const reports = await Report.find(filter)
            .populate('reportedUser', 'firstName lastName email username')
            .populate('reporter', 'firstName lastName username email')
            .populate('store', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Report.countDocuments(filter);

        res.json({
            reports,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalReports: total,
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update report status & take action (Super Admin only)
const updateReportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes, actionTaken } = req.body;

        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Only super admins can update report status' });
        }

        const report = await Report.findById(id).populate('reportedUser');
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        if (status) report.status = status;
        if (adminNotes !== undefined) report.adminNotes = adminNotes;
        if (actionTaken && actionTaken !== 'none') {
            report.actionTaken = actionTaken;
            report.status = 'action_taken';

            // Take actual action on the user
            const user = await User.findById(report.reportedUser._id);
            if (user) {
                if (actionTaken === 'ban' || actionTaken === 'suspension') {
                    user.isActive = false;
                    user.deactivationReason = `ACCOUNT ${actionTaken.toUpperCase()}: ${adminNotes || reason}`;
                    user.deactivatedAt = new Date();
                    await user.save();
                }

                // Notify User
                await new Notification({
                    recipient: user._id,
                    type: 'user_action',
                    title: `Account Action: ${actionTaken.toUpperCase()}`,
                    message: `After reviewing a report, we have decided to issue a ${actionTaken}. Reason: ${adminNotes || 'Policy violation'}.`,
                    relatedId: report._id,
                    relatedModel: 'Report'
                }).save();
            }
        }

        await report.save();
        res.json({ message: 'Report updated and action taken', report });
    } catch (error) {
        console.error('Update report status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    createReport,
    getAllReports,
    updateReportStatus
};
