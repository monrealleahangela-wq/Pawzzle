const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Store = require('../models/Store');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Order = require('../models/Order');

const modelMap = {
    pets: Pet,
    products: Product,
    services: Service,
    stores: Store,
    users: User,
    bookings: Booking,
    orders: Order
};

const labelMap = {
    pets: { name: 'name', secondary: 'breed' },
    products: { name: 'name', secondary: 'category' },
    services: { name: 'name', secondary: 'category' },
    stores: { name: 'name', secondary: 'businessType' },
    users: { name: 'username', secondary: 'email' },
    bookings: { name: '_id', secondary: 'status' },
    orders: { name: 'orderNumber', secondary: 'status' }
};

// Get all archived (soft-deleted) items across all types
const getArchivedItems = async (req, res) => {
    try {
        const { type = 'all', search, page = 1, limit = 20 } = req.query;

        const results = {};
        const typesToQuery = type === 'all' ? Object.keys(modelMap) : [type];

        for (const t of typesToQuery) {
            const Model = modelMap[t];
            if (!Model) continue;

            const filter = { isDeleted: true };

            if (search && search !== '') {
                const fields = labelMap[t];
                filter.$or = [
                    { [fields.name]: { $regex: search, $options: 'i' } }
                ];
                if (fields.secondary) {
                    filter.$or.push({ [fields.secondary]: { $regex: search, $options: 'i' } });
                }
            }

            let query = Model.find(filter).sort({ updatedAt: -1 });

            // Add populates based on type
            if (t === 'pets') {
                query = query.populate('addedBy', 'username firstName lastName').populate('store', 'name');
            } else if (t === 'products') {
                query = query.populate('addedBy', 'username firstName lastName').populate('store', 'name');
            } else if (t === 'services') {
                query = query.populate('addedBy', 'username firstName lastName').populate('store', 'name');
            } else if (t === 'stores') {
                query = query.populate('owner', 'username firstName lastName');
            } else if (t === 'bookings') {
                query = query.populate('customer', 'firstName lastName').populate('service', 'name');
            } else if (t === 'orders') {
                query = query.populate('customer', 'firstName lastName');
            }

            if (type !== 'all') {
                const skip = (page - 1) * limit;
                query = query.skip(skip).limit(parseInt(limit));
            } else {
                query = query.limit(50);
            }

            results[t] = await query;
        }

        // If querying a single type, include count for pagination
        if (type !== 'all') {
            const Model = modelMap[type];
            const filter = { isDeleted: true };
            if (search) {
                const fields = labelMap[type];
                filter.$or = [{ [fields.name]: { $regex: search, $options: 'i' } }];
                if (fields.secondary) filter.$or.push({ [fields.secondary]: { $regex: search, $options: 'i' } });
            }
            const total = await Model.countDocuments(filter);
            return res.json({
                items: results[type],
                type,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    hasNext: page * limit < total,
                    hasPrev: page > 1
                }
            });
        }

        // Get counts for summary
        const counts = {};
        for (const t of Object.keys(modelMap)) {
            counts[t] = await modelMap[t].countDocuments({ isDeleted: true });
        }

        res.json({ results, counts });
    } catch (error) {
        console.error('Get archived items error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Restore a soft-deleted item
const restoreItem = async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = modelMap[type];

        if (!Model) {
            return res.status(400).json({ message: 'Invalid item type' });
        }

        const item = await Model.findById(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        if (!item.isDeleted) {
            return res.status(400).json({ message: 'Item is not archived' });
        }

        item.isDeleted = false;
        // Reactivate if applicable
        if (item.isActive !== undefined) item.isActive = true;
        await item.save();

        res.json({ message: `${type.slice(0, -1)} restored successfully`, item });
    } catch (error) {
        console.error('Restore item error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Permanently delete an item
const permanentDelete = async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = modelMap[type];

        if (!Model) {
            return res.status(400).json({ message: 'Invalid item type' });
        }

        const item = await Model.findById(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        if (!item.isDeleted) {
            return res.status(400).json({ message: 'Item must be archived before permanent deletion' });
        }

        await Model.findByIdAndDelete(id);

        res.json({ message: `${type.slice(0, -1)} permanently deleted` });
    } catch (error) {
        console.error('Permanent delete error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getArchivedItems,
    restoreItem,
    permanentDelete
};
