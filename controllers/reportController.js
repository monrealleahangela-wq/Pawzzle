const Report = require('../models/Report');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Store = require('../models/Store');
const mongoose = require('mongoose');

// Create a report (Any authenticated user)
const createReport = async (req, res) => {
    try {
        const { reportedUserId, reason, details, description, evidence, reportType, storeId } = req.body;

        const reportedUser = await User.findById(reportedUserId);
        if (!reportedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const report = new Report({
            reporter: req.user._id,
            reportedUser: reportedUserId,
            reason: reason || 'other',
            details: details || description || 'No details provided',
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
            message: `A report has been filed against your account for: ${reason || 'Policy violation'}. Our team is reviewing it.`,
            relatedId: report._id,
            relatedModel: 'Report'
        }).save();

        res.status(201).json({ message: 'Report submitted successfully', report });
    } catch (error) {
        console.error('Create report error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all reports (Super Admin)
const getAllReports = async (req, res) => {
    try {
        const { status, page = 1, limit = 10, search, dateRange, storeId } = req.query;
        let filter = { isDeleted: { $ne: true } };
        
        if (status && status !== '' && status !== 'all') {
            filter.status = status;
        }

        if (storeId) {
            filter.store = storeId;
        }

        // Apply dateRange filter
        if (dateRange) {
            const now = new Date();
            let startDate;
            if (dateRange === 'today') {
                startDate = new Date(now.setHours(0, 0, 0, 0));
            } else if (dateRange === 'week') {
                startDate = new Date(now.setDate(now.getDate() - 7));
            } else if (dateRange === 'month') {
                startDate = new Date(now.setMonth(now.getMonth() - 1));
            }

            if (startDate) {
                filter.createdAt = { $gte: startDate };
            }
        }

        // Apply search filter
        if (search && search !== '') {
            const matchedUsers = await User.find({
                $or: [
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { username: { $regex: search, $options: 'i' } }
                ]
            }, '_id');

            const userIds = matchedUsers.map(u => u._id);

            filter.$or = [
                { reporter: { $in: userIds } },
                { reportedUser: { $in: userIds } },
                { details: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
                { adminNotes: { $regex: search, $options: 'i' } }
            ];

            if (mongoose.Types.ObjectId.isValid(search)) {
                filter.$or.push({ _id: search });
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const reports = await Report.find(filter)
            .populate('reporter', 'firstName lastName username email avatar')
            .populate('reportedUser', 'firstName lastName username email avatar')
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

// Update report status & take action (Super Admin)
const updateReportStatus = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { status, adminNotes, actionTaken } = req.body;

        const report = await Report.findById(reportId).populate('reportedUser');
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
                    user.deactivationReason = `ACCOUNT ${actionTaken.toUpperCase()}: ${adminNotes || report.reason}`;
                    user.deactivatedAt = new Date();
                    await user.save();
                }

                // Notify User
                await new Notification({
                    recipient: user._id,
                    type: 'user_action',
                    title: `Account Action: ${actionTaken.toUpperCase()}`,
                    message: `After reviewing a report, the administration has issued a ${actionTaken}. Reason: ${adminNotes || 'Policy violation'}.`,
                    relatedId: report._id,
                    relatedModel: 'Report'
                }).save();
            }
        }

        await report.save();
        res.json({ message: 'Report updated and action taken', report });
    } catch (error) {
        console.error('Update report error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    createReport,
    getAllReports,
    updateReportStatus
};
