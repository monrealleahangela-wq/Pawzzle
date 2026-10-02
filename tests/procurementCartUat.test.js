const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateProcurementQuantity,
  groupProcurementItemsBySupplier
} = require('../utils/procurementCart');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('procurement quantity validation enforces whole, minimum, and available quantities', () => {
  assert.deepEqual(validateProcurementQuantity({ quantity: 5, minimumOrderQuantity: 2, availableStock: 8 }), { valid: true, quantity: 5 });
  assert.equal(validateProcurementQuantity({ quantity: 1, minimumOrderQuantity: 2, availableStock: 8 }).reason, 'below_minimum');
  assert.equal(validateProcurementQuantity({ quantity: 9, minimumOrderQuantity: 2, availableStock: 8 }).reason, 'insufficient_stock');
  assert.equal(validateProcurementQuantity({ quantity: 2.5, minimumOrderQuantity: 2, availableStock: 8 }).reason, 'positive_whole_number');
});

test('mixed supplier lines group deterministically into supplier-specific requests', () => {
  const supplierA = { _id: 'supplier-a', businessName: 'A' };
  const supplierB = { _id: 'supplier-b', businessName: 'B' };
  const groups = groupProcurementItemsBySupplier([
    { supplier: supplierA, orderItem: { supplierProduct: 'a-1', quantity: 2 } },
    { supplier: supplierB, orderItem: { supplierProduct: 'b-1', quantity: 3 } },
    { supplier: supplierA, orderItem: { supplierProduct: 'a-2', quantity: 4 } }
  ]);
  assert.equal(groups.size, 2);
  assert.deepEqual(groups.get('supplier-a').items.map(item => item.supplierProduct), ['a-1', 'a-2']);
  assert.deepEqual(groups.get('supplier-b').items.map(item => item.supplierProduct), ['b-1']);
});

test('procurement cart is a persistent per-user, per-store document with supplier identity per line', () => {
  const model = read('models/ProcurementCart.js');
  assert.match(model, /user:[\s\S]*ref: 'User'[\s\S]*required: true/);
  assert.match(model, /store:[\s\S]*ref: 'Store'[\s\S]*required: true/);
  assert.match(model, /supplierProduct:[\s\S]*ref: 'SupplierProduct'/);
  assert.match(model, /supplier:[\s\S]*ref: 'Supplier'/);
  assert.match(model, /addedUnitPrice/);
  assert.match(model, /index\(\{ user: 1, store: 1 \}, \{ unique: true \}\)/);
});

test('cart endpoints are authenticated and require procurement management permission', () => {
  const routes = read('routes/purchaseOrders.js');
  for (const route of ['/cart/current', '/cart/items', '/cart', '/cart/submit']) {
    assert.match(routes, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(routes, /cart\/current'[\s\S]*requirePermission\('procurement\.manage'\)/);
  assert.match(routes, /cart\/submit'[\s\S]*requirePermission\('procurement\.manage'\)/);
  assert.ok(routes.indexOf("'/cart/current'") < routes.indexOf("'/:id'"), 'cart routes must precede the generic purchase-order id route');
});

test('cart mutations derive supplier and store authority on the server', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const addSection = controller.match(/const addProcurementCartItem[\s\S]*?const updateProcurementCartItem/)?.[0] || '';
  assert.match(addSection, /const store = await resolveUserStore\(req\.user\)/);
  assert.match(addSection, /const supplier = await Supplier\.findById\(product\.supplier\)/);
  assert.match(addSection, /supplier: product\.supplier/);
  assert.match(addSection, /const existing = cart\.items\.find/);
  assert.match(addSection, /existing\.quantity = nextQuantity/);
  assert.doesNotMatch(addSection, /req\.body\.(supplierId|storeId|price|unitPrice|ownerId)/);
});

test('submission revalidates products, suppliers, quantities, prices, and store mappings', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const submit = controller.match(/const submitProcurementCart[\s\S]*?const createPurchaseOrder/)?.[0] || '';
  assert.match(submit, /SupplierProduct\.find\(\{ _id: \{ \$in: productIds \} \}\)/);
  assert.match(submit, /isSupplierSelectableForStore\(supplier, store\)/);
  assert.match(submit, /validateProcurementQuantity/);
  assert.match(submit, /Product\.find\(\{ _id: \{ \$in: mappedProductIds \}, store/);
  assert.match(submit, /PROCUREMENT_CART_PRICE_CHANGED/);
  assert.match(submit, /addedUnitPrice = product\.wholesalePrice/);
});

test('multi-supplier submission is atomic and clears the cart only after all orders are created', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const submit = controller.match(/const submitProcurementCart[\s\S]*?const createPurchaseOrder/)?.[0] || '';
  assert.match(submit, /mongoose\.connection\.transaction/);
  assert.match(submit, /groupProcurementItemsBySupplier\(resolvedCartItems\)/);
  assert.match(submit, /for \(const \{ supplier, items \} of groups\.values\(\)\)/);
  assert.match(submit, /supplier: supplier\._id/);
  assert.match(submit, /await order\.save\(\{ session \}\)/);
  assert.ok(submit.indexOf('cart.items = []') > submit.indexOf('await order.save({ session })'));
  assert.match(submit, /Your procurement cart was preserved/);
});

test('purchase orders remain inherently single-supplier and snapshot authoritative product pricing', () => {
  const model = read('models/PurchaseOrder.js');
  const controller = read('controllers/purchaseOrderController.js');
  assert.match(model, /supplier:[\s\S]*ref: 'Supplier'[\s\S]*required: true/);
  assert.match(model, /unitPrice:[\s\S]*required: true/);
  assert.match(controller, /unitPrice: product\.wholesalePrice/);
  assert.match(controller, /totalPrice: product\.wholesalePrice \* quantity/);
});

test('procurement UI loads persisted cart and no longer clears it while changing suppliers', () => {
  const page = read('client/src/pages/admin/PurchaseOrders.js');
  const service = read('client/src/services/apiService.js');
  assert.match(page, /purchaseOrderService\.getCart\(\)/);
  assert.match(page, /purchaseOrderService\.addCartItem/);
  assert.match(page, /Object\.values\(groupedCart\)/);
  assert.match(page, /Creates 1 supplier-specific purchase request/);
  const browse = page.match(/const browseCatalog[\s\S]*?const inviteSupplier/)?.[0] || '';
  assert.doesNotMatch(browse, /setProcurementCart|setCart/);
  assert.match(service, /submitCart: \(data = \{\}\) => api\.post\('\/purchase-orders\/cart\/submit'/);
});

test('customer cart remains separate and unchanged by procurement persistence', () => {
  const customerModel = read('models/Cart.js');
  const procurementModel = read('models/ProcurementCart.js');
  assert.match(customerModel, /enum: \['pet', 'product', 'service'\]/);
  assert.doesNotMatch(customerModel, /SupplierProduct|ProcurementCart/);
  assert.match(procurementModel, /itemType/);
  assert.doesNotMatch(procurementModel, /selected/);
});
