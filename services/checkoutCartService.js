const mongoose = require('mongoose');
const Cart = require('../models/Cart');

const itemKey = item => `${item.itemType}:${String(item.itemId?._id || item.itemId)}`;

const purchasedQuantities = orders => {
  const quantities = new Map();
  for (const order of orders || []) {
    for (const item of order.items || []) {
      const key = itemKey(item);
      quantities.set(key, (quantities.get(key) || 0) + Number(item.quantity || 0));
    }
  }
  return quantities;
};

const subtractPurchasedItems = (cartItems, orders) => {
  const remaining = purchasedQuantities(orders);
  return (cartItems || []).reduce((items, item) => {
    const purchased = remaining.get(itemKey(item)) || 0;
    if (purchased <= 0) {
      items.push(item);
      return items;
    }

    const cartQuantity = Number(item.quantity || 0);
    if (cartQuantity > purchased) {
      item.quantity = cartQuantity - purchased;
      items.push(item);
    }
    remaining.delete(itemKey(item));
    return items;
  }, []);
};

const removePurchasedItemsFromCart = async ({ customerId, orders, paymentId }) => {
  if (!customerId || !paymentId || !orders?.length) return null;
  const checkoutKey = `paymongo:${paymentId}`;

  return mongoose.connection.transaction(async session => {
    const cart = await Cart.findOne({ user: customerId }).session(session);
    if (!cart) return null;
    if ((cart.processedCheckoutKeys || []).some(entry => entry.key === checkoutKey)) return cart;

    cart.items = subtractPurchasedItems(cart.items, orders);
    cart.processedCheckoutKeys.push({ key: checkoutKey, processedAt: new Date() });
    if (cart.processedCheckoutKeys.length > 50) {
      cart.processedCheckoutKeys = cart.processedCheckoutKeys.slice(-50);
    }
    await cart.save({ session });
    return cart;
  });
};

module.exports = {
  removePurchasedItemsFromCart,
  subtractPurchasedItems
};
