const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Product = require('../models/Product');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');
const { calculateOrderPricing } = require('../services/orderPricingService');
const { recalculateBooking } = require('../services/bookingLifecycleService');
const { amountCentavos } = require('../services/paymentReconciliationService');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const verifiedStore = {
  _id: 'store-1',
  owner: 'owner-1',
  name: 'Pawzzle Store',
  isActive: true,
  isDeleted: false,
  verificationStatus: 'verified',
  businessCompliance: { restrictionReasons: [], documents: [] },
  taxProfile: { verificationStatus: 'verified' },
  taxConfiguration: {
    isConfigured: true,
    taxStatus: 'non_vat',
    pricingMode: 'inclusive',
    vatRatePercent: 0,
    deliveryFeeTaxable: false
  },
  contactInfo: { address: {} }
};

const percentageVoucher = {
  _id: 'voucher-1',
  code: 'SAVE20',
  discountType: 'percentage',
  discountValue: 20,
  minPurchase: 0,
  startDate: new Date('2020-01-01T00:00:00.000Z'),
  endDate: new Date('2100-01-01T00:00:00.000Z'),
  usageLimit: null,
  usedCount: 0,
  isActive: true,
  store: 'store-1'
};

test('cart reuses the Product store relationship and links to the existing public Store profile', () => {
  const landing = read('controllers/publicController.js');
  const home = read('client/src/pages/customer/Home.js');
  const cart = read('client/src/pages/customer/Cart.js');
  const routes = read('client/src/App.js');

  assert.match(landing, /select\('name price images category stockQuantity store'\)/);
  assert.match(landing, /populate\('store', 'name contactInfo\.address'\)/);
  assert.match(home, /storeName: product\.store\?\.name/);
  assert.match(home, /storeId: product\.store\?\._id/);
  assert.match(cart, /to=\{`\/stores\/\$\{item\.storeId\}`\}/);
  assert.match(cart, /aria-label=\{`View \$\{item\.storeName\} store`\}/);
  assert.match(routes, /path="stores\/:storeId" element=\{<StoreDetail \/>\}/);
});

test('product voucher totals stay authoritative when the voucher is removed or quantity changes', async () => {
  const originals = {
    productFindById: Product.findById,
    storeFindById: Store.findById,
    voucherFindOne: Voucher.findOne
  };
  Product.findById = async () => ({
    _id: 'product-1',
    name: 'Dog Food',
    price: 500,
    stockQuantity: 10,
    isActive: true,
    store: 'store-1',
    images: ['dog-food.jpg']
  });
  Store.findById = async () => verifiedStore;
  Voucher.findOne = async query => {
    assert.equal(query.store, 'store-1');
    return percentageVoucher;
  };

  try {
    const baseRequest = {
      requestedDeliveryMethod: 'pickup',
      shippingAddress: {},
      items: [{ itemType: 'product', itemId: 'product-1', quantity: 1 }]
    };
    const applied = await calculateOrderPricing({ ...baseRequest, voucherCode: 'SAVE20' });
    const removed = await calculateOrderPricing({ ...baseRequest, voucherCode: null });
    const changed = await calculateOrderPricing({
      ...baseRequest,
      items: [{ itemType: 'product', itemId: 'product-1', quantity: 2 }],
      voucherCode: 'SAVE20'
    });

    assert.deepEqual(
      {
        subtotal: applied.pricingBreakdown.subtotal,
        discount: applied.pricingBreakdown.discountAmount,
        total: applied.pricingBreakdown.finalTotal
      },
      { subtotal: 500, discount: 100, total: 400 }
    );
    assert.equal(removed.pricingBreakdown.finalTotal, 500);
    assert.deepEqual(
      {
        subtotal: changed.pricingBreakdown.subtotal,
        discount: changed.pricingBreakdown.discountAmount,
        total: changed.pricingBreakdown.finalTotal
      },
      { subtotal: 1000, discount: 200, total: 800 }
    );
    assert.equal(amountCentavos({ totalAmount: changed.pricingBreakdown.finalTotal }, 'order'), 80000);
  } finally {
    Product.findById = originals.productFindById;
    Store.findById = originals.storeFindById;
    Voucher.findOne = originals.voucherFindOne;
  }
});

test('checkout verifies product vouchers against the authoritative quote', () => {
  const checkout = read('client/src/pages/customer/Checkout.js');
  assert.match(checkout, /const quotedStoreId = pricingQuote\?\.store\?\._id/);
  assert.match(checkout, /const quotedSubtotal = Number\(pricingQuote\?\.pricingBreakdown\?\.subtotal\)/);
  assert.match(checkout, /storeId: quotedStoreId,[\s\S]*purchaseAmount: quotedSubtotal/);
  assert.doesNotMatch(checkout, /checkoutItems\[0\]\?\.storeId/);
});

test('service voucher uses the complete dynamic subtotal through booking and PayMongo', async () => {
  const originalVoucherFindById = Voucher.findById;
  Voucher.findById = async () => percentageVoucher;
  const service = {
    price: 500,
    homeServiceAvailable: true,
    homeServicePrice: 100,
    pricingRules: { petSize: { enabled: true, large: 200 } },
    addOns: [{ _id: 'addon-1', name: 'Nail trim', price: 150, duration: 0, isActive: true }]
  };
  const booking = {
    pet: { size: 'Large' },
    bookingDate: new Date('2030-06-10T00:00:00.000Z'),
    startTime: '10:00',
    isHomeService: true,
    selectedAddOns: [{ addOnId: 'addon-1' }],
    selectedConditions: [],
    voucher: 'voucher-1'
  };

  try {
    const pricing = await recalculateBooking(booking, service, verifiedStore);
    assert.deepEqual(
      {
        subtotal: pricing.breakdown.subtotal,
        discount: pricing.discountAmount,
        total: pricing.breakdown.finalPrice
      },
      { subtotal: 950, discount: 190, total: 760 }
    );
    assert.equal(amountCentavos({ totalPrice: pricing.breakdown.finalPrice }, 'booking'), 76000);
  } finally {
    Voucher.findById = originalVoucherFindById;
  }

  const bookings = read('client/src/pages/customer/Bookings.js');
  assert.match(bookings, /const \{ breakdown \} = calculateServicePrice\([\s\S]*purchaseAmount: breakdown\.subtotal/);
  assert.doesNotMatch(bookings, /let purchaseAmount = selectedService\.price/);
});
