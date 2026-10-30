const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const Product = require('../models/Product');
const SupplierProduct = require('../models/SupplierProduct');
const ProductVariant = require('../models/ProductVariant');
const SupplierProductVariant = require('../models/SupplierProductVariant');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const id = () => new mongoose.Types.ObjectId();
const attributes = (flavor, size = '1_kg') => [
  { code: 'flavor', label: 'Flavor', valueCode: flavor, valueLabel: flavor },
  { code: 'size', label: 'Size', valueCode: size, valueLabel: size }
];

test('isolated MongoDB enforces parent combinations and owner-scoped variant SKUs', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_product_variants_${crypto.randomBytes(7).toString('hex')}`;

  mongoose.set('autoIndex', false);
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    await Promise.all([ProductVariant.syncIndexes(), SupplierProductVariant.syncIndexes()]);

    const storeA = id();
    const storeB = id();
    const parentBase = {
      productMode: 'variant', name: 'Premium food', category: 'food', description: 'Food',
      shortDescription: 'Food', price: 100, stockQuantity: 0, images: ['/food.jpg'], addedBy: id()
    };
    const productA = await Product.create({ ...parentBase, store: storeA, sku: 'PARENT-A' });
    const productB = await Product.create({ ...parentBase, store: storeA, sku: 'PARENT-B' });
    const productC = await Product.create({ ...parentBase, store: storeB, sku: 'PARENT-C' });

    await ProductVariant.create({
      product: productA._id, attributes: attributes('chicken'), sku: 'FOOD-1KG', price: 150
    });
    await assert.rejects(ProductVariant.create({
      product: productA._id,
      attributes: [...attributes('chicken')].reverse(),
      sku: 'FOOD-DUPLICATE-COMBINATION',
      price: 150
    }), error => error.code === 'DUPLICATE_VARIANT_COMBINATION' || error.code === 11000);
    await assert.rejects(ProductVariant.create({
      product: productB._id, attributes: attributes('beef'), sku: 'food-1kg', price: 160
    }), error => error.code === 'DUPLICATE_VARIANT_SKU' || error.code === 11000);
    const otherStoreVariant = await ProductVariant.create({
      product: productC._id, attributes: attributes('beef'), sku: 'food-1kg', price: 160
    });
    assert.equal(otherStoreVariant.normalizedSku, 'FOOD-1KG');

    const supplierA = id();
    const supplyBase = {
      productMode: 'variant', supplier: supplierA, category: 'pet_food', wholesalePrice: 100, availableStock: 0
    };
    const supplyA = await SupplierProduct.create({ ...supplyBase, name: 'Supply A', sku: 'SUPPLY-A' });
    const supplyB = await SupplierProduct.create({ ...supplyBase, name: 'Supply B', sku: 'SUPPLY-B' });
    await SupplierProductVariant.create({
      supplierProduct: supplyA._id, attributes: attributes('chicken'), sku: 'SUP-1KG', wholesalePrice: 120
    });
    await assert.rejects(SupplierProductVariant.create({
      supplierProduct: supplyB._id, attributes: attributes('beef'), sku: 'sup-1kg', wholesalePrice: 125
    }), error => error.code === 'DUPLICATE_VARIANT_SKU' || error.code === 11000);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
