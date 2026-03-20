const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    getCart,
    syncCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    toggleSelection,
    clearCart
} = require('../controllers/cartController');

// All cart routes require authentication
router.use(authenticate);

// Get user's cart
router.get('/', getCart);

// Sync whole cart
router.post('/sync', syncCart);

// Add item to cart
router.post('/add', addToCart);

// Update item quantity
router.put('/quantity', updateQuantity);

// Toggle item selection
router.put('/toggle', toggleSelection);

// Remove item from cart
router.delete('/remove/:itemType/:itemId', removeFromCart);

// Clear entire cart
router.delete('/clear', clearCart);

module.exports = router;
