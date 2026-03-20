const Cart = require('../models/Cart');

// Get user's cart
const getCart = async (req, res) => {
    try {
        let cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            cart = new Cart({ user: req.user._id, items: [] });
            await cart.save();
        }
        res.json(cart);
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Sync whole cart from local storage to database
const syncCart = async (req, res) => {
    try {
        const { items } = req.body;
        let cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            cart = new Cart({ user: req.user._id, items: items || [] });
        } else {
            cart.items = items || [];
        }

        await cart.save();
        res.json(cart);
    } catch (error) {
        console.error('Sync cart error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Add item to cart
const addToCart = async (req, res) => {
    try {
        const { itemId, itemType, name, price, quantity = 1, image, storeName, storeId, storeAddress } = req.body;

        // Block pet items from being added to cart - they should go through adoption chat
        if (itemType === 'pet') {
            return res.status(400).json({ message: 'Pets cannot be added to cart. Please use the adoption request in chat.' });
        }

        let cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            cart = new Cart({ user: req.user._id, items: [] });
        }

        const itemIndex = cart.items.findIndex(
            (item) => item.itemId.toString() === itemId && item.itemType === itemType
        );

        if (itemIndex > -1) {
            cart.items[itemIndex].quantity += quantity;
        } else {
            cart.items.push({ itemId, itemType, name, price, quantity, image, storeName, storeId, storeAddress, selected: true });
        }

        await cart.save();
        res.json(cart);
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
    try {
        const { itemId, itemType } = req.params;
        let cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            cart.items = cart.items.filter(
                (item) => !(item.itemId.toString() === itemId && item.itemType === itemType)
            );
            await cart.save();
            res.json(cart);
        } else {
            res.status(404).json({ message: 'Cart not found' });
        }
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update item quantity
const updateQuantity = async (req, res) => {
    try {
        const { itemId, itemType, quantity } = req.body;

        if (quantity < 1) {
            return res.status(400).json({ message: 'Quantity must be at least 1' });
        }

        let cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            const itemIndex = cart.items.findIndex(
                (item) => item.itemId.toString() === itemId && item.itemType === itemType
            );
            if (itemIndex > -1) {
                cart.items[itemIndex].quantity = quantity;
                await cart.save();
                res.json(cart);
            } else {
                res.status(404).json({ message: 'Item not found in cart' });
            }
        } else {
            res.status(404).json({ message: 'Cart not found' });
        }
    } catch (error) {
        console.error('Update quantity error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Toggle item selection
const toggleSelection = async (req, res) => {
    try {
        const { itemId, itemType } = req.body;
        let cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            const itemIndex = cart.items.findIndex(
                (item) => item.itemId.toString() === itemId && item.itemType === itemType
            );
            if (itemIndex > -1) {
                cart.items[itemIndex].selected = !cart.items[itemIndex].selected;
                await cart.save();
                res.json(cart);
            } else {
                res.status(404).json({ message: 'Item not found in cart' });
            }
        } else {
            res.status(404).json({ message: 'Cart not found' });
        }
    } catch (error) {
        console.error('Toggle selection error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Clear cart
const clearCart = async (req, res) => {
    try {
        let cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            cart.items = [];
            await cart.save();
            res.json(cart);
        } else {
            res.status(404).json({ message: 'Cart not found' });
        }
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getCart,
    syncCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    toggleSelection,
    clearCart
};
