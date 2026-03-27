const UserReport = require('../models/UserReport');
const User = require('../models/User');

// Create a report (Seller reporting a customer)
const createReport = async (req, res) => {
    try {
        const { reportedUserId, reason, description, evidence } = req.body;

        const reportedUser = await User.findById(reportedUserId);
        if (!reportedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const report = new UserReport({
            reporter: req.user._id,
            reportedUser: reportedUserId,
            reason,
            description,
            evidence
        });

        await report.save();
        res.status(201).json({ message: 'Report submitted successfully', report });
    } catch (error) {
        console.error('Create report error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const mongoose = require('mongoose');

// Get all reports (Super Admin)
const getAllReports = async (req, res) => {
    try {
        const { status, page = 1, limit = 10, search, dateRange } = req.query;
        let filter = { isDeleted: { $ne: true } };
        
        if (status && status !== '' && status !== 'all') {
            filter.status = status;
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
                { description: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } }
            ];

            if (mongoose.Types.ObjectId.isValid(search)) {
                filter.$or.push({ _id: search });
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const reports = await UserReport.find(filter)
            .populate('reporter', 'firstName lastName username email')
            .populate('reportedUser', 'firstName lastName username email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await UserReport.countDocuments(filter);

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

// Update report status (Super Admin)
const updateReportStatus = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { status, adminNotes } = req.body;

        const report = await UserReport.findByIdAndUpdate(
            reportId,
            { status, adminNotes },
            { new: true }
        );

        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        res.json({ message: 'Report updated', report });
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
