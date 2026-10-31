const Cart = require('../models/Cart');
const Store = require('../models/Store');
const Product = require('../models/Product');
const { resolveCustomerProductSelection } = require('../services/customerProductVariantService');

const variantIdOf = item => String(item.productVariant?._id || item.productVariant || item.variantId || '');
const sameCartIdentity = (item, { itemId, itemType, productVariant }) => item.itemType === itemType
    && String(item.itemId) === String(itemId)
    && variantIdOf(item) === String(productVariant || '');

const authoritativeCartItem = async input => {
    if (input.itemType === 'pet') {
        throw Object.assign(new Error('Pets cannot be added to cart. Please use the adoption request in chat.'), { statusCode: 400 });
    }
    if (input.itemType !== 'product') {
        throw Object.assign(new Error('Only marketplace products can be added to this cart.'), { statusCode: 400 });
    }
    const quantity = Number(input.quantity || 1);
    const selection = await resolveCustomerProductSelection({
        productId: input.itemId,
        variantId: input.productVariant || input.variantId,
        quantity,
        requirePurchasable: true
    });
    const store = await Store.findById(selection.product.store).select('name contactInfo.address');
    return {
        itemId: selection.product._id,
        itemType: 'product',
        name: selection.variant
            ? `${selection.product.name} — ${selection.variant.displayName || selection.variant.combinationKey}`
            : selection.product.name,
        price: selection.price,
        quantity,
        image: selection.image,
        storeId: selection.product.store,
        storeName: store?.name || '',
        storeAddress: store?.contactInfo?.address?.city || '',
        ...(selection.variant ? {
            productVariant: selection.variant._id,
            variantSnapshot: {
                sku: selection.variant.sku,
                attributes: selection.variant.attributes,
                image: selection.variant.images?.[0],
                weight: selection.variant.weight,
                weightUnit: selection.variant.weightUnit
            }
        } : {}),
        requiresReselection: false,
        selected: input.selected !== false
    };
};

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
        res.status(error.statusCode || 500).json({ code: error.code, message: error.statusCode ? error.message : 'Server error' });
    }
};

// Sync whole cart from local storage to database
const syncCart = async (req, res) => {
    try {
        const { items } = req.body;
        const normalizedItems = [];
        for (const item of items || []) {
            try {
                normalizedItems.push(await authoritativeCartItem(item));
            } catch (error) {
                if (error.code !== 'VARIANT_SELECTION_REQUIRED') throw error;
                const product = await Product.findOne({ _id: item.itemId, productMode: 'variant', isActive: true, isDeleted: { $ne: true } });
                if (!product) throw error;
                const store = await Store.findById(product.store).select('name contactInfo.address');
                normalizedItems.push({
                    itemId: product._id, itemType: 'product', name: product.name,
                    price: 0, quantity: Number(item.quantity || 1), image: product.images?.[0],
                    storeId: product.store, storeName: store?.name || '',
                    storeAddress: store?.contactInfo?.address?.city || '',
                    requiresReselection: true, selected: false
                });
            }
        }
        let cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            cart = new Cart({ user: req.user._id, items: normalizedItems });
        } else {
            cart.items = normalizedItems;
        }

        await cart.save();
        res.json(cart);
    } catch (error) {
        console.error('Sync cart error:', error);
        res.status(error.statusCode || 500).json({ code: error.code, message: error.statusCode ? error.message : 'Server error' });
    }
};

// Add item to cart
const addToCart = async (req, res) => {
    try {
        const normalized = await authoritativeCartItem(req.body);

        let cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            cart = new Cart({ user: req.user._id, items: [] });
        }

        const itemIndex = cart.items.findIndex(
            (item) => sameCartIdentity(item, normalized)
        );

        if (itemIndex > -1) {
            const nextQuantity = Number(cart.items[itemIndex].quantity) + normalized.quantity;
            const verified = await authoritativeCartItem({ ...normalized, quantity: nextQuantity });
            cart.items[itemIndex].quantity = verified.quantity;
            cart.items[itemIndex].price = verified.price;
        } else {
            cart.items.push(normalized);
        }

        await cart.save();
        res.json(cart);
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(error.statusCode || 500).json({ code: error.code, message: error.statusCode ? error.message : 'Server error' });
    }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
    try {
        const { itemId, itemType } = req.params;
        const productVariant = req.query.productVariant || '';
        let cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            cart.items = cart.items.filter(
                (item) => !sameCartIdentity(item, { itemId, itemType, productVariant })
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
        const { itemId, itemType, quantity, productVariant } = req.body;

        if (quantity < 1) {
            return res.status(400).json({ message: 'Quantity must be at least 1' });
        }

        let cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            const itemIndex = cart.items.findIndex(
                (item) => sameCartIdentity(item, { itemId, itemType, productVariant })
            );
            if (itemIndex > -1) {
                const normalized = await authoritativeCartItem({ itemId, itemType, quantity, productVariant });
                cart.items[itemIndex].quantity = normalized.quantity;
                cart.items[itemIndex].price = normalized.price;
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
        res.status(error.statusCode || 500).json({ code: error.code, message: error.statusCode ? error.message : 'Server error' });
    }
};

// Toggle item selection
const toggleSelection = async (req, res) => {
    try {
        const { itemId, itemType, productVariant } = req.body;
        let cart = await Cart.findOne({ user: req.user._id });

        if (cart) {
            const itemIndex = cart.items.findIndex(
                (item) => sameCartIdentity(item, { itemId, itemType, productVariant })
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
        res.status(error.statusCode || 500).json({ code: error.code, message: error.statusCode ? error.message : 'Server error' });
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
