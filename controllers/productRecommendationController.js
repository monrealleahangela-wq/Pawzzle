const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const PetProfile = require('../models/PetProfile');
const Store = require('../models/Store');
const { buildProductCategoryFilter } = require('../utils/productCategories');
const {
  getCustomerVisibleOwnerIds,
  buildCustomerVisibleStoreFilter,
  withCustomerComplianceFilter
} = require('../utils/storeVisibility');
const {
  buildCustomerProductStockFilter,
  hasCustomerAvailableStock
} = require('../services/customerProductAvailabilityService');
const { getCustomerVariantReadiness } = require('../services/customerVariantReadinessService');
const { listCustomerVariants } = require('../services/customerProductVariantService');
const { rankPetFoodProducts } = require('../services/petFoodRecommendationService');

const normalizeCandidateProduct = async product => {
  if (product.productMode !== 'variant') return hasCustomerAvailableStock(product) ? product.toObject() : null;
  const catalog = await listCustomerVariants(product);
  const inStockVariants = catalog.variants.filter(variant => variant.inStock);
  if (!hasCustomerAvailableStock(product, catalog.variants) || !inStockVariants.length) return null;
  const object = product.toObject();
  return {
    ...object,
    normalizedVariants: catalog.variants,
    variantCapabilities: {
      browsingEnabled: catalog.browsingEnabled,
      purchasingEnabled: catalog.purchasingEnabled
    },
    price: Math.min(...inStockVariants.map(variant => Number(variant.price))),
    stockQuantity: catalog.variants.reduce((sum, variant) => sum + Number(variant.availableQuantity || 0), 0),
    images: inStockVariants[0]?.images?.length ? inStockVariants[0].images : object.images
  };
};

const getCustomerProductRecommendations = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

    const allProfiles = await PetProfile.find({ owner: req.user._id })
      .sort({ lastBookedAt: -1, createdAt: -1 })
      .lean();
    const selectedProfiles = req.body.petProfileId
      ? allProfiles.filter(profile => String(profile._id) === String(req.body.petProfileId))
      : allProfiles;
    if (req.body.petProfileId && !selectedProfiles.length) {
      return res.status(404).json({ message: 'The selected pet profile was not found in your account.' });
    }

    const ownerIds = await getCustomerVisibleOwnerIds();
    const stores = await Store.find(withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(ownerIds))).select('_id');
    const storeIds = stores.map(store => store._id);
    const variantReadiness = await getCustomerVariantReadiness();
    const filter = {
      category: buildProductCategoryFilter('Pet Food'),
      isActive: true,
      isDeleted: { $ne: true },
      visibility: { $nin: ['draft', 'hidden'] },
      store: { $in: storeIds }
    };
    if (!variantReadiness.browsingEnabled) filter.productMode = { $ne: 'variant' };
    filter.$and = [await buildCustomerProductStockFilter({
      storeIds,
      variantBrowsingEnabled: variantReadiness.browsingEnabled
    })];

    const productDocuments = await Product.find(filter)
      .populate('store', 'name logo contactInfo.address')
      .sort({ 'ratings.average': -1, createdAt: -1 })
      .limit(200);
    const products = (await Promise.all(productDocuments.map(normalizeCandidateProduct))).filter(Boolean);
    const ranked = rankPetFoodProducts({
      products,
      petProfiles: selectedProfiles,
      budget: req.body.budget,
      limit: 6
    });

    return res.json({
      ...ranked,
      selectedPetProfileId: req.body.petProfileId || null,
      petProfiles: allProfiles.map(profile => ({
        _id: profile._id,
        name: profile.name,
        type: profile.type,
        breed: profile.breed
      })),
      methodology: 'Deterministic ranking uses declared product species suitability, saved pet life stage, current availability, and the customer budget.',
      disclaimer: 'Suggestions are not veterinary or nutritional advice. Review ingredients and consult a veterinarian for allergies or medical dietary needs.'
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('Pet food recommendation error:', error);
    return res.status(500).json({ message: 'Unable to calculate pet food recommendations.' });
  }
};

module.exports = { getCustomerProductRecommendations, normalizeCandidateProduct };
