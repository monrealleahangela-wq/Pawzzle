const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Product = require('../models/Product');
const StockSyncService = require('../services/stockSyncService');
const { createProduct, getAllProducts } = require('../controllers/productController');
const {
  CATEGORY_CONTRACT,
  PRODUCT_CATEGORY_VALUES,
  buildProductCategoryFilter,
  normalizeProductCategory
} = require('../utils/productCategories');
const {
  MAX_CATALOG_IMAGES,
  buildPublicPetFilter,
  filterStoresByDistance,
  isMarketplacePet,
  normalizeCatalogImages,
  normalizeProductWeight
} = require('../utils/catalogListing');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const productData = overrides => ({
  name: 'Harness', category: 'Pet Accessories', description: 'A secure walking harness.',
  shortDescription: 'Walking harness', price: 499, stockQuantity: 4, sku: 'HARNESS-1',
  images: ['https://res.cloudinary.com/example/image/upload/pawzzle/harness.jpg'],
  store: '507f1f77bcf86cd799439011', addedBy: '507f1f77bcf86cd799439012',
  ...overrides
});

test('product package weight is optional, persisted with a unit, and rejects invalid values', () => {
  const legacy = new Product(productData());
  assert.equal(legacy.validateSync(), undefined);
  assert.equal(legacy.weight, undefined);

  const weighted = new Product(productData({ sku: 'HARNESS-2', weight: 750, weightUnit: 'g' }));
  assert.equal(weighted.validateSync(), undefined);
  assert.equal(weighted.weight, 750);
  assert.equal(weighted.weightUnit, 'g');

  assert.throws(() => normalizeProductWeight(-1, 'kg'), /greater than zero/);
  assert.throws(() => normalizeProductWeight(1, 'lb'), /g or kg/);
  assert.deepEqual(normalizeProductWeight('', 'kg'), { weight: undefined, weightUnit: undefined });
});

test('Product schema and creation use the canonical category contract', () => {
  assert.deepEqual(PRODUCT_CATEGORY_VALUES, [
    'Pet Food', 'Pet Accessories', 'Pet Clothing and Accessories', 'Pet Health Care', 'Others'
  ]);
  const canonical = new Product(productData({ category: 'Pet Accessories' }));
  assert.equal(canonical.validateSync(), undefined);
  assert.equal(canonical.category, 'Pet Accessories');

  const compatible = new Product(productData({ category: '  accessories  ' }));
  assert.equal(compatible.validateSync(), undefined);
  assert.equal(compatible.category, 'Pet Accessories');

  const historical = Product.hydrate(productData({ category: ' accessories ' }));
  assert.equal(historical.validateSync(), undefined);

  const invalidCategory = new Product(productData({ category: 'Electronics' })).validateSync();
  assert.ok(invalidCategory?.errors?.category);
});

