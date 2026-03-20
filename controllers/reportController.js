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

// Get all reports (Super Admin)
const getAllReports = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        let filter = {};
        if (status) filter.status = status;

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
                totalReports: total
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
