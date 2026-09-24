const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const layout = read('client/src/components/Layout.js');
const styles = read('client/src/styles/CustomerMarketplace.css');
const pets = read('client/src/pages/customer/Pets.js');
const products = read('client/src/pages/customer/Products.js');
const shops = read('client/src/pages/customer/FindShops.js');
const orders = read('client/src/pages/customer/Orders.js');
const vouchers = read('client/src/pages/customer/Vouchers.js');
const landing = read('client/src/pages/public/Landing.js');
const home = read('client/src/pages/customer/Home.js');

test('Marketplace shell activates only for authenticated customer Marketplace routes', () => {
  assert.match(layout, /const isCustomerMarketplaceRoute = isCustomerUI && customerMarketplacePaths\.some/);
  for (const route of ['/pets', '/products', '/find-shops', '/orders', '/vouchers']) {
    assert.match(layout, new RegExp(route.replace('/', '\\/')));
  }
  assert.match(layout, /isCustomerMarketplaceRoute \? 'customer-marketplace-shell' : ''/);
  assert.match(layout, /isCustomerMarketplaceRoute \? 'customer-marketplace-interface' : ''/);
});

test('customer Marketplace stylesheet cannot style another role shell', () => {
  const selectorLines = styles.split(/\r?\n/).filter((line) => line.includes('{') && line.includes('marketplace-'));
  assert.ok(selectorLines.length > 30);
  for (const selector of selectorLines) {
    assert.match(selector, /customer-marketplace-(shell|interface)/, selector);
  }
  assert.doesNotMatch(styles, /store-owner-ui-shell|staff-ui-shell|super-admin-ui-shell|supplier-ui-shell/);
  assert.doesNotMatch(styles, /landing-page|customer-home/);
  assert.doesNotMatch(styles, /(^|\n)\s*(html|body|:root)\b/);
});

test('all requested customer Marketplace pages opt into the scoped visual system', () => {
  assert.match(pets, /customer-marketplace-page marketplace-catalog marketplace-pets/);
  assert.match(products, /customer-marketplace-page marketplace-catalog marketplace-products/);
  assert.match(shops, /customer-marketplace-page marketplace-shops/);
  assert.match(orders, /customer-marketplace-page marketplace-orders/);
  assert.match(vouchers, /customer-marketplace-page marketplace-vouchers/);
});

test('pets and products keep their data, filters, carts, and detail routes', () => {
  assert.match(pets, /petService\.getAllPets/);
  assert.match(pets, /handleFilterChange/);
  assert.match(pets, /to=\{`\/pets\/\$\{pet\._id\}`\}/);
  assert.match(products, /productService\.getAllProducts/);
  assert.match(products, /handleAddToCart/);
  assert.match(products, /handleBuyNow/);
  assert.match(products, /to=\{`\/products\/\$\{product\._id\}`\}/);
});

test('Find Shops keeps real map, filtering, directions, and store routes', () => {
  assert.match(shops, /storeService\.getStoreLocations/);
  assert.match(shops, /<MapContainer/);
  assert.match(shops, /navigator\.geolocation/);
  assert.match(shops, /getDirections/);
  assert.match(shops, /to=\{`\/stores\/\$\{store\._id\}`\}/);
});

test('orders and vouchers retain existing transaction actions', () => {
  assert.match(orders, /orderService\.getAllOrders/);
  assert.match(orders, /PaymentBreakdown/);
  assert.match(orders, /Rate Rider/);
  assert.match(orders, /Receipt & Details/);
  assert.match(vouchers, /voucherService\.getAvailableVouchers/);
  assert.match(vouchers, /voucherService\.getMyVouchers/);
  assert.match(vouchers, /voucherService\.claimVoucher/);
  assert.match(vouchers, /navigator\.clipboard\.writeText/);
});

test('Marketplace presentation is compact, responsive, accessible, and dark-mode aware', () => {
  assert.match(styles, /--market-cream:\s*#f6efe4/);
  assert.match(styles, /\.customer-marketplace-shell \.marketplace-listing-image \{ height: 9\.75rem/);
  assert.match(styles, /\.customer-marketplace-shell \.marketplace-result-grid/);
  assert.match(styles, /\.customer-marketplace-shell \.marketplace-voucher-card/);
  assert.match(styles, /\.dark \.customer-marketplace-shell/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.doesNotMatch(styles, /overflow-x:\s*hidden/);
});

test('finalized Landing and Customer Home do not consume Marketplace styling', () => {
  assert.doesNotMatch(landing, /CustomerMarketplace\.css|customer-marketplace-/);
  assert.doesNotMatch(home, /CustomerMarketplace\.css|customer-marketplace-/);
});