test('customer category filtering is authoritative, compatible, searchable, and applied before pagination', async () => {
  const originalFind = Product.find;
  const originalCount = Product.countDocuments;
  const records = [
    { _id: 'accessory-1', name: 'Walking Harness', category: 'Pet Accessories', isActive: true, isDeleted: false },
    { _id: 'accessory-2', name: 'Travel Bowl', category: '  accessories ', isActive: true, isDeleted: false },
    { _id: 'food-1', name: 'Dog Food', category: 'Pet Food', isActive: true, isDeleted: false }
  ];
  const matching = filter => records.filter(record => {
    if (filter.category && !new RegExp(filter.category.$regex, filter.category.$options).test(record.category)) return false;
    if (filter.$or) {
      const matchesSearch = filter.$or.some(clause => {
        const [field, expression] = Object.entries(clause)[0];
        return new RegExp(expression.$regex, expression.$options).test(String(record[field] || ''));
      });
      if (!matchesSearch) return false;
    }
    return true;
  });
  Product.find = filter => {
    let skip = 0;
    const rows = matching(filter);
    return {
      populate() { return this; },
      sort() { return this; },
      skip(value) { skip = value; return this; },
      limit(value) { return Promise.resolve(rows.slice(skip, skip + Number(value))); }
    };
  };
  Product.countDocuments = async filter => matching(filter).length;
  const request = query => ({
    query,
    originalUrl: '/api/admin/products',
    user: { _id: '507f1f77bcf86cd799439012', role: 'staff', staffType: 'inventory_staff', store: '507f1f77bcf86cd799439011' }
  });
  const respond = () => {
    const output = { statusCode: 200, body: null };
    output.res = { status(value) { output.statusCode = value; return this; }, json(value) { output.body = value; return this; } };
    return output;
  };

  try {
    const firstPage = respond();
    await getAllProducts(request({ category: 'Accessories', page: 1, limit: 1 }), firstPage.res);
    assert.equal(firstPage.statusCode, 200);
    assert.deepEqual(firstPage.body.products.map(product => product._id), ['accessory-1']);
    assert.equal(firstPage.body.pagination.totalProducts, 2);
    assert.equal(firstPage.body.pagination.totalPages, 2);

    const secondPage = respond();
    await getAllProducts(request({ category: 'Pet Accessories', page: 2, limit: 1 }), secondPage.res);
    assert.deepEqual(secondPage.body.products.map(product => product._id), ['accessory-2']);

    const searched = respond();
    await getAllProducts(request({ category: ' accessories ', search: 'Harness', page: 1, limit: 10 }), searched.res);
    assert.deepEqual(searched.body.products.map(product => product._id), ['accessory-1']);

    const all = respond();
    await getAllProducts(request({ category: '', page: 1, limit: 10 }), all.res);
    assert.equal(all.body.pagination.totalProducts, 3);

    const invalid = respond();
    await getAllProducts(request({ category: 'Electronics' }), invalid.res);
    assert.equal(invalid.statusCode, 400);
    assert.match(invalid.body.message, /Invalid product category filter/);
  } finally {
    Product.find = originalFind;
    Product.countDocuments = originalCount;
  }
});

test('safe Product category compatibility is exact rather than fuzzy', () => {
  assert.equal(normalizeProductCategory('PET FOOD'), 'Pet Food');
  assert.equal(normalizeProductCategory(' Pet Clothing '), 'Pet Clothing and Accessories');
  assert.equal(normalizeProductCategory('toys'), 'Pet Accessories');
  assert.equal(normalizeProductCategory('food supplements'), null);
  assert.equal(buildProductCategoryFilter(''), undefined);
  assert.throws(() => buildProductCategoryFilter('unknown'), /Invalid product category filter/);
});

test('Store forms and Customer filters import the same Product category contract', () => {
  assert.equal(CATEGORY_CONTRACT.length, 5);
  for (const file of [
    'client/src/components/forms/ProductFormModal.js',
    'client/src/pages/admin/ProductInventory.js',
    'client/src/pages/customer/Products.js'
  ]) assert.match(read(file), /PRODUCT_CATEGORIES/);
  assert.match(read('models/Product.js'), /PRODUCT_CATEGORY_VALUES/);
  assert.match(read('routes/products.js'), /normalizeProductCategory/);
  assert.match(read('routes/adminProducts.js'), /normalizeProductCategory/);
});

test('Product category filtering retains public eligibility and runs before database pagination', () => {
  const controller = read('controllers/productController.js');
  assert.match(controller, /isActive: true, isDeleted: \{ \$ne: true \}/);
  assert.match(controller, /buildCustomerVisibleStoreFilter/);
  assert.match(controller, /filter\.store = \{ \$in: visibleStores/);
  assert.ok(controller.indexOf('buildProductCategoryFilter(category)') < controller.indexOf('.skip(skip)'));
  assert.match(controller, /Product\.countDocuments\(filter\)/);
});

test('seller product creation persists normalized weight, cover order, and server-owned relationships', async () => {
  const originalSave = Product.prototype.save;
  const originalFindById = Product.findById;
  const originalInitialize = StockSyncService.initializeInventoryForProduct;
  let saved;
  Product.prototype.save = async function save() {
    const error = this.validateSync();
    if (error) throw error;
    saved = this.toObject();
    return this;
  };
  Product.findById = () => ({ populate: async () => saved });
  StockSyncService.initializeInventoryForProduct = async () => {};
  const req = {
    user: { _id: '507f1f77bcf86cd799439012', role: 'store_owner', store: '507f1f77bcf86cd799439011' },
    body: {
      ...productData({ weight: '750', weightUnit: 'g', images: ['/front.jpg', '/side.jpg', '/front.jpg'] }),
      store: '507f1f77bcf86cd799439099', addedBy: '507f1f77bcf86cd799439098', isDeleted: true
    }
  };
  let statusCode = 200;
  let body;
  const res = { status(value) { statusCode = value; return this; }, json(value) { body = value; return this; } };
  try {
    await createProduct(req, res);
    assert.equal(statusCode, 201);
    assert.equal(body.message, 'Product created successfully');
    assert.equal(saved.weight, 750);
    assert.equal(saved.weightUnit, 'g');
    assert.equal(saved.category, 'Pet Accessories');
    assert.deepEqual(saved.images, ['/front.jpg', '/side.jpg']);
    assert.equal(saved.coverImage, '/front.jpg');
    assert.equal(String(saved.store), '507f1f77bcf86cd799439011');
    assert.equal(String(saved.addedBy), '507f1f77bcf86cd799439012');
    assert.notEqual(saved.isDeleted, true);
  } finally {
    Product.prototype.save = originalSave;
    Product.findById = originalFindById;
    StockSyncService.initializeInventoryForProduct = originalInitialize;
  }
});

test('catalog images preserve legacy single-image records and normalize safe multi-image collections', () => {
  const first = 'https://res.cloudinary.com/example/image/upload/pawzzle/front.jpg';
  const second = 'https://res.cloudinary.com/example/image/upload/pawzzle/side.jpg';
  assert.deepEqual(normalizeCatalogImages([first]), [first]);
  assert.deepEqual(normalizeCatalogImages([first, second, first]), [first, second]);
  assert.throws(() => normalizeCatalogImages([], { required: true }), /At least one image/);
  assert.throws(() => normalizeCatalogImages(Array.from({ length: MAX_CATALOG_IMAGES + 1 }, (_, index) => `/image-${index}.jpg`)), /maximum/);
  assert.throws(() => normalizeCatalogImages(['data:image/png;base64,unsafe']), /valid uploaded image/);
});

test('public pet filter combines authoritative visibility, availability, search, price, and normalized age', () => {
  const filter = buildPublicPetFilter({
    isAvailable: 'true', species: 'dog', breed: 'Lab', gender: 'female', size: 'large',
    minAge: '1', maxAge: '3', minPrice: '1000', maxPrice: '9000', search: 'Molly'
  }, ['store-1']);
  const serialized = JSON.stringify(filter);
  for (const expected of [
    '"listingContext":"marketplace"', '"listingType":"sale"', '"isAvailable":true',
    '"status":"available"', '"species":"dog"', '"gender":"female"', '"size":"large"',
    '"$divide"', '"$gte"', '"$lte"', '"description"'
  ]) assert.match(serialized, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(serialized, /approvalStatus/);
  assert.throws(() => buildPublicPetFilter({ species: 'dragon' }, []), /Invalid species/);
  assert.throws(() => buildPublicPetFilter({ minPrice: 10, maxPrice: 1 }, []), /cannot exceed/);
});

test('marketplace detail compatibility rejects supplier, grouped, and deleted pet records', () => {
  assert.equal(isMarketplacePet({ listingContext: 'marketplace', quantity: 1 }), true);
  assert.equal(isMarketplacePet({ quantity: undefined }), true);
  assert.equal(isMarketplacePet({ listingContext: 'marketplace', listingType: 'sale', quantity: 1 }), true);
  assert.equal(isMarketplacePet({ listingContext: 'marketplace', listingType: 'adoption', quantity: 1 }), false);
  assert.equal(isMarketplacePet({ listingContext: 'supplier_catalog', quantity: 1 }), false);
  assert.equal(isMarketplacePet({ listingContext: 'marketplace', quantity: 2 }), false);
  assert.equal(isMarketplacePet({ listingContext: 'marketplace', quantity: 1, isDeleted: true }), false);
});

test('nearby-store filtering runs before pet pagination using authoritative store coordinates', () => {
  const stores = [
    { _id: 'near', contactInfo: { address: { coordinates: { lat: 14.4791, lng: 120.8970 } } } },
    { _id: 'far', contactInfo: { address: { coordinates: { lat: 14.7, lng: 121.1 } } } },
    { _id: 'missing', contactInfo: { address: {} } }
  ];
  assert.deepEqual(filterStoresByDistance(stores, { lat: 14.4791, lng: 120.8970 }, 5).map(store => store._id), ['near']);
});

test('seller forms and customer detail pages use saved weight and multi-image collections', () => {
  const inventory = read('client/src/pages/admin/ProductInventory.js');
  const compactProduct = read('client/src/components/forms/ProductFormModal.js');
  const productDetail = read('client/src/pages/customer/ProductDetail.js');
  const petsAdmin = read('client/src/pages/admin/Pets.js');
  const compactPet = read('client/src/components/pets/PetListingFormModal.js');

  assert.match(inventory, /weightUnit: 'kg'/);
  assert.match(compactProduct, /Package Weight/);
  assert.match(compactProduct, /multiple accept="image\/\*"/);
  assert.match(productDetail, /setMainImage/);
  assert.match(productDetail, /Package weight/);
  assert.doesNotMatch(productDetail, /product\.weight \|\| '0'/);
  assert.match(petsAdmin, /new Set/);
  assert.match(compactPet, />Cover<\/button>/);
});

test('customer pet list, landing, store, and detail paths share authoritative visibility behavior', () => {
  const petController = read('controllers/petController.js');
  const publicController = read('controllers/publicController.js');
  const storeController = read('controllers/storeController.js');
  const petsPage = read('client/src/pages/customer/Pets.js');
  const petDetail = read('client/src/pages/customer/PetDetail.js');

  assert.match(petController, /buildPublicPetFilter/);
  assert.match(petController, /isMarketplacePet\(pet\)/);
  assert.match(publicController, /Pet\.find\(publicPetFilter\)/);
  assert.match(storeController, /Pet\.find\(buildPublicPetFilter/);
  assert.match(petsPage, /params\.latitude = userLocation\.lat/);
  assert.match(petsPage, /Unable to Load Pets/);
  assert.match(petsPage, /filters\.breed/);
  assert.match(petsPage, /filters\.gender/);
  assert.match(petsPage, /filters\.minAge/);
  assert.match(petDetail, /This pet is unavailable or no longer exists/);
  assert.match(petDetail, /getPetById\(id\)/);
});

test('catalog mutations retain server-owned relationships through explicit allowlists', () => {
  const products = read('controllers/productController.js');
  const pets = read('controllers/petController.js');
  assert.match(products, /PRODUCT_LISTING_FIELDS/);
  assert.match(products, /addedBy: req\.user/);
  assert.match(products, /store: storeId/);
  assert.doesNotMatch(products, /const productData = \{\s*\.\.\.req\.body/);
  assert.match(pets, /PET_LISTING_FIELDS/);
  assert.doesNotMatch(pets.match(/const PET_LISTING_FIELDS = \[([\s\S]*?)\];/)?.[1] || '', /approvalStatus/);
  assert.match(pets, /store: store\._id/);
});
